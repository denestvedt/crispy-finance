#!/usr/bin/env bash
set -euo pipefail

if command -v lsof >/dev/null 2>&1; then
  WEB_PIDS="$(lsof -ti tcp:3000 || true)"
  if [[ -n "$WEB_PIDS" ]]; then
    echo "🛑 Stopping process(es) listening on localhost:3000..."
    kill $WEB_PIDS || true
  else
    echo "ℹ️ No process currently listening on localhost:3000"
  fi
else
  echo "⚠️ lsof not found; skipping web process detection on port 3000"
fi

if command -v supabase >/dev/null 2>&1; then
  echo "🧱 Stopping Supabase services (supabase stop)..."
  supabase stop
else
  echo "⚠️ supabase CLI not found; skipping Supabase shutdown"
fi

echo "✅ Local services stopped."
