#!/usr/bin/env bash
# Añade TimeOut y ProxyTimeout en los archivos Apache que hacen proxy a :4000 (evitar 502).
# Ejecutar en el servidor: sudo bash /home/bitnami/appgsp/scripts/setup-apache-proxy-timeout.sh

set -e
PROXY_TIMEOUT="${PROXY_TIMEOUT:-120}"

# Archivos que tienen ProxyPass a 127.0.0.1:4000 (los activos, no .back ni .disabled)
CONF_FILES=(
  /opt/bitnami/apache2/conf/vhosts/rewards.gsp.com.co.conf
  /opt/bitnami/apache2/conf/bitnami/bitnami.conf
  /opt/bitnami/apache2/conf/bitnami/bitnami-ssl.conf
)

for CONF_FILE in "${CONF_FILES[@]}"; do
  [ -f "$CONF_FILE" ] || continue
  if ! grep -q "ProxyPass.*4000" "$CONF_FILE" 2>/dev/null; then
    continue
  fi
  if grep -q "ProxyTimeout" "$CONF_FILE" 2>/dev/null; then
    echo "[apache] ProxyTimeout ya en $CONF_FILE"
    continue
  fi
  echo "[apache] Parcheando $CONF_FILE"
  cp -a "$CONF_FILE" "${CONF_FILE}.bak.$(date +%Y%m%d%H%M%S)"
  # Insertar justo antes de la línea con ProxyPass a :4000 (orden: TimeOut, luego ProxyTimeout)
  sed -i '/ProxyPass \/ http:\/\/127.0.0.1:4000\//i \  ProxyTimeout '"$PROXY_TIMEOUT"'' "$CONF_FILE"
  sed -i '/ProxyPass \/ http:\/\/127.0.0.1:4000\//i \  TimeOut '"$PROXY_TIMEOUT"'' "$CONF_FILE"
  echo "[apache] Añadidos TimeOut y ProxyTimeout = $PROXY_TIMEOUT s"
done

if [ -x /opt/bitnami/ctlscript.sh ]; then
  /opt/bitnami/ctlscript.sh restart apache
  echo "[apache] Apache reiniciado."
else
  echo "[apache] Reinicia Apache: sudo /opt/bitnami/ctlscript.sh restart apache"
fi
