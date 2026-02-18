#!/usr/bin/env bash
# Deploy backend a AWS Lightsail (pull + install + restart)
# Uso: DEPLOY_HOST=ubuntu@TU_IP DEPLOY_PATH=/home/ubuntu/appgsp ./scripts/deploy-lightsail.sh
# O crea .deploy.env en la raíz con DEPLOY_HOST=ubuntu@IP y opcionalmente DEPLOY_PATH=...

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ -f "$ROOT/.deploy.env" ]; then set -a; source "$ROOT/.deploy.env"; set +a; fi

if [ -z "${DEPLOY_HOST}" ]; then
  echo "Error: define DEPLOY_HOST (ej: ubuntu@3.xx.xx.xx)"
  echo "  Opción 1: export DEPLOY_HOST=ubuntu@TU_IP && ./scripts/deploy-lightsail.sh"
  echo "  Opción 2: crea .deploy.env con la línea DEPLOY_HOST=ubuntu@TU_IP"
  exit 1
fi
DEPLOY_PATH="${DEPLOY_PATH:-/home/bitnami/appgsp}"

echo "Deploy a $DEPLOY_HOST (path: $DEPLOY_PATH)"
ssh "$DEPLOY_HOST" "cd $DEPLOY_PATH && git pull origin main && cd backend && npm install --omit=dev && pm2 restart appgsp-backend"
echo "Configurando Apache (ProxyTimeout para evitar 502)..."
ssh "$DEPLOY_HOST" "sudo bash $DEPLOY_PATH/scripts/setup-apache-proxy-timeout.sh" || echo "  (Si falla, ejecuta en el servidor: sudo bash $DEPLOY_PATH/scripts/setup-apache-proxy-timeout.sh)"
echo "Deploy listo."
