storage "file" {
  path = "/vault/data"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true
}

# El proxy Caddy termina TLS por delante; Vault escucha en texto plano
# solo dentro de la red interna de Docker, nunca expuesto directamente.
api_addr     = "http://vault:8200"
ui           = true
disable_mlock = true
