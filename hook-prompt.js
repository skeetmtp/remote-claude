#!/usr/bin/env node

const readline = require('readline');

const autoAllow = process.argv.includes('-a');
const skipExit = process.argv.includes('-s');

// Parse -s number option
let skipExitCode = 0;
const skipIndex = process.argv.indexOf('-s');
if (skipIndex !== -1 && skipIndex + 1 < process.argv.length) {
  const exitCode = parseInt(process.argv[skipIndex + 1], 10);
  if (!isNaN(exitCode)) {
    skipExitCode = exitCode;
  }
}

const logFile = '/Users/alban/Developer/tanstack/remote-claude/hook-prompt.log';

const logInput = (inputData) => {
  const fs = require('fs');
  fs.appendFileSync(logFile, 'Input: ' + inputData + '\n');
};


const logOutput = (outputData) => {
  const fs = require('fs');
  fs.appendFileSync(logFile, 'Output: ' + outputData + '\n');
};

// Generate output structure based on hook event name
const generateOutput = (hookEventName, decision, reason) => {
  const baseOutput = {
    hookSpecificOutput: {
      hookEventName: hookEventName
    }
  };

  if (hookEventName === 'PermissionRequest') {
    baseOutput.hookSpecificOutput.decision = {
      behavior: decision
    };
  } else if (hookEventName === 'PreToolUse') {
    baseOutput.hookSpecificOutput.permissionDecision = decision;
    baseOutput.hookSpecificOutput.permissionDecisionReason = reason;
  } else {
    // Fallback for unknown event types
    baseOutput.hookSpecificOutput.permissionDecision = decision;
    baseOutput.hookSpecificOutput.permissionDecisionReason = reason;
  }

  return baseOutput;
};

// Read JSON from stdin
let inputData = '';

process.stdin.on('data', (chunk) => {
  inputData += chunk;
});

process.stdin.on('end', () => {
  try {
    // Skip output and exit if -s flag is set
    if (skipExit) {
      process.exit(skipExitCode);
    }

    // Append inputData to hooks.log
    logInput(inputData);

    const hookData = JSON.parse(inputData);
    const hookEventName = hookData.hook_event_name || 'PreToolUse';

    // Auto-allow if -a flag is set
    if (autoAllow) {
      const reason = "Auto-approved via -a flag";
      const result = generateOutput(hookEventName, "allow", reason);
      console.log(JSON.stringify(result));
      logOutput(JSON.stringify(result));
      process.exit(0);
    }

    // Create readline interface for user prompt
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr, // Use stderr for prompts so stdout stays clean for JSON output
      terminal: true
    });

    // Reopen stdin for interactive input
    const fs = require('fs');
    const stdinFd = process.platform === 'win32' ? 'conin$' : '/dev/tty';
    const ttyStream = fs.createReadStream(stdinFd);

    const rlInteractive = readline.createInterface({
      input: ttyStream,
      output: process.stderr
    });

    // Display hook information
    console.error(`\n=== Claude Code Hook: ${hookEventName} ===`);
    console.error(`Tool: ${hookData.tool_name}`);
    console.error(`Session: ${hookData.session_id}`);
    console.error(`Permission Mode: ${hookData.permission_mode}`);
    console.error('\nTool Input:');
    console.error(JSON.stringify(hookData.tool_input, null, 2));
    console.error('\n====================================\n');

    // Prompt user
    rlInteractive.question('Allow this tool use? (allow/deny): ', (answer) => {
      const normalized = answer.trim().toLowerCase();

      let result;
      if (normalized === 'allow' || normalized === 'a' || normalized === 'yes' || normalized === 'y') {
        const reason = "User approved the tool use";
        result = generateOutput(hookEventName, "allow", reason);
      } else {
        const reason = answer.trim() === normalized ? 'User denied the tool use' : answer.trim();
        result = generateOutput(hookEventName, "deny", reason);
      }

      // Output decision as JSON to stdout
      console.log(JSON.stringify(result));
      logOutput(JSON.stringify(result));

      rlInteractive.close();
      process.exit(0);
    });

  } catch (error) {
    console.error('Error parsing input:', error.message);
    // Try to extract hook event name from input if possible, otherwise default
    let hookEventName = 'PreToolUse';
    try {
      const parsed = JSON.parse(inputData);
      hookEventName = parsed.hook_event_name || 'PreToolUse';
    } catch (e) {
      // If we can't parse, use default
    }
    const result = generateOutput(hookEventName, "deny", `Hook error: ${error.message}`);
    console.log(JSON.stringify(result));
    logOutput(JSON.stringify(result));
    process.exit(0);
  }
});
