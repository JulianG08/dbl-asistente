#!/usr/bin/env bash
# Publica el proyecto en GitHub y activa GitHub Pages (idempotente:
# se puede ejecutar varias veces sin romper nada).
#
# Uso: ./scripts/publicar-github.sh
# Requiere: gh autenticado (gh auth login --web --scopes repo,workflow)
set -euo pipefail
cd "$(dirname "$0")/.."

OWNER="${GITHUB_OWNER:-JulianG08}"
REPO="${GITHUB_REPO:-dbl-asistente}"

if ! command -v gh >/dev/null 2>&1; then
  echo "Falta gh (GitHub CLI). Instálalo y ejecuta: gh auth login --web --scopes repo,workflow" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Primero autentícate: gh auth login --web --scopes repo,workflow" >&2
  exit 1
fi

# Credenciales persistentes para git (no volver a pedir login)
gh auth setup-git

if ! git remote get-url origin >/dev/null 2>&1; then
  if gh repo view "$OWNER/$REPO" >/dev/null 2>&1; then
    git remote add origin "https://github.com/$OWNER/$REPO.git"
  else
    gh repo create "$OWNER/$REPO" \
      --public \
      --source . \
      --remote origin \
      --push \
      --description "Asistente personal para Dragon Ball Legends: caja, equipos, actos e invocaciones"
  fi
fi

git push -u origin main

# Pages con GitHub Actions (crear si no existe; actualizar si ya existe)
gh api --method POST "repos/$OWNER/$REPO/pages" -f build_type=workflow >/dev/null 2>&1 ||
  gh api --method PUT "repos/$OWNER/$REPO/pages" -f build_type=workflow >/dev/null 2>&1 ||
  true

# Lanza el primer despliegue (si el workflow ya existe en el repo)
gh workflow run deploy.yml --repo "$OWNER/$REPO" >/dev/null 2>&1 || true

echo "Repositorio: https://github.com/$OWNER/$REPO"
echo "App (Pages):  https://$OWNER.github.io/$REPO/"
echo "Estado del deploy: gh run list --repo $OWNER/$REPO --limit 3"
