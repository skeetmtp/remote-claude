#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# ///
"""Claude CLI wrapper that logs all stream-json communication.

Usage:
  claude [args]                - Force stream-json mode and log all I/O
  claude --passthrough [args]  - Pass through to original binary without logging
  claude -pt [args]            - Short form of --passthrough
"""

import os
import sys
import signal
import subprocess
import threading
from datetime import datetime
from pathlib import Path

ORIGINAL_BINARY = "/Users/alban/.local/share/claude/versions/2.1.1"
LOG_DIR = Path.home() / "claude-stream-logs"


def filter_args(argv):
    """Filter out wrapper-specific args: --passthrough, -pt, --output-format, --input-format"""
    args = []
    skip_next = False
    for arg in argv:
        if skip_next:
            skip_next = False
            continue
        if arg in ("--passthrough", "-pt"):
            continue
        if arg in ("--output-format", "--input-format"):
            skip_next = True
            continue
        if arg.startswith("--output-format=") or arg.startswith("--input-format="):
            continue
        args.append(arg)
    return args


def main():
    # Check for --passthrough / -pt mode
    if "--passthrough" in sys.argv or "-pt" in sys.argv:
        args = filter_args(sys.argv[1:])
        os.execv(ORIGINAL_BINARY, [ORIGINAL_BINARY] + args)

    LOG_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    log_path = LOG_DIR / f"{timestamp}-{os.getpid()}.log"

    # Build args: filter out wrapper-specific flags
    args = filter_args(sys.argv[1:])

    # Prepend stream-json flags
    full_args = [
        ORIGINAL_BINARY,
        "--output-format", "stream-json",
        "--input-format", "stream-json",
    ] + args

    with open(log_path, "w", buffering=1) as log:
        def log_line(direction: str, line: str):
            ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
            log.write(f"[{ts}] [{direction}] {line}\n")
            log.flush()

        log_line("META", f"Started: {' '.join(full_args)}")
        log_line("META", f"Log file: {log_path}")

        proc = subprocess.Popen(
            full_args,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        # Forward signals to child
        def forward_signal(signum, frame):
            if proc.poll() is None:
                proc.send_signal(signum)
        signal.signal(signal.SIGINT, forward_signal)
        signal.signal(signal.SIGTERM, forward_signal)

        # Thread to read stdin and forward to process
        def stdin_reader():
            try:
                for line in sys.stdin:
                    log_line("STDIN", line.rstrip("\n"))
                    proc.stdin.write(line.encode())
                    proc.stdin.flush()
            except (BrokenPipeError, OSError):
                pass
            finally:
                try:
                    proc.stdin.close()
                except:
                    pass

        # Thread to read stdout and forward to parent
        def stdout_reader():
            try:
                for line in proc.stdout:
                    decoded = line.decode(errors="replace").rstrip("\n")
                    log_line("STDOUT", decoded)
                    sys.stdout.write(decoded + "\n")
                    sys.stdout.flush()
            except (BrokenPipeError, OSError):
                pass

        # Thread to read stderr and forward to parent
        def stderr_reader():
            try:
                for line in proc.stderr:
                    decoded = line.decode(errors="replace").rstrip("\n")
                    log_line("STDERR", decoded)
                    sys.stderr.write(decoded + "\n")
                    sys.stderr.flush()
            except (BrokenPipeError, OSError):
                pass

        threads = [
            threading.Thread(target=stdin_reader, daemon=True),
            threading.Thread(target=stdout_reader, daemon=True),
            threading.Thread(target=stderr_reader, daemon=True),
        ]
        for t in threads:
            t.start()

        proc.wait()

        # Give threads time to flush
        for t in threads:
            t.join(timeout=0.5)

        log_line("META", f"Exited with code: {proc.returncode}")

    sys.exit(proc.returncode)


if __name__ == "__main__":
    main()
