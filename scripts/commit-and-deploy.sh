#!/usr/bin/env bash
# Commit + deploy a Lightsail en un solo paso.
# Uso: ./scripts/commit-and-deploy.sh "mensaje de commit"
#      ./scripts/commit-and-deploy.sh "mensaje" -- src/ backend/
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MSG="$1"
if [ -z "$MSG" ]; then
  echo "Uso: $0 \"mensaje de commit\" [-- archivos...]"
  echo "  Ejemplo: $0 \"fix: corrección en login\""
  echo "  Ejemplo: $0 \"feat: nueva pantalla\" -- src/screens/ backend/"
  exit 1
fi
shift
# Si hay "--", lo que sigue son rutas para git add
if [ "$1" = "--" ]; then
  shift
  git add "$@"
else
  git add -A
fi

if ! git diff --cached --quiet 2>/dev/null; then
  git status --short
  git commit -m "$MSG"
  echo ""
  echo "--- Push a origin ---"
  git push origin main
  echo ""
  echo "--- Deploy a Lightsail ---"
  exec "$ROOT/scripts/deploy-lightsail.sh"
else
  echo "No hay cambios para commitear. Haz cambios y vuelve a ejecutar."
  exit 1
fi
