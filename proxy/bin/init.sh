#!/bin/bash
set -e

echo "==> Initializing claude-proxy..."

# Get the directory where this script is located and go to the parent (proxy) directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

echo "==> Installing dependencies..."
npm install

echo "==> Fixing node-pty spawn-helper permissions..."
# Find the spawn-helper for the current platform and architecture
PLATFORM="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

# Map platform names
if [[ "$PLATFORM" == "darwin" ]]; then
  PLATFORM="darwin"
elif [[ "$PLATFORM" == "linux" ]]; then
  PLATFORM="linux"
fi

# Map architecture names
if [[ "$ARCH" == "x86_64" ]]; then
  ARCH="x64"
elif [[ "$ARCH" == "aarch64" ]]; then
  ARCH="arm64"
fi

SPAWN_HELPER="node_modules/node-pty/prebuilds/${PLATFORM}-${ARCH}/spawn-helper"

if [[ -f "$SPAWN_HELPER" ]]; then
  chmod +x "$SPAWN_HELPER"
  echo "    Fixed permissions for: $SPAWN_HELPER"
else
  echo "    Warning: spawn-helper not found at $SPAWN_HELPER"
  echo "    Searching for spawn-helper files..."
  find node_modules/node-pty/prebuilds -name "spawn-helper" -type f -exec chmod +x {} \; -exec echo "    Fixed: {}" \;
fi

echo ""
echo "==> Initialization complete!"
echo ""
echo "Usage:"
echo "  npm run start -- [claude-arguments]"
echo ""
echo "Examples:"
echo "  npm run start -- --help"
echo "  npm run start -- --version"
echo "  DEBUG=proxy:* npm run start -- --help"
echo ""
