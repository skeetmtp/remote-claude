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

### Initialize Request

Initialize the Claude CLI session (sent at startup):

```json
{
  "type": "control_request",
  "request_id": "unique-request-id",
  "request": {
    "subtype": "initialize",
    "hooks": {
      "PreToolUse": [
        {
          "matcher": "Edit|Write|MultiEdit",
          "hookCallbackIds": ["hook_0"]
        }
      ],
      "PostToolUse": [
        {
          "matcher": "Edit|Write|MultiEdit",
          "hookCallbackIds": ["hook_1"]
        }
      ]
    },
    "sdkMcpServers": ["claude-vscode"],
    "appendSystemPrompt": "Additional system prompt text..."
  }
}
```

**Fields:**
- `subtype`: `"initialize"`
- `hooks`: Optional object mapping hook types to matchers and callback IDs
- `sdkMcpServers`: Optional array of SDK MCP server names
- `appendSystemPrompt`: Optional additional text to append to the system prompt

### Control Request (Interrupt)

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

### MCP Message Request

Forward messages to/from MCP servers:

```json
{
  "type": "control_request",
  "request_id": "unique-request-id",
  "request": {
    "subtype": "mcp_message",
    "server_name": "claude-vscode",
    "message": {
      "method": "initialize",
      "params": {
        "protocolVersion": "2025-11-25",
        "capabilities": {},
        "clientInfo": {"name": "claude-code", "version": "2.1.1"}
      },
      "jsonrpc": "2.0",
      "id": 0
    }
  }
}
```

**Fields:**
- `subtype`: `"mcp_message"`
- `server_name`: Name of the MCP server
- `message`: JSON-RPC message to send to/from the server

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

**Example - Allow with permission suggestion (e.g., "Always allow"):**
```json
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "matching-request-id",
    "response": {
      "behavior": "allow",
      "updatedInput": {
        "command": "git show --stat abc123"
      },
      "toolUseID": "tool-use-id-from-request",
      "applyPermissionSuggestion": {
        "type": "addRules",
        "rules": [
          {
            "toolName": "Bash",
            "ruleContent": "git show:*"
          }
        ],
        "behavior": "allow",
        "destination": "localSettings"
      }
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
- `applyPermissionSuggestion`: Optional object (when user selects a permission suggestion like "Always allow", include the full suggestion object from the request)

**Special case - AskUserQuestion:**

When allowing an `AskUserQuestion` tool, include the original `questions` array and `answers` in `updatedInput`:

```json
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "matching-request-id",
    "response": {
      "behavior": "allow",
      "updatedInput": {
        "questions": [
          {
            "question": "Yes or no?",
            "header": "Choice",
            "options": [
              {"label": "Yes", "description": "Affirmative response"},
              {"label": "No", "description": "Negative response"}
            ],
            "multiSelect": false
          }
        ],
        "answers": {
          "Yes or no?": "Yes"
        }
      },
      "toolUseID": "tool-use-id-from-request"
    }
  }
}
```

**Answer format:**
- Keys are the question text strings (e.g., `"Yes or no?"`)
- Single-select: String value (e.g., `"Yes"`)
- Multi-select: Array of strings (e.g., `["Option1", "Option2"]`)

**MCP Message Response:**

When responding to an MCP message control request:

```json
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "matching-request-id",
    "response": {
      "mcp_response": {
        "result": {
          "protocolVersion": "2025-11-25",
          "capabilities": {"tools": {}},
          "serverInfo": {"name": "claude-vscode", "version": "2.0.75"}
        },
        "jsonrpc": "2.0",
        "id": 0
      }
    }
  }
}
```

## Output Format (Claude → stdout)

Messages received from Claude CLI via stdout.

### Initialize Response

Response to the initialize control request, containing session configuration:

```json
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "matching-request-id",
    "response": {
      "commands": [
        {
          "name": "compact",
          "description": "Clear conversation history but keep a summary in context",
          "argumentHint": "<optional custom summarization instructions>"
        },
        {
          "name": "context",
          "description": "Show current context usage",
          "argumentHint": ""
        }
      ],
      "output_style": "default",
      "available_output_styles": ["default", "Explanatory", "Learning"],
      "models": [
        {
          "value": "default",
          "displayName": "Default (recommended)",
          "description": "Opus 4.5 · Most capable for complex work"
        },
        {
          "value": "sonnet",
          "displayName": "Sonnet",
          "description": "Sonnet 4.5 · Best for everyday tasks"
        }
      ],
      "account": {
        "email": "user@example.com",
        "organization": "Organization Name",
        "subscriptionType": "Claude Team"
      }
    }
  }
}
```

### Assistant Message

Claude's response with text or tool usage:

```json
{
  "type": "assistant",
  "message": {
    "model": "claude-opus-4-5-20251101",
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
  "parent_tool_use_id": null,
  "session_id": "session-uuid",
  "uuid": "message-uuid"
}
```

**Content types:**
- `"text"` - Assistant's text response
- `"tool_use"` - Claude requesting to use a tool

**Streaming events:**

During streaming, Claude sends `stream_event` messages with various event types:

```json
{
  "type": "stream_event",
  "event": {
    "type": "message_start",
    "message": {
      "model": "claude-opus-4-5-20251101",
      "id": "msg_123abc",
      "type": "message",
      "role": "assistant",
      "content": [],
      "stop_reason": null,
      "usage": {"input_tokens": 3, "output_tokens": 1}
    }
  },
  "session_id": "session-uuid",
  "parent_tool_use_id": null,
  "uuid": "event-uuid"
}
```

**Stream event types:**
- `message_start` - Initial message metadata
- `content_block_start` - Start of a content block (text or tool_use)
- `content_block_delta` - Partial content updates
- `content_block_stop` - End of a content block
- `message_delta` - Updates to message metadata (stop_reason, usage)
- `message_stop` - End of the message stream

**Content block delta example:**
```json
{
  "type": "stream_event",
  "event": {
    "type": "content_block_delta",
    "index": 0,
    "delta": {
      "type": "text_delta",
      "text": "partial text"
    }
  },
  "session_id": "session-uuid",
  "parent_tool_use_id": null,
  "uuid": "event-uuid"
}
```

**Tool use input delta example:**
```json
{
  "type": "stream_event",
  "event": {
    "type": "content_block_delta",
    "index": 0,
    "delta": {
      "type": "input_json_delta",
      "partial_json": "{\"quest"
    }
  },
  "session_id": "session-uuid",
  "parent_tool_use_id": null,
  "uuid": "event-uuid"
}
```

### Control Request (Tool Permissions)

Claude requesting permission to use a tool:

```json
{
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
        "type": "addRules",
        "rules": [
          {
            "toolName": "Bash",
            "ruleContent": "git show:*"
          }
        ],
        "behavior": "allow",
        "destination": "localSettings"
      }
    ],
    "tool_use_id": "toolu_xyz"
  }
}
```

**Fields:**
- `subtype`: `"can_use_tool"`
- `tool_name`: Name of the tool (e.g., `"Bash"`, `"Read"`, `"AskUserQuestion"`)
- `input`: Tool-specific parameters
- `permission_suggestions`: Optional array of permission rule suggestions (e.g., "Always allow git show:*") that can be applied to Claude's permission settings
- `tool_use_id`: Unique ID for this tool invocation

**Permission suggestion structure:**
- `type`: Currently only `"addRules"` is supported
- `rules`: Array of rule objects with `toolName` and `ruleContent` (pattern)
- `behavior`: `"allow"` or `"deny"`
- `destination`: Where to save the rule (e.g., `"localSettings"`)

**AskUserQuestion format:**

```json
{
  "type": "control_request",
  "request_id": "unique-request-id",
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
  "parent_tool_use_id": null,
  "session_id": "session-uuid",
  "uuid": "result-uuid",
  "tool_use_result": {
    "questions": [...],
    "answers": {"Question text?": "Answer"}
  }
}
```

**Notes:**
- `tool_use_result`: Contains the full result object (structure varies by tool)
- For `AskUserQuestion`, contains `questions` array and `answers` object

### Auth Status

Authentication status update (sent during initialization):

```json
{
  "type": "auth_status",
  "isAuthenticating": false,
  "output": [],
  "uuid": "auth-uuid",
  "session_id": "session-uuid"
}
```

### System Init

Session initialization message (sent when user sends first message):

```json
{
  "type": "system",
  "subtype": "init",
  "cwd": "/current/working/directory",
  "session_id": "session-uuid",
  "tools": ["Task", "Bash", "Glob", "Grep", "Read", "Edit", "Write", "..."],
  "mcp_servers": [
    {"name": "claude-vscode", "status": "connected"}
  ],
  "model": "claude-opus-4-5-20251101",
  "permissionMode": "default",
  "slash_commands": ["compact", "context", "cost", "init", "..."],
  "apiKeySource": "none",
  "claude_code_version": "2.1.1",
  "output_style": "default",
  "agents": ["Bash", "general-purpose", "Explore", "Plan", "..."],
  "skills": [],
  "plugins": [
    {"name": "plugin-name", "path": "/path/to/plugin"}
  ],
  "uuid": "init-uuid"
}
```

### Result

Final result message when Claude completes a turn:

```json
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "duration_ms": 3136,
  "duration_api_ms": 12925,
  "num_turns": 1,
  "result": "Final assistant response text",
  "session_id": "session-uuid",
  "total_cost_usd": 0.18986465,
  "usage": {
    "input_tokens": 3,
    "cache_creation_input_tokens": 20336,
    "cache_read_input_tokens": 0,
    "output_tokens": 12,
    "server_tool_use": {
      "web_search_requests": 0,
      "web_fetch_requests": 0
    },
    "service_tier": "standard"
  },
  "modelUsage": {
    "claude-opus-4-5-20251101": {
      "inputTokens": 9,
      "outputTokens": 122,
      "cacheReadInputTokens": 9209,
      "cacheCreationInputTokens": 28341,
      "webSearchRequests": 0,
      "costUSD": 0.18483075,
      "contextWindow": 200000
    }
  },
  "permission_denials": [],
  "uuid": "result-uuid"
}
```

**Fields:**
- `subtype`: `"success"` or `"error"`
- `is_error`: Boolean indicating if the result is an error
- `duration_ms`: Total duration in milliseconds
- `duration_api_ms`: API call duration in milliseconds
- `num_turns`: Number of conversation turns
- `result`: The final text output
- `total_cost_usd`: Total cost in USD
- `usage`: Token usage statistics
- `modelUsage`: Per-model usage breakdown
- `permission_denials`: Array of denied permission requests

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
