#!/bin/bash
set -e
cd "$(dirname "$0")"
trizn_node="${TRIZN_NODE:-}"
if [ -z "$trizn_node" ]; then
  trizn_bundled="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
  if [ -x "$trizn_bundled" ]; then trizn_node="$trizn_bundled"; else trizn_node="$(command -v node || true)"; fi
fi
if [ -z "$trizn_node" ]; then
  echo "Для запуска нужен Node.js 24: https://nodejs.org/en/download"
  read -r -p "Нажмите Enter для выхода."
  exit 1
fi
export PATH="$(dirname "$trizn_node"):$PATH"
if [ ! -d node_modules ]; then npm ci; fi
if [ ! -f dist/index.html ]; then npm run build; fi
"$trizn_node" --env-file-if-exists=.env server/start-local.mjs
