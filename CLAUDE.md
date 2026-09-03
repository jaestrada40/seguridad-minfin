# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

SecureVault Local ("ControlCenter" en la UI) — gestor interno de credenciales para portales WordPress y aplicaciones institucionales. UI en español. Ya tiene login individual, MFA obligatorio (TOTP), roles, auditoría, contraseñas reales en HashiCorp Vault, backups cifrados automáticos y HTTPS local vía Caddy — ver README.md para el detalle de cada pieza y lo que sigue pendiente (LDAP/OIDC corporativo, HTTPS con certificado público, subida de backups a nube).

## Arquitectura

Dos piezas desplegables por separado, conectadas vía perfiles de Docker Compose:

- **frontend/** — React 19 + TypeScript + Vite, Tailwind v4. Siempre se levanta con `docker compose up`.
- **backend/** — Python 3.12, un solo archivo `backend/app/main.py`, **sin dependencias de PyPI** (solo librería estándar: `http.server`, `sqlite3`, `hmac`, `hashlib`, etc.). Solo se levanta con `--profile backend`.

Es intencional que el backend no use FastAPI/SQLAlchemy/uvicorn/psycopg ni Postgres: así el build de la imagen Docker (`backend/Dockerfile`) no necesita descargar nada de `pypi.org`, bloqueado en algunas redes corporativas. Persiste en un archivo SQLite (`/app/data/securevault.db` dentro del contenedor, en el volumen `backend_data`) en vez de un servicio Postgres separado.

Cuando el perfil backend NO está corriendo, el frontend cae a datos mock locales (`frontend/src/data/mockPortals.ts`) y queda en modo demo sin autenticación real. Cuando SÍ está corriendo, `App.tsx` llama a `/api/auth/me` al cargar para revisar la sesión, luego usa `/api/auth/login`, `/api/auth/logout`, `/api/portals` (GET listar/buscar, POST crear), `/api/portals/{id}` (PATCH editar, DELETE eliminar), `/api/portals/{id}/copy-user`, `/api/portals/{id}/open`, `/api/activity`, `/api/users`. El servidor de desarrollo de Vite hace proxy de `/api` y `/health` hacia `http://backend:8000`.

### Backend (backend/app/main.py)
- Servidor HTTP construido a mano sobre `http.server.ThreadingHTTPServer` + `BaseHTTPRequestHandler`: no hay framework, el enrutamiento es un `if/elif` sobre segmentos de path en `Handler.dispatch()`. Cada endpoint es una función `api_*` que recibe `(conn, handler, ...)`.
- Persistencia con `sqlite3` puro (sin ORM): tablas `users`, `portals`, `audit_logs` creadas en `init_db()`. Cada hilo abre su propia conexión SQLite vía `threading.local` (`get_db()`).
- Tokens de sesión personalizados: `base64(json{sub,exp}).firma` firmado con HMAC-SHA256, puesto como cookie HttpOnly, `SameSite=Lax` (`securevault_session`), TTL 8h. No es JWT, es hecho a mano — ver `make_token`/`current_user`.
- Contraseñas con hash PBKDF2-HMAC-SHA256 (310k rondas), formato `pbkdf2$rondas$salt$digest`. El login compara contra un hash "dummy" (`DUMMY_HASH`) cuando el usuario no existe, para evitar filtrar por temporización qué usernames son válidos.
- Rate limiting de login por IP con un diccionario en memoria (`failed_logins`, protegido por `failed_logins_lock`) — bloqueo tras 5 intentos fallidos por 15 min; se purga si crece más de `MAX_TRACKED_IPS`. No persiste, se reinicia al reiniciar el proceso.
- RBAC mínimo: crear/editar portales requiere rol `Administrador` u `Operador`; eliminar portales, listar usuarios, resetear MFA y cambiar el logo requieren `Administrador`.
- MFA (TOTP, RFC 6238) obligatorio desde el primer login: `POST /api/auth/login` ya no entrega cookie directamente — responde `{mfaSetupRequired, otpauthUrl, pendingToken}` (primera vez) o `{mfaRequired, pendingToken}` (ya configurado); `POST /api/auth/mfa/confirm` valida el código de 6 dígitos y recién ahí entrega la cookie de sesión. Implementado a mano con `hmac`+`hashlib.sha1` (sin librerías). `POST /api/users/{id}/reset-mfa` (Administrador) limpia `totp_secret`/`mfa_enabled` de un usuario.
- Contraseñas de portal: **no se guardan en SQLite**, viven en HashiCorp Vault (KV v2, `secret/data/portals/<id>`) vía `backend/app/vault_client.py` (cliente propio sobre `urllib`, sin `hvac`). La tabla `portals` solo guarda `has_vault_password` (bandera) para no pegarle a Vault en cada listado. `POST /api/portals/{id}/reveal-password` lee de Vault y audita cada revelación.
- Logo institucional configurable: `app_settings` (fila única) guarda `logo_data_url`; `GET /api/settings` es público (el login lo necesita sin sesión), `POST /api/settings/logo` requiere Administrador.
- Protección CSRF: toda request `POST`/`PATCH`/`DELETE` debe traer el header `X-Requested-With: SecureVaultFrontend` (ver `CSRF_HEADER`/`CSRF_HEADER_VALUE`) o se rechaza con 403. El helper `api()` del frontend ya lo agrega automáticamente.
- `GET /api/portals` acepta `?limit=` (default 200, tope 500) para evitar respuestas sin límite.
- `COOKIE_SECURE` (env var, default `true` desde que existe Caddy) agrega el flag `Secure` a la cookie de sesión — ponerlo en `false` (junto con `CORS_ORIGIN=http://localhost:3000`) si se accede directo por HTTP sin pasar por Caddy.
- El usuario admin y los portales demo se siembran al iniciar (`seed()`), de forma idempotente, desde las variables de entorno `ADMIN_USERNAME`/`ADMIN_PASSWORD`.
- CORS y cookies se arman a mano en `Handler.set_cors()`/`send_json()` (no hay middleware).

### Estructura del frontend (frontend/src)
- `App.tsx` es el único contenedor con estado — guarda portales/logs de actividad/usuarios/estado de auth, define el helper `api()` de fetch, y pasa callbacks hacia abajo. No hay librería de routing; el cambio de vista es un estado union `NavTab` (`portales | actividad | usuarios | configuracion`).
- Portales, actividad y usuarios se cargan desde la API (`/api/portals`, `/api/activity`, `/api/users`) cuando hay sesión autenticada; `data/mockPortals.ts` solo se usa como fallback antes de autenticar y como forma de "resetear a datos de demo" en Configuración.
- Copiar el usuario de un portal o abrirlo llaman a `/api/portals/{id}/copy-user` y `/api/portals/{id}/open` respectivamente, que quedan auditados en el backend; después se refresca la actividad con `fetchActivity()`.
- CRUD de portales completo: `AddPortalModal` sirve tanto para crear como editar (prop `editingPortal`); las acciones de administrador (editar, eliminar, activar/desactivar) en `PortalCard`/`PortalDetailsModal` solo se muestran si `currentUser.role === 'Administrador'`, aunque el backend igual valida el rol server-side.

### Diseño visual ("ControlCenter")
- El frontend fue reemplazado por completo (2026-09-02) por un diseño glassmorphism indigo/slate que el usuario pidió tomar de un export de AI Studio (`controlcenter.zip`), adaptado para hablar con el backend real. Nombre en pantalla: "ControlCenter" (branding cosmético, el proyecto sigue siendo SecureVault Local).
- `components/AuthScreen.tsx` reemplaza `LoginView.tsx`: login + flujo de MFA en 3 pasos (credenciales → QR de setup si es la primera vez → código de 6 dígitos), usando `qrcode` (npm) para dibujar el QR desde el `otpauthUrl` del backend.
- `components/Logo.tsx` (sin cambios) centraliza el logo institucional configurable con skeleton — se usa en `AuthScreen` y `Sidebar`.
- `components/OtherViews.tsx` agrupa `ActivityView`/`UsersView`/`SettingsView` (antes archivos separados), todas conectadas a la API real.
- `components/PortalDetailsModal.tsx` es nuevo: modal de detalle por portal (categoría, aperturas reales, copiar contraseña) accesible desde el ícono "Info" de cada `PortalCard`.
- `AppNotification` (centro de notificaciones en el Header) es **solo local/efímero** — no se persiste en el backend, se genera en `App.tsx` a partir de acciones reales (crear/eliminar/abrir/cambiar estado de portal).
- La UI solo distingue `Administrador` vs. el resto (`Operador`/`Auditor` se tratan como "Usuario" de solo consulta) — el backend sigue guardando el rol real de 3 valores; es una simplificación deliberada de esta interfaz, no del modelo de datos.
- `portals` ganó columnas reales `department` y `description` (antes existían en el formulario del frontend pero nunca se guardaban — bug corregido de paso). `openCount` en la respuesta de `/api/portals` se calcula en vivo contando eventos `type=access` en `audit_logs` — no es un campo almacenado.
- **Importante:** el proyecto nunca tuvo `@types/react`/`@types/react-dom` instalados (bug preexistente desde el `package.json` original) — ya están en `devDependencies`. Si `tsc` empieza a fallar con errores raros tipo "Property 'key' does not exist", es la primera sospecha a revisar.
- Los componentes en `src/components/` son presentacionales, reciben estado/handlers como props desde `App.tsx`.

### Infraestructura (Vault, backups, HTTPS)
- `vault/config/vault.hcl` + `vault/bootstrap/bootstrap.py`: el servicio `vault-bootstrap` corre una vez por cada `docker compose up`, inicializa Vault (1 clave de unseal, operador único local) la primera vez o lo desella si ya existía, y aprovisiona una policy + token acotado para el backend. Todo queda en `vault/keys/vault-keys.json` (gitignored) — sin ese archivo no se puede desellar Vault ni leer los secretos ya guardados.
- `backend/scripts/backup_daemon.py` + `restore_backup.py`: backups cifrados automáticos de la SQLite (no de Vault) cada 24h en `./backups/` (volumen separado), con `BACKUP_ENCRYPTION_KEY` propia. El cifrado vive en `backend/app/backup_crypto.py` (una sola copia, usada por el daemon, el script de restore y el endpoint): construcción HMAC-SHA256-CTR en streaming por chunks (cuidado si se toca: el keystream se deriva por *offset absoluto*, no por chunk — reusar el offset por chunk fue un bug real que se encontró y corrigió antes de dar esto por bueno). Los scripts en `scripts/` hacen `sys.path.insert(0, "..")` para importar `app.backup_crypto` al correr como `python scripts/xxx.py`.
- Restaurar desde la UI: `POST /api/backups/restore` (Administrador + `consume_mfa_reauth("restore")`), recibe el `.enc` como cuerpo binario crudo (`application/octet-stream`, tope `MAX_BACKUP_UPLOAD_BYTES` = 64 MB, aparte del límite de 1 MB de los JSON). Descifra a un temporal en el directorio de datos (el volumen `./backups` está montado `:ro` en el backend), valida header + `PRAGMA integrity_check` + tablas de SecureVault, guarda `securevault-pre-restore-*.db` y aplica el restore con `source.backup(conn)` (API online de SQLite, sin reiniciar el proceso). El backend necesita `BACKUP_ENCRYPTION_KEY` en su entorno (agregada al servicio `backend` en `docker-compose.yml`); `GET /api/settings/system` expone `backups.restoreAvailable`.
- `Caddyfile` + servicio `caddy`: proxy HTTPS único en `https://localhost:8443` (certificado autofirmado vía `tls internal`), reenvía `/api/*` y `/health` al backend y el resto al frontend. Con esto activo, `COOKIE_SECURE` puede ser `true` sin romper nada porque frontend+backend quedan detrás del mismo origen.
- `backend/Dockerfile` corre `python -m app.main` (no `python app/main.py`) para que `from . import vault_client` (import relativo) funcione — si se cambia esa forma de invocación, los imports del backend se rompen.
- El servicio `vault` en `docker-compose.yml` usa `entrypoint: ["vault"]` en vez del entrypoint por defecto de la imagen (`docker-entrypoint.sh`). Se encontró empíricamente que, en este entorno (Docker Desktop/Windows), dejar que compose invoque `vault` a través del entrypoint script oficial produce consistentemente `bind: address already in use` en el listener — invocar `vault server` directamente lo evita. No tocar esto sin volver a probarlo primero.

### Otros elementos en la raíz
- `docx_render/` — actualmente vacío.
- `securevault-local.zip`, `Conversacion_SecureVault_Proyecto.docx` — artefactos del proyecto, no son código fuente.

## Comandos

Ejecutar desde la raíz del repo salvo que se indique lo contrario.

```powershell
# Configuración inicial
Copy-Item .env.example .env

# Solo frontend (modo demo, datos mock, sin persistencia de auth)
docker compose up -d --build

# Stack completo: frontend + backend + Vault + Caddy (HTTPS) + backups
docker compose --profile backend up -d --build
```

- HTTPS (recomendado una vez levantado el perfil backend): https://localhost:8443
- Frontend directo: http://localhost:3000
- Health check directo: http://localhost:8000/health
- UI de Vault: http://localhost:8200/ui

Frontend (ejecutar dentro de `frontend/`, p. ej. con `npm run` en local en vez de Docker):
```powershell
npm run dev      # servidor de desarrollo de vite en :3000, hace proxy de /api y /health hacia backend:8000
npm run build     # build de vite
npm run lint      # tsc --noEmit (solo chequeo de tipos, no hay ESLint configurado)
```

El backend no tiene dependencias que instalar; corre directo con `python app/main.py` (ver `backend/Dockerfile`). `backend/requirements.txt` está vacío a propósito — no usar `pip install` como paso de build.

Backend (ejecutar dentro de `backend/`):
```powershell
python -m unittest discover -s tests -v   # smoke tests end-to-end (login, CRUD de portales, CSRF, actividad, usuarios)
```

No hay tests de frontend todavía; el backend tiene `backend/tests/test_api.py` (solo `unittest` de librería estándar, levanta el servidor en un hilo y pega contra la API real con una DB SQLite temporal).

## Notas para hacer cambios

- La app está diseñada para conectarse solo a `127.0.0.1` en esta etapa (ver mapeos de puertos en `docker-compose.yml`) — no ampliar la exposición sin que se pida explícitamente.
- `SESSION_SECRET` y `ADMIN_PASSWORD` en `.env`/`.env.example` son placeholders locales (`cambiar_esta_clave_local`) — nunca poner credenciales reales hardcodeadas en el código.
- El CORS en `backend/app/main.py` usa `CORS_ORIGIN` (default `http://localhost:3000`); actualizarlo deliberadamente si cambian los orígenes.
- **No agregar dependencias de PyPI al backend** sin confirmar con el usuario — la razón de ser de esta reescritura es evitar `pip install` en el build de Docker porque `pypi.org` está bloqueado en su red corporativa (Docker Hub sí funciona).
