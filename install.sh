#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="${APP_NAME:-bind9-web-ui}"
SERVICE_NAME="${SERVICE_NAME:-bind9-web-ui}"
SERVICE_USER="${SERVICE_USER:-bind9web}"
SERVICE_GROUP="${SERVICE_GROUP:-}"
INSTALL_DIR="${INSTALL_DIR:-/opt/bind9-web-ui}"
ENV_FILE="${ENV_FILE:-/etc/bind9-web-ui.env}"
NODE_MAJOR="${NODE_MAJOR:-20}"

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-3001}"
DB_TYPE="${DB_TYPE:-sqlite}"
DATABASE_URL="${DATABASE_URL:-data/bind9admin.db}"
BACKUP_DIR="${BACKUP_DIR:-data/backups}"
BIND9_CONF_DIR="${BIND9_CONF_DIR:-/etc/bind}"
BIND9_ZONE_DIR="${BIND9_ZONE_DIR:-/var/cache/bind}"

WEB_SERVER="${WEB_SERVER:-}"
INSTALL_NGINX="${INSTALL_NGINX:-}"
WEB_HTTP_PORT="${WEB_HTTP_PORT:-8080}"
WEB_HTTPS_PORT="${WEB_HTTPS_PORT:-8443}"
SERVER_NAME="${SERVER_NAME:-_}"
TLS_CERT="${TLS_CERT:-/etc/ssl/certs/${APP_NAME}.crt}"
TLS_KEY="${TLS_KEY:-/etc/ssl/private/${APP_NAME}.key}"
DISABLE_DEFAULT_SITE="${DISABLE_DEFAULT_SITE:-0}"
LOCAL_BIND_ACCESS="${LOCAL_BIND_ACCESS:-0}"
BIND_GROUP="${BIND_GROUP:-bind}"
SYSTEMD_READWRITE_PATHS="$INSTALL_DIR/data"
SYSTEMD_SUPPLEMENTARY_GROUPS=""
BOOTSTRAP_PASSWORD_FILE=""

log() {
  printf '[%s] %s\n' "$APP_NAME" "$*"
}

fail() {
  printf '[%s] ERROR: %s\n' "$APP_NAME" "$*" >&2
  exit 1
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    fail "run this installer as root: sudo bash install.sh"
  fi
}

require_linux() {
  [[ "$(uname -s)" == "Linux" ]] || fail "this installer supports Linux only"
  command -v systemctl >/dev/null 2>&1 || fail "systemd is required"
  command -v apt-get >/dev/null 2>&1 || fail "Debian/Ubuntu with apt-get is required"
}

normalize_options() {
  if [[ -z "$WEB_SERVER" ]]; then
    if [[ "$INSTALL_NGINX" == "0" ]]; then
      WEB_SERVER="none"
    else
      WEB_SERVER="nginx"
    fi
  fi

  case "$WEB_SERVER" in
    nginx|apache|none) ;;
    *) fail "WEB_SERVER must be one of: nginx, apache, none" ;;
  esac

  if [[ "$WEB_SERVER" == "none" ]]; then
    log "No reverse proxy will be configured. Use an external TLS proxy for production sessions."
  fi
}

node_major_version() {
  if ! command -v node >/dev/null 2>&1; then
    echo 0
    return
  fi
  node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0
}

install_os_packages() {
  log "Installing OS packages"
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    build-essential \
    python3 \
    rsync \
    openssl

  case "$WEB_SERVER" in
    nginx)
      DEBIAN_FRONTEND=noninteractive apt-get install -y nginx
      ;;
    apache)
      DEBIAN_FRONTEND=noninteractive apt-get install -y apache2
      ;;
    none)
      ;;
  esac
}

install_node_if_needed() {
  local current_major
  current_major="$(node_major_version)"
  if (( current_major >= NODE_MAJOR )); then
    log "Node.js $(node -v) detected"
    return
  fi

  log "Installing Node.js ${NODE_MAJOR}.x"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs

  current_major="$(node_major_version)"
  (( current_major >= NODE_MAJOR )) || fail "Node.js ${NODE_MAJOR}+ installation failed"
}

ensure_service_user() {
  if [[ -n "$SERVICE_GROUP" ]] && ! getent group "$SERVICE_GROUP" >/dev/null 2>&1; then
    log "Creating service group: $SERVICE_GROUP"
    groupadd --system "$SERVICE_GROUP"
  fi

  if id "$SERVICE_USER" >/dev/null 2>&1; then
    SERVICE_GROUP="${SERVICE_GROUP:-$(id -gn "$SERVICE_USER")}"
    log "Service user exists: $SERVICE_USER"
    return
  fi

  log "Creating service user: $SERVICE_USER"
  if [[ -n "$SERVICE_GROUP" ]]; then
    useradd --system --home-dir "$INSTALL_DIR" --shell /usr/sbin/nologin --gid "$SERVICE_GROUP" "$SERVICE_USER"
  else
    useradd --system --user-group --home-dir "$INSTALL_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
    SERVICE_GROUP="$SERVICE_USER"
  fi
}

sync_application() {
  local src_dir
  src_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  mkdir -p "$INSTALL_DIR"

  if [[ "$(readlink -f "$src_dir")" != "$(readlink -f "$INSTALL_DIR" 2>/dev/null || echo "$INSTALL_DIR")" ]]; then
    log "Copying application to $INSTALL_DIR"
    rsync -a --delete \
      --exclude '.git' \
      --exclude '.env' \
      --exclude 'node_modules' \
      --exclude 'dist' \
      --exclude 'data' \
      --exclude 'backups' \
      "$src_dir/" "$INSTALL_DIR/"
  else
    log "Installing from $INSTALL_DIR in place"
  fi

  mkdir -p "$INSTALL_DIR/data/backups"
  chown -R "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_DIR"
}

configure_local_bind_access() {
  SYSTEMD_READWRITE_PATHS="$INSTALL_DIR/data"
  SYSTEMD_SUPPLEMENTARY_GROUPS=""

  if [[ "$LOCAL_BIND_ACCESS" != "1" ]]; then
    return
  fi

  log "Enabling local BIND access for service user"

  if getent group "$BIND_GROUP" >/dev/null 2>&1; then
    usermod -aG "$BIND_GROUP" "$SERVICE_USER"
    SYSTEMD_SUPPLEMENTARY_GROUPS="SupplementaryGroups=$BIND_GROUP"
  else
    log "BIND group '$BIND_GROUP' was not found; skipping group membership"
  fi

  for dir in "$BIND9_CONF_DIR" "$BIND9_ZONE_DIR"; do
    if [[ -d "$dir" ]]; then
      SYSTEMD_READWRITE_PATHS="$SYSTEMD_READWRITE_PATHS $dir"
    else
      log "Local BIND path does not exist yet, not adding to ReadWritePaths: $dir"
    fi
  done

  log "Local mode requires the service user to have filesystem permissions on BIND files."
  log "If files are root-only, use SSH mode to localhost with sudo or adjust permissions deliberately."
}

random_hex() {
  openssl rand -hex "$1"
}

set_env_default() {
  local key="$1"
  local value="$2"

  touch "$ENV_FILE"
  if grep -Eq "^${key}=.+" "$ENV_FILE"; then
    return
  fi

  if grep -Eq "^${key}=" "$ENV_FILE"; then
    local tmp
    tmp="$(mktemp)"
    awk -v k="$key" -v v="$value" '
      $0 ~ "^" k "=" && !done { print k "=" v; done=1; next }
      { print }
    ' "$ENV_FILE" > "$tmp"
    cat "$tmp" > "$ENV_FILE"
    rm -f "$tmp"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

configure_environment() {
  log "Configuring $ENV_FILE"
  mkdir -p "$(dirname "$ENV_FILE")"
  touch "$ENV_FILE"

  local generated_admin_password=""
  if [[ -z "${DEFAULT_ADMIN_PASSWORD:-}" ]] && ! grep -Eq "^DEFAULT_ADMIN_PASSWORD=.+" "$ENV_FILE"; then
    generated_admin_password="$(random_hex 12)"
    DEFAULT_ADMIN_PASSWORD="$generated_admin_password"
  fi

  set_env_default "NODE_ENV" "production"
  set_env_default "HOST" "$HOST"
  set_env_default "PORT" "$PORT"
  set_env_default "SESSION_SECRET" "${SESSION_SECRET:-$(random_hex 32)}"
  set_env_default "DB_TYPE" "$DB_TYPE"
  set_env_default "DATABASE_URL" "$DATABASE_URL"
  set_env_default "BACKUP_DIR" "$BACKUP_DIR"
  set_env_default "BIND9_CONF_DIR" "$BIND9_CONF_DIR"
  set_env_default "BIND9_ZONE_DIR" "$BIND9_ZONE_DIR"
  set_env_default "RNDC_BIN" "${RNDC_BIN:-rndc}"
  set_env_default "NAMED_CHECKCONF" "${NAMED_CHECKCONF:-named-checkconf}"
  set_env_default "DEFAULT_ADMIN_PASSWORD" "${DEFAULT_ADMIN_PASSWORD:-}"

  chmod 600 "$ENV_FILE"
  chown root:root "$ENV_FILE"

  if [[ -n "$generated_admin_password" ]]; then
    local password_file="/root/${APP_NAME}-bootstrap-admin.txt"
    {
      printf 'BIND9 Web UI bootstrap account\n'
      printf 'Username: admin\n'
      printf 'Password: %s\n' "$generated_admin_password"
      printf 'Generated: %s\n' "$(date -Is)"
    } > "$password_file"
    chmod 600 "$password_file"
    BOOTSTRAP_PASSWORD_FILE="$password_file"
    log "Generated bootstrap admin password saved to $password_file"
  fi
}

run_as_service_user() {
  runuser -u "$SERVICE_USER" -- env HOME="$INSTALL_DIR" "$@"
}

build_application() {
  log "Installing npm dependencies"
  cd "$INSTALL_DIR"

  if [[ -f package-lock.json ]]; then
    run_as_service_user npm ci --no-audit --no-fund
  else
    run_as_service_user npm install --no-audit --no-fund
  fi

  log "Building application"
  run_as_service_user npm run build

  log "Pruning development dependencies"
  run_as_service_user npm prune --omit=dev --no-audit --no-fund
}

install_systemd_unit() {
  local unit="/etc/systemd/system/${SERVICE_NAME}.service"
  log "Installing systemd unit: $unit"

  cat > "$unit" <<EOF
[Unit]
Description=BIND9 Web UI
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_GROUP
$SYSTEMD_SUPPLEMENTARY_GROUPS
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node $INSTALL_DIR/dist/index.cjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=$SYSTEMD_READWRITE_PATHS

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable --now "$SERVICE_NAME"
}

ensure_tls_certificate() {
  local cert_cn="$SERVER_NAME"
  if [[ "$cert_cn" == "_" ]]; then
    cert_cn="$(hostname -f 2>/dev/null || hostname)"
  fi

  if [[ ! -f "$TLS_CERT" || ! -f "$TLS_KEY" ]]; then
    log "Generating self-signed TLS certificate"
    mkdir -p "$(dirname "$TLS_CERT")" "$(dirname "$TLS_KEY")"
    openssl req -x509 -nodes -days 825 -newkey rsa:2048 \
      -subj "/CN=${cert_cn}" \
      -keyout "$TLS_KEY" \
      -out "$TLS_CERT" >/dev/null 2>&1
    chmod 600 "$TLS_KEY"
  fi
}

https_redirect_url_nginx() {
  if [[ "$WEB_HTTPS_PORT" == "443" ]]; then
    printf 'https://$host$request_uri'
  else
    printf 'https://$host:%s$request_uri' "$WEB_HTTPS_PORT"
  fi
}

https_redirect_url_apache() {
  local apache_server_name="$SERVER_NAME"
  if [[ "$apache_server_name" == "_" ]]; then
    apache_server_name="$(hostname -f 2>/dev/null || hostname)"
  fi

  if [[ "$WEB_HTTPS_PORT" == "443" ]]; then
    printf 'https://%s/' "$apache_server_name"
  else
    printf 'https://%s:%s/' "$apache_server_name" "$WEB_HTTPS_PORT"
  fi
}

disable_default_site_if_requested() {
  [[ "$DISABLE_DEFAULT_SITE" == "1" ]] || return

  case "$WEB_SERVER" in
    nginx)
      rm -f /etc/nginx/sites-enabled/default
      ;;
    apache)
      a2dissite 000-default.conf default-ssl.conf >/dev/null 2>&1 || true
      ;;
  esac
}

configure_nginx() {
  ensure_tls_certificate

  local nginx_conf="/etc/nginx/sites-available/${APP_NAME}.conf"
  local redirect_url
  redirect_url="$(https_redirect_url_nginx)"
  log "Configuring nginx reverse proxy: $nginx_conf"

  cat > "$nginx_conf" <<EOF
server {
    listen $WEB_HTTP_PORT;
    server_name $SERVER_NAME;
    return 301 $redirect_url;
}

server {
    listen $WEB_HTTPS_PORT ssl http2;
    server_name $SERVER_NAME;

    ssl_certificate $TLS_CERT;
    ssl_certificate_key $TLS_KEY;

    client_max_body_size 200m;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Port $WEB_HTTPS_PORT;
        proxy_read_timeout 300;
    }
}
EOF

  disable_default_site_if_requested
  ln -sfn "$nginx_conf" "/etc/nginx/sites-enabled/${APP_NAME}.conf"
  nginx -t
  systemctl enable --now nginx
  systemctl reload nginx
}

configure_apache() {
  ensure_tls_certificate

  local apache_conf="/etc/apache2/sites-available/${APP_NAME}.conf"
  local apache_server_name="$SERVER_NAME"
  local redirect_url
  local listen_lines=""
  if [[ "$apache_server_name" == "_" ]]; then
    apache_server_name="$(hostname -f 2>/dev/null || hostname)"
  fi
  redirect_url="$(https_redirect_url_apache)"

  if ! grep -RqsE "^[[:space:]]*Listen[[:space:]]+${WEB_HTTP_PORT}([[:space:]]|$)" /etc/apache2/ports.conf /etc/apache2/sites-available /etc/apache2/sites-enabled 2>/dev/null; then
    listen_lines+="Listen $WEB_HTTP_PORT"$'\n'
  fi
  if ! grep -RqsE "^[[:space:]]*Listen[[:space:]]+${WEB_HTTPS_PORT}([[:space:]]|$)" /etc/apache2/ports.conf /etc/apache2/sites-available /etc/apache2/sites-enabled 2>/dev/null; then
    listen_lines+="Listen $WEB_HTTPS_PORT"$'\n'
  fi

  log "Configuring Apache reverse proxy: $apache_conf"
  a2enmod ssl proxy proxy_http proxy_wstunnel headers rewrite >/dev/null

  cat > "$apache_conf" <<EOF
$listen_lines

<VirtualHost *:$WEB_HTTP_PORT>
    ServerName $apache_server_name
    Redirect permanent / $redirect_url
</VirtualHost>

<VirtualHost *:$WEB_HTTPS_PORT>
    ServerName $apache_server_name

    SSLEngine on
    SSLCertificateFile $TLS_CERT
    SSLCertificateKeyFile $TLS_KEY

    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "https"
    RequestHeader set X-Forwarded-Port "$WEB_HTTPS_PORT"

    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule /(.*) ws://127.0.0.1:$PORT/\$1 [P,L]

    ProxyPass / http://127.0.0.1:$PORT/
    ProxyPassReverse / http://127.0.0.1:$PORT/
</VirtualHost>
EOF

  disable_default_site_if_requested
  ln -sfn "$apache_conf" "/etc/apache2/sites-enabled/000-${APP_NAME}.conf"
  apachectl configtest
  systemctl enable --now apache2
  systemctl reload apache2
}

configure_reverse_proxy() {
  case "$WEB_SERVER" in
    nginx) configure_nginx ;;
    apache) configure_apache ;;
    none) ;;
  esac
}

print_summary() {
  log "Installation complete"
  systemctl --no-pager --lines=0 status "$SERVICE_NAME" || true

  if [[ "$WEB_SERVER" != "none" ]]; then
    cat <<EOF

Open the web UI:
  https://<server-ip>:$WEB_HTTPS_PORT

Reverse proxy:
  $WEB_SERVER

If you used the generated self-signed certificate, your browser will show a certificate warning.
Bootstrap account:
  Username: admin
  Password file: ${BOOTSTRAP_PASSWORD_FILE:-not generated; DEFAULT_ADMIN_PASSWORD was provided or env file already had one}

EOF
  else
    cat <<EOF

The service is listening on:
  http://$HOST:$PORT

Production sessions require HTTPS. Put nginx, Caddy, Apache, or another TLS reverse proxy in front of the service.
Bootstrap account:
  Username: admin
  Password file: ${BOOTSTRAP_PASSWORD_FILE:-not generated; DEFAULT_ADMIN_PASSWORD was provided or env file already had one}

EOF
  fi
}

main() {
  require_root
  require_linux
  normalize_options
  install_os_packages
  install_node_if_needed
  ensure_service_user
  sync_application
  configure_local_bind_access
  configure_environment
  build_application
  install_systemd_unit
  configure_reverse_proxy
  print_summary
}

main "$@"
