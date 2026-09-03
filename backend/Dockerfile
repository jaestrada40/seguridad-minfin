FROM python:3.12-slim

WORKDIR /app
COPY app ./app
COPY scripts ./scripts

# OpenShift corre el contenedor con un UID aleatorio y GID 0. Todo lo que la
# app necesita escribir (la SQLite y los temporales del restore van a
# os.path.dirname(DB_PATH); /backups lo aporta un PVC) tiene que pertenecer al
# grupo 0 y ser escribible por el grupo.
RUN mkdir -p /app/data \
 && chgrp -R 0 /app \
 && chmod -R g=u /app

USER 1001
ENV DB_PATH=/app/data/securevault.db \
    BACKUP_DIR=/backups \
    PYTHONUNBUFFERED=1
EXPOSE 8000

# Sin dependencias de PyPI: la imagen no descarga nada de pypi.org.
# La misma imagen sirve para el backend (`python -m app.main`), el CronJob de
# backup (`python scripts/backup_daemon.py --once`) y el Job de bootstrap de
# Vault (`python vault/bootstrap/bootstrap.py`, montado por ConfigMap).
CMD ["python", "-m", "app.main"]
