#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_BIN="/Users/alban/.local/bin/claude"
CLAUDE_BACKUP="/Users/alban/.local/bin/claude.symlink.bak"
LOG_DIR="$HOME/claude-stream-logs"

echo "Claude CLI Wrapper Installer"
echo "============================"

# Create log directory
mkdir -p "$LOG_DIR"
echo "Created log directory: $LOG_DIR"

# Check if already installed
if [ -f "$CLAUDE_BIN" ] && head -1 "$CLAUDE_BIN" 2>/dev/null | grep -q "uv run"; then
    echo "Wrapper already installed at $CLAUDE_BIN"
    echo "To reinstall, run: $0 --force"
    [ "$1" != "--force" ] && exit 0
fi

# Backup original if it exists and backup doesn't
if [ -e "$CLAUDE_BIN" ] && [ ! -e "$CLAUDE_BACKUP" ]; then
    mv "$CLAUDE_BIN" "$CLAUDE_BACKUP"
    echo "Backed up original: $CLAUDE_BIN -> $CLAUDE_BACKUP"
elif [ -e "$CLAUDE_BIN" ] && [ -e "$CLAUDE_BACKUP" ]; then
    rm "$CLAUDE_BIN"
    echo "Removed existing wrapper (backup preserved)"
fi

# Copy wrapper script
cp "$SCRIPT_DIR/claude-wrapper.py" "$CLAUDE_BIN"
chmod +x "$CLAUDE_BIN"
echo "Installed wrapper: $CLAUDE_BIN"

echo ""
echo "Done! Monitor logs with:"
echo "  tail -f ~/claude-stream-logs/*.log"
