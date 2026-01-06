# Unsupported Control Request Log

## Overview

When Claude CLI sends a control request that isn't yet supported by remote-claude, a detailed log entry is automatically created in `logs/unsupported-control-*.log`. This log contains all the information needed to implement support for the new control request type.

## Log Location

Logs are written to:
```
logs/unsupported-control-YYYY-MM-DDTHH-MM-SS-sssZ.log
```

A new log file is created each time the server starts.

## Log Entry Format

Each unsupported control request creates a log entry with:

### 1. Header Information
- **TIMESTAMP**: When the request was received
- **SESSION_ID**: Which Claude session sent the request

### 2. Context Section
Session state when the request was received:
- `sessionStatus`: Current session status (running, starting, etc.)
- `model`: Claude model being used
- `pendingPermissions`: Number of pending permission requests
- `messageHistorySize`: Total message count
- `lastMessages`: Last 3 messages exchanged (structure only, for context)

### 3. Full Raw Message
Complete JSON structure of the control request, ready to copy for testing:
```json
{
  "type": "control_request",
  "request_id": "...",
  "request": {
    "subtype": "new_unsupported_type",
    ...
  }
}
```

### 4. Implementation Guide
Step-by-step instructions for implementing support:
1. Where to add code (handleControlRequest method)
2. What fields to extract
3. UI considerations
4. Response structure requirements

### 5. Request Structure Analysis
Quick reference showing:
- Request ID
- Request Subtype
- All available fields in the request

## How to Implement Support

### Step 1: Review the Log
1. Open the latest `logs/unsupported-control-*.log` file
2. Find the entry for the control request you want to support
3. Copy the full raw message for testing

### Step 2: Update Server Code
In `server/index.js`, locate the `handleControlRequest` method and add a new case:

```javascript
handleControlRequest(msg) {
  const request = msg.request || {};

  // Existing cases...
  if (request.subtype === "can_use_tool") {
    // ...
  }

  // Add your new case here
  if (request.subtype === "your_new_subtype") {
    // Extract fields from request
    const entry = {
      requestId: msg.request_id,
      // Add other fields from the logged message
    };

    // Store if needed
    // this.pendingSomething.set(msg.request_id, entry);

    // Push to client via SSE
    this.pushEvent("your_event_name", entry);
    return;
  }

  // Unsupported handler...
}
```

### Step 3: Add API Endpoint (if needed)
If the control request requires user input/decision:

```javascript
app.post("/api/sessions/:id/your-endpoint", requireSession, (req, res) => {
  // Handle user's decision
  req.session.respondToYourRequest(/* params */);
  res.json({ ok: true });
});
```

### Step 4: Update Client Code
In `public/app.js`:

1. **Listen for the new SSE event:**
```javascript
source.addEventListener("your_event_name", (event) => {
  const payload = JSON.parse(event.data);
  // Handle the event (e.g., show modal, update UI)
});
```

2. **Create UI rendering function:**
```javascript
function renderYourRequest(request) {
  // Create modal, form, or UI element
  // Show relevant data from the request
}
```

3. **Add response handler:**
```javascript
async function respondToYourRequest(decision) {
  await api(`/api/sessions/${state.activeId}/your-endpoint`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ /* your response data */ })
  });
}
```

### Step 5: Send Response to Claude
In your server method, send the control response:

```javascript
respondToYourRequest(requestId, data) {
  const entry = this.pendingSomething.get(requestId);
  if (!entry) throw new Error("Request not found");

  this.pendingSomething.delete(requestId);

  this.send({
    type: "control_response",
    response: {
      subtype: "success",
      request_id: requestId,
      response: {
        // Your response structure
        // Refer to the log or Claude CLI docs for expected format
      }
    }
  });
}
```

### Step 6: Test
1. Trigger the control request again
2. Verify the log file is no longer updated (request is now supported)
3. Test the full flow: request → UI → user action → response → Claude receives it

## Example: Permission Request Implementation

Here's how the existing `can_use_tool` control request was implemented:

**Log showed:**
```json
{
  "type": "control_request",
  "request_id": "abc123",
  "request": {
    "subtype": "can_use_tool",
    "tool_name": "Bash",
    "input": { "command": "ls" },
    "tool_use_id": "toolu_xyz"
  }
}
```

**Implementation:**
1. Added case in `handleControlRequest` for `can_use_tool`
2. Extracted `tool_name`, `input`, `tool_use_id`
3. Created `permission_request` SSE event
4. Added `/api/sessions/:id/permissions` endpoint
5. Client renders modal with Allow/Deny buttons
6. Server sends back control_response with behavior + updatedInput

## Troubleshooting

### Log file not created
- Check that logging is enabled (`enableLogging: true` in config)
- Verify logs directory exists and is writable

### Empty or incomplete log entries
- Check that the control request is actually reaching the server
- Verify Claude CLI is sending properly formatted JSON
- Check server console for errors

### Response not working
- Verify your control_response structure matches Claude's expectations
- Check the `request_id` matches the original request
- Review Claude CLI documentation for the expected response format

## Reference

- See `FORMAT.md` for the complete Claude CLI protocol specification
- See `spec.md` for remote-claude architecture and API details
- See existing implementations in `server/index.js` for patterns to follow
