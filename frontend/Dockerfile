# syntax=docker/dockerfile:1

# ---- build: compila el bundle de Vite ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
# base './' (rutas de assets relativas) para que el bundle sirva bajo cualquier
# prefijo sin reconstruir — ver vite.config.ts.
RUN npm run build

# ---- dev: servidor de desarrollo de Vite (docker-compose usa `target: dev`) ----
FROM node:22-alpine AS dev
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
CMD ["npm", "run", "dev"]

# ---- prod (stage por defecto): estáticos servidos por Caddy en :8080 ----
FROM caddy:2.7-alpine AS prod
COPY docker/frontend-Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
# Caddy escribe en XDG dirs; en OpenShift (UID aleatorio, GID 0) los dejamos en
# /tmp y desactivamos admin/https para que no necesite escribir nada persistente.
ENV XDG_CONFIG_HOME=/tmp/caddy-config XDG_DATA_HOME=/tmp/caddy-data
EXPOSE 8080
