#!/bin/bash
set -e

WORKING_DIR=$(pwd)

# Get the directory where this script is located and go to the parent (proxy) directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

# Get the working directory
echo "Starting claude proxy in working directory: $WORKING_DIR"

npm run start -- --cwd "$WORKING_DIR" "$@"
