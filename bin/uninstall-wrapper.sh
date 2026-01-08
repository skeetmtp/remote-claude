#!/bin/bash
set -e

CLAUDE_BIN="/Users/alban/.local/bin/claude"
CLAUDE_BACKUP="/Users/alban/.local/bin/claude.symlink.bak"

echo "Claude CLI Wrapper Uninstaller"
echo "=============================="

if [ ! -e "$CLAUDE_BACKUP" ]; then
    echo "Error: No backup found at $CLAUDE_BACKUP"
    exit 1
fi

rm -f "$CLAUDE_BIN"
mv "$CLAUDE_BACKUP" "$CLAUDE_BIN"
echo "Restored original: $CLAUDE_BACKUP -> $CLAUDE_BIN"
echo ""
echo "Done! Original Claude CLI restored."
echo "Log files preserved in ~/claude-stream-logs/"
