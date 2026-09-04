# Despliegue en OpenShift

Manifiestos para correr SecureVault (frontend + backend + Vault + proxy + backups)
en OpenShift. Están numerados: se aplican en orden.

```
Route (edge TLS)
      │
      ▼
proxy (Caddy :8080)  ──/api,/health──►  backend (:8000) ──► vault (:8200)
      │  ruta secreta + 404 nginx                              ▲
      └──<APP_SECRET_PATH>/*──────────►  frontend (:8080)       │
                                                          CronJob backup ─► PVC backups ◄── backend (ro)
```

## 1. Imágenes (las subís vos al registry)

Tres imágenes propias + dos oficiales espejadas. Reemplazá `REGISTRY` por tu
prefijo de Nexus (ej. `nexus.minfin.gob.gt/securevault`).

```bash
# backend (sirve también para CronJob de backup y Job de bootstrap)
docker build -t REGISTRY/securevault-backend:latest ./backend
docker push  REGISTRY/securevault-backend:latest

# frontend (target `prod` = el default del Dockerfile: build de Vite + Caddy)
docker build -t REGISTRY/securevault-frontend:latest ./frontend
docker push  REGISTRY/securevault-frontend:latest

# oficiales — espejar tal cual (mismo tag)
docker pull hashicorp/vault:1.17  && docker tag hashicorp/vault:1.17  REGISTRY/vault:1.17       && docker push REGISTRY/vault:1.17
docker pull caddy:2-alpine        && docker tag caddy:2-alpine        REGISTRY/caddy:2-alpine   && docker push REGISTRY/caddy:2-alpine
```

## 2. Placeholders a reemplazar en los YAML

| Placeholder | Dónde | Qué es |
|---|---|---|
| `REGISTRY` | 04, 05, 06, 07, 08, 10 | prefijo del registry |
| `securevault` (namespace) | todos | tu proyecto de OpenShift (si usás otro, `sed -i 's/namespace: securevault/namespace: TU-NS/'`) |
| `APP_HOST` | 01 (`CORS_ORIGIN`), 09 (`host`) | hostname público del Route (ej. `securevault.apps.ocp.minfin.gob.gt`) |
| `/CAMBIAR-ESTA-RUTA` | 01 (`APP_SECRET_PATH`) | ruta secreta bajo la que vive la app (ej. `/mf-a1b2c3`). No uses `/`. |
| `securevault-app` (contenido) | 02 | secretos reales (ver abajo) |
| `storageClassName` | 03 | el StorageClass de tu cluster (o dejalo comentado para el default) |

Búsqueda rápida de lo que falta:
```bash
grep -rnE 'REGISTRY|APP_HOST|CAMBIAR-ESTA-RUTA|REEMPLAZAR' openshift/
```

## 3. Orden de aplicación

```bash
oc new-project securevault            # o: oc project securevault (si ya existe)
# Obligatorio antes del 00: un usuario normal no puede crear el Namespace vía
# API cruda (Forbidden), pero sí Role/RoleBinding dentro de un proyecto propio.

# 00 — ServiceAccount/Role para que el bootstrap escriba el Secret de llaves
oc apply -f openshift/00-namespace-rbac.yaml

# 01 — ConfigMaps (config, Caddyfile del proxy, vault.hcl, script de bootstrap)
oc apply -f openshift/01-config.yaml

# 02 — Secret de la app. MEJOR crealo sin archivo:
oc create secret generic securevault-app -n securevault \
  --from-literal=ADMIN_USERNAME='admin.minfin' \
  --from-literal=ADMIN_PASSWORD='...contraseña fuerte...' \
  --from-literal=SESSION_SECRET="$(openssl rand -base64 48)" \
  --from-literal=BACKUP_ENCRYPTION_KEY="$(openssl rand -base64 48)"
#   (o editá y aplicá openshift/02-secrets.yaml)

# 03 — PVCs
oc apply -f openshift/03-pvcs.yaml

# 04 — Vault (StatefulSet). Esperá a que el pod esté Running (arranca SELLADO):
oc apply -f openshift/04-vault.yaml
oc rollout status statefulset/vault -n securevault

# 05 — Bootstrap: inicializa/desella Vault y crea el Secret securevault-vault-keys
oc apply -f openshift/05-vault-bootstrap-job.yaml
oc wait --for=condition=complete job/securevault-vault-bootstrap -n securevault --timeout=300s
oc logs job/securevault-vault-bootstrap -n securevault      # "Bootstrap de Vault completo."

# 06 — Backend (necesita el Secret de llaves ya creado por el paso 05)
oc apply -f openshift/06-backend.yaml
oc rollout status deployment/backend -n securevault

# 07, 08 — Frontend y proxy
oc apply -f openshift/07-frontend.yaml
oc apply -f openshift/08-proxy.yaml
oc rollout status deployment/proxy -n securevault

# 09 — Route
oc apply -f openshift/09-route.yaml

# 10 — CronJob de backup (opcional pero recomendado)
oc apply -f openshift/10-backup-cronjob.yaml
```

## 4. Verificación

```bash
HOST=$(oc get route securevault -n securevault -o jsonpath='{.spec.host}')
curl -sk -o /dev/null -w "raíz  -> %{http_code}\n"  https://$HOST/            # 404 (nginx falso) — correcto
curl -sk -o /dev/null -w "app   -> %{http_code}\n"  https://$HOST/mf-a1b2c3/  # 200
curl -sk                                            https://$HOST/health     # {"status":"ok"...}
```

Entrá a `https://$HOST<APP_SECRET_PATH>/` (con la barra final). Primer login: te
pide configurar MFA. El usuario/clave son los del Secret `securevault-app`.

Probar un backup manual:
```bash
oc create job --from=cronjob/securevault-backup backup-manual -n securevault
oc logs job/backup-manual -n securevault
```

## 5. Notas y operación

- **Vault sellado tras reinicio del pod:** el sidecar `unsealer` del pod de Vault
  lo desella solo con la llave del Secret. Si el pod de Vault se recrea *antes*
  de que exista el Secret (primer arranque interrumpido), volvé a correr el Job:
  ```bash
  oc delete job securevault-vault-bootstrap -n securevault --ignore-not-found
  oc apply -f openshift/05-vault-bootstrap-job.yaml
  ```
- **Guardá una copia del Secret `securevault-vault-keys` fuera del cluster.** Sin
  la `unseal_key` no se puede desellar Vault ni leer las contraseñas de portal ya
  guardadas. Sin `BACKUP_ENCRYPTION_KEY` los `.enc` son irrecuperables.
  ```bash
  oc get secret securevault-vault-keys -n securevault -o jsonpath='{.data.vault-keys\.json}' | base64 -d
  ```
- **Restaurar un backup:** desde la UI (Configuración → Respaldo cifrado →
  Restaurar desde archivo) o con `scripts/restore_backup.py` dentro de un pod del
  backend. Al restaurar se cierra tu sesión (se reemplaza la tabla de sesiones):
  volvés a iniciar sesión.
- **Backup del storage de Vault (contraseñas de portal):** aparte del backup de
  la SQLite, el pod de Vault tiene un sidecar (`vault-backup`) que cada 24h
  respalda cifrado `/vault/data` hacia el PVC `securevault-vault-backups`
  (`backend/scripts/vault_backup_daemon.py`, retención 14 copias). Para
  restaurar: escalar el StatefulSet `vault` a 0, correr
  `scripts/restore_vault_backup.py <backup.tar.enc> /vault/data` sobre el
  volumen, y volver a escalar a 1 (arranca sellado, se desella con la
  `unseal_key` vigente al momento de ese backup). Este backup **no** reemplaza
  la copia externa del Secret `securevault-vault-keys` — sin la `unseal_key`
  correcta para esa fecha, el `.tar.enc` restaurado no se puede leer.
- **Escala:** `backend` y `vault` son 1 réplica a propósito (SQLite y storage
  `file` sobre PVC RWO — `strategy: Recreate`). `frontend` y `proxy` escalan
  libremente.
- **SCC:** las imágenes corren como usuario no-root arbitrario (GID 0). Deberían
  funcionar con la SCC `restricted-v2`. Si algún pod no arranca por permisos,
  revisá `oc get events` y ajustá `fsGroup`/volúmenes.
- **`APP_SECRET_PATH`:** el frontend se compila con rutas de assets relativas, así
  que la ruta secreta se cambia sólo tocando el ConfigMap `securevault-config` y
  reiniciando `proxy` (`oc rollout restart deployment/proxy -n securevault`) — sin
  reconstruir imágenes.
- **Fuentes externas:** `index.html` referencia Google Fonts; en una red que
  bloquea Internet no cargan y la app cae al stack de fuentes del sistema (igual
  que en local). La CSP tampoco las permite — es intencional.
- **Si cambia `vault/bootstrap/bootstrap.py`** en el repo, regenerá el ConfigMap:
  ```bash
  oc create configmap securevault-vault-bootstrap -n securevault \
    --from-file=bootstrap.py=vault/bootstrap/bootstrap.py \
    --dry-run=client -o yaml | oc apply -f -
  ```
