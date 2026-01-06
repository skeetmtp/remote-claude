# Claude CLI Stream-JSON Protocol Format

This document describes the stdin/stdout message format used when communicating with Claude CLI in `stream-json` mode.

## Overview

Claude CLI is spawned with the following arguments:

```bash
claude --input-format stream-json --output-format stream-json --verbose --permission-prompt-tool stdio [--model <MODEL>]
```

All messages are sent as **newline-delimited JSON** (one JSON object per line).

## Input Format (stdin → Claude)

Messages sent to Claude CLI via stdin.

### User Message

Send a user message to Claude:

```json
{
  "type": "user",
  "session_id": "",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "text",
        "text": "Hello, Claude!"
      }
    ]
  },
  "parent_tool_use_id": null
}
```

**Fields:**
- `type`: Always `"user"`
- `session_id`: String (can be empty)
- `message.role`: Always `"user"`
- `message.content`: Array of content blocks (typically text)
- `parent_tool_use_id`: Optional tool context (usually `null`)

### Control Request

Send control commands to Claude:

```json
{
  "type": "control_request",
  "request_id": "unique-request-id",
  "request": {
    "subtype": "interrupt"
  }
}
```

**Supported subtypes:**
- `"interrupt"` - Stop Claude's current operation

### Control Response

Respond to Claude's control requests (e.g., tool permissions):

**Example - Allow a tool:**
```json
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "matching-request-id",
    "response": {
      "behavior": "allow",
      "updatedInput": {
        "file_path": "/path/to/file.txt",
        "content": "file contents"
      },
      "toolUseID": "tool-use-id-from-request"
    }
  }
}
```

**Example - Deny a tool:**
```json
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "matching-request-id",
    "response": {
      "behavior": "deny",
      "message": "User declined this operation",
      "toolUseID": "tool-use-id-from-request"
    }
  }
}
```

**For tool permissions:**
- `behavior`: `"allow"` or `"deny"`
- `message`: Optional string (used for deny reason, only for deny behavior)
- `updatedInput`: Required when behavior is "allow" - contains the tool input (potentially modified). For `AskUserQuestion`, this contains the user's answers (see below)
- `toolUseID`: Must match the `tool_use_id` from the control request

**Special case - AskUserQuestion:**

When allowing an `AskUserQuestion` tool, use `updatedInput` instead of `message`:

```json
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "matching-request-id",
    "response": {
      "behavior": "allow",
      "updatedInput": {
        "answers": {
          "0": "Yes",
          "1": ["Option1", "Option2"]
        }
      },
      "toolUseID": "tool-use-id-from-request"
    }
  }
}
```

**Answer format:**
- Keys are question indices as strings (`"0"`, `"1"`, etc.)
- Single-select: String value (e.g., `"Yes"`)
- Multi-select: Array of strings (e.g., `["Option1", "Option2"]`)

## Output Format (Claude → stdout)

Messages received from Claude CLI via stdout.

### Assistant Message

Claude's response with text or tool usage:

```json
{
  "type": "assistant",
  "message": {
    "model": "claude-sonnet-4-5-20250929",
    "id": "msg_123abc",
    "type": "message",
    "role": "assistant",
    "content": [
      {
        "type": "text",
        "text": "Hello! How can I help you?"
      }
    ],
    "stop_reason": "end_turn",
    "usage": {
      "input_tokens": 100,
      "output_tokens": 50
    }
  },
  "session_id": "session-uuid",
  "uuid": "message-uuid"
}
```

**Content types:**
- `"text"` - Assistant's text response
- `"tool_use"` - Claude requesting to use a tool

**Streaming deltas:**

During streaming, Claude sends partial updates:

```json
{
  "type": "assistant",
  "delta": {
    "type": "content_block_delta",
    "index": 0,
    "delta": {
      "type": "text_delta",
      "text": "partial text"
    }
  }
}
```

### Control Request (Tool Permissions)

Claude requesting permission to use a tool:

```json
{
  "type": "control_request",
  "message": {
    "type": "control_request",
    "request_id": "unique-request-id",
    "request": {
      "subtype": "can_use_tool",
      "tool_name": "Bash",
      "input": {
        "command": "ls -la"
      },
      "permission_suggestions": [
        {
          "behavior": "allow",
          "message": "Safe to run"
        }
      ],
      "tool_use_id": "toolu_xyz"
    }
  }
}
```

**Fields:**
- `subtype`: `"can_use_tool"`
- `tool_name`: Name of the tool (e.g., `"Bash"`, `"Read"`, `"AskUserQuestion"`)
- `input`: Tool-specific parameters
- `permission_suggestions`: Optional hints for UI
- `tool_use_id`: Unique ID for this tool invocation

**AskUserQuestion format:**

```json
{
  "type": "control_request",
  "request": {
    "subtype": "can_use_tool",
    "tool_name": "AskUserQuestion",
    "input": {
      "questions": [
        {
          "question": "Would you like to proceed?",
          "header": "Confirm",
          "options": [
            {
              "label": "Yes",
              "description": "Proceed with the action"
            },
            {
              "label": "No",
              "description": "Cancel"
            }
          ],
          "multiSelect": false
        }
      ]
    },
    "tool_use_id": "toolu_abc"
  }
}
```

### User Message Echo

When Claude receives a user message, it echoes it back:

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "text",
        "text": "User's message"
      }
    ]
  }
}
```

### Tool Result

When a tool completes or errors:

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "content": "Tool output or error message",
        "is_error": false,
        "tool_use_id": "toolu_xyz"
      }
    ]
  },
  "tool_use_result": "Success or Error: message"
}
```

## Error Handling

If Claude encounters an error with malformed input, it may send:

```json
{
  "type": "error",
  "error": {
    "type": "invalid_request",
    "message": "Description of what went wrong"
  }
}
```

## Example Flow

1. **Send user message:**
   ```json
   {"type":"user","session_id":"","message":{"role":"user","content":[{"type":"text","text":"What is 2+2?"}]},"parent_tool_use_id":null}
   ```

2. **Receive assistant response:**
   ```json
   {"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"2 + 2 = 4"}],"stop_reason":"end_turn"}}
   ```

3. **Receive permission request (if Claude wants to use a tool):**
   ```json
   {"type":"control_request","request_id":"req123","request":{"subtype":"can_use_tool","tool_name":"Bash","input":{"command":"date"},"tool_use_id":"toolu_1"}}
   ```

4. **Send permission response:**
   ```json
   {"type":"control_response","response":{"subtype":"success","request_id":"req123","response":{"behavior":"allow","updatedInput":{"command":"date"},"toolUseID":"toolu_1"}}}
   ```

## Notes

- All messages must be single-line JSON (no newlines within the JSON)
- Each message must end with a newline character (`\n`)
- The protocol is synchronous for control requests - wait for response before continuing
- When denying a tool, Claude will not execute it and will inform the user
- The `--verbose` flag provides additional debugging output on stderr
