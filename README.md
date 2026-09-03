# SecureVault Local ("ControlCenter")

Gestor interno de credenciales para portales WordPress y aplicaciones internas. Login individual, MFA obligatorio, roles, auditoría, contraseñas guardadas en HashiCorp Vault y backups cifrados automáticos.

## Tecnología

- Backend: Python 3.12, solo librería estándar (`http.server` + `sqlite3`), sin dependencias de PyPI
- Base de datos: SQLite (metadatos) + **HashiCorp Vault** (contraseñas reales de portal, KV v2)
- Frontend: React + TypeScript + Vite
- Proxy HTTPS: Caddy (certificado autofirmado local)
- Backups: cifrados automáticos en un volumen separado
- Ejecución local: Docker Compose · Despliegue: OpenShift (`openshift/`)

> El backend no usa FastAPI, SQLAlchemy ni ningún paquete de PyPI a propósito: así el build de Docker no necesita acceso a `pypi.org`, que está bloqueado en la red de oficina. La comunicación con Vault se hace con `urllib` (API REST plana), sin el cliente oficial `hvac`.

## Ejecutar localmente

```powershell
Copy-Item .env.example .env
docker compose up -d --build
```

- Frontend (solo demo, sin login real): http://localhost:3000

Para levantar todo (backend real, Vault, MFA, HTTPS, backups):

```powershell
docker compose --profile backend up -d --build
```

- **HTTPS (recomendado):** https://localhost:8443 — certificado autofirmado, el navegador va a mostrar una advertencia la primera vez, es esperado en local.
- Frontend directo (HTTP, sin cookie segura): http://localhost:3000
- API directa: http://localhost:8000/health
- UI de Vault: http://localhost:8200/ui (token root en `vault/keys/vault-keys.json`, no compartir)

El usuario inicial se configura con `ADMIN_USERNAME` y `ADMIN_PASSWORD` en `.env`. En el primer login se exige configurar MFA (TOTP) antes de entrar.

## HashiCorp Vault

Las contraseñas de portal **no se guardan en SQLite** — solo una bandera de "tiene contraseña". El valor real vive en Vault (`secret/data/portals/<id>`), cifrado y auditado por Vault mismo.

- `vault-bootstrap` corre una sola vez por cada `docker compose up`: si Vault nunca se inicializó, lo inicializa con una sola clave de unseal (`secret_shares=1`, apropiado para un operador único local) y crea un token de acceso acotado para el backend (solo puede leer/escribir bajo `secret/data/portals/*`, no es el token root). Si ya estaba inicializado, solo lo desella.
- Las claves quedan en `vault/keys/vault-keys.json` (excluido de git). **Guarda una copia de este archivo en un lugar seguro y separado** — sin la `unseal_key` no hay forma de recuperar los secretos guardados en Vault si el volumen de datos sobrevive pero el contenedor se reinicia sin este archivo.
- Vault publica el puerto 8200 solo en `127.0.0.1` (no accesible desde fuera de tu máquina) para poder abrir la UI de administración en http://localhost:8200/ui con el `root_token` de `vault/keys/vault-keys.json`.

## Backups cifrados

El servicio `backup` corre en segundo plano y genera un respaldo cifrado de la base SQLite cada 24h (configurable con `BACKUP_INTERVAL_SECONDS`), en `./backups/` — una carpeta distinta del volumen de datos, simulando "otro disco" según la estrategia 3-2-1 acordada.

- Cifrado: Encrypt-then-MAC con HMAC-SHA256, con `BACKUP_ENCRYPTION_KEY` — una clave completamente separada de las demás (para que comprometer la app no implique comprometer los backups).
- Retención: los últimos 14 backups (`BACKUP_RETENTION_COUNT`).
- Restaurar (dos formas, ambas piden la `BACKUP_ENCRYPTION_KEY` correcta):
  - **Desde la UI** (recomendado): Configuración → *Respaldo cifrado* → *Restaurar desde archivo*. Solo Administrador, pide MFA, guarda una copia de la base actual (`securevault-pre-restore-*.db` en el volumen de datos) antes de sobrescribir y queda auditado. Reemplaza la base viva sin reiniciar el backend (API de backup online de SQLite). Como el restore también reemplaza la tabla de sesiones, al terminar se cierra tu sesión y la UI te lleva de vuelta al login a los 5 s.
  - **Por línea de comandos:**
    ```powershell
    docker compose run --rm backend python scripts/restore_backup.py /backups/securevault-XXXXXXXX-XXXXXX.enc /app/data/securevault.db
    ```
- **Pendiente por tu parte:** esto solo cubre la copia local. Para cumplir 3-2-1 de verdad falta subir `./backups/` a un destino externo (NAS, S3, Backblaze, etc.) — no lo automaticé porque requiere tus credenciales de esa nube. Se puede conectar con `rclone`/`aws s3 sync` apuntando a esa carpeta.
- **Importante:** un backup nunca restaurado no debe asumirse recuperable — probé el ciclo cifrar/descifrar con un archivo de prueba antes de darlo por bueno, pero te recomiendo hacer tú también una restauración de práctica.

## HTTPS

`docker compose --profile backend up` levanta Caddy en `https://localhost:8443` con un certificado autofirmado (CA interna de Caddy, sin configuración manual). Caddy hace de proxy único hacia frontend y backend, agrega cabeceras de seguridad (HSTS, X-Frame-Options, etc.) y con eso `COOKIE_SECURE=true` queda activo por defecto — las cookies de sesión ya no viajan sin cifrar.

Esto significa que el acceso directo por `http://localhost:3000` **deja de mantener sesión iniciada** (la cookie con `Secure` no se guarda sobre HTTP plano). Para seguir usando ese acceso directo en desarrollo rápido sin pasar por Caddy, en tu `.env` local:
```
COOKIE_SECURE=false
CORS_ORIGIN=http://localhost:3000
```

## Ruta secreta (ofuscación)

`APP_SECRET_PATH` en `.env` controla bajo qué ruta se sirve la app:

- `APP_SECRET_PATH=/` (por defecto): la app está en la raíz, `https://localhost:8443/`.
- `APP_SECRET_PATH=/mf-XXXXXX` (o cualquier ruta): `https://localhost:8443/` y cualquier otra ruta devuelven **404**; solo `https://localhost:8443/mf-XXXXXX/` lleva al login.

Es una capa extra para que escáneres automáticos y curiosos vean un 404, **no** un reemplazo del login + MFA. Guarda la ruta en tu gestor de contraseñas y **bookmarkéala con la barra final**. Si se filtra o la olvidas, cambia el valor en `.env` y `docker compose --profile backend up -d --build frontend caddy`. `/api/*` y `/health` siguen en la raíz (necesarios para el healthcheck y las llamadas del propio frontend). El 404 se hace pasar por el de un nginx pelado (`Server: nginx`).

## Despliegue en OpenShift

Manifiestos y guía en [`openshift/`](openshift/README.md): 11 archivos numerados (`00-…` a `10-…`) que se aplican en orden con `oc apply`, más un README con las imágenes a subir al registry y los placeholders a reemplazar (`REGISTRY`, `APP_HOST`, ruta secreta, namespace).

Resumen: 3 imágenes propias (`securevault-backend`, `securevault-frontend`, y las oficiales `vault`/`caddy` espejadas) → Vault como StatefulSet con auto-unseal → Job de bootstrap → backend/frontend/proxy como Deployments → Route con TLS edge → CronJob de backup diario.

## Roles y permisos

Roles reales en el backend: `Administrador`, `Operador`, `Auditor`. La interfaz solo distingue Administrador (acceso completo) del resto (solo consulta y apertura de portales).

## Auditoría

Toda acción sensible (login, MFA, crear/editar/eliminar portal, copiar usuario, revelar contraseña, cambio de logo, reset de MFA) queda en la tabla `audit_logs`, visible en la pestaña Actividad para Administradores.

## Principios de seguridad vigentes

- No se almacenan contraseñas reales en texto plano en ningún punto (SQLite guarda solo metadatos; el secreto vive en Vault).
- La clave maestra de backups está separada de la base de datos y de Vault.
- `.env`, las claves de Vault y los backups están excluidos de git (`.gitignore`).
- MFA obligatorio desde el primer login, antes de introducir cualquier credencial real.
- Reautenticación no implementada aún para acciones críticas puntuales (queda pendiente si se requiere más adelante).

## Pendiente para producción

- Importar los registros reales del Excel — solo después de validar todo lo anterior en este entorno local.
- HTTPS con certificado público (hoy es autofirmado, válido solo para uso local).
- Subida automática de backups a un destino externo (nube/NAS) con credenciales del operador.
- LDAP/OIDC corporativo en vez de login local.
- Rate limiting más agresivo, reverse proxy con hardening adicional, despliegue institucional (OpenShift).
