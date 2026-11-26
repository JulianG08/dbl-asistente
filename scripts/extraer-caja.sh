#!/usr/bin/env bash
# Extrae la caja de Dragon Ball Legends del móvil conectado por USB (ADB)
# y genera caja.json en la raíz del repo.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -x .venv/bin/python ]; then
  PY=".venv/bin/python"
else
  PY="python3"
fi

exec "$PY" scripts/extraer_caja.py "$@"
