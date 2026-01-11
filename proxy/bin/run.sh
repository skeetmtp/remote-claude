#!/bin/bash
set -e

# Get the directory where this script is located and go to the parent (proxy) directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

npm run start -- "$@"
