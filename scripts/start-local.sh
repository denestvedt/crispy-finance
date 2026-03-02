#!/usr/bin/env bash
set -euo pipefail

require_tool() {
  local tool="$1"
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "❌ Missing required tool: $tool"
    echo "Install $tool and re-run scripts/start-local.sh"
    exit 1
  fi
}

echo "🔎 Checking required tools..."
require_tool node
require_tool pnpm
require_tool supabase

echo "📦 Installing dependencies (pnpm install)..."
pnpm install

echo "🧱 Starting Supabase services (supabase start)..."
supabase start

echo "🗄️ Resetting local database (supabase db reset)..."
supabase db reset

echo "🚀 Starting web app (pnpm --filter web dev)..."
pnpm --filter web dev
