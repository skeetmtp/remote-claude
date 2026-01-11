# Remote Claude Web App

Web application for remote permission handling of Claude CLI sessions.

## Setup

```bash
pnpm install
```

## Development

```bash
pnpm dev        # Start dev server on port 3000
pnpm build      # Build for production
pnpm preview    # Preview production build
pnpm test       # Run tests
pnpm check      # Format and lint with auto-fix
```

## Tech Stack

- **Framework**: React 19 + TanStack Start
- **Routing**: TanStack Router (file-based)
- **Server**: Nitro
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **Auth**: Better Auth with SQLite
- **Forms**: TanStack Form
- **Build**: Vite

## Features

### Session Monitoring

View Claude CLI permission requests in real-time through a web interface:

1. **Proxy generates session ID** - Each proxy session gets a unique UUID
2. **Hook sends requests** - Claude CLI hooks send permission requests to `/api/hooks` with session ID
3. **Real-time updates** - Web app stores requests and broadcasts via SSE to connected clients
4. **Remote viewing** - Open `/session/{session-id}` in any browser to monitor requests
5. **Auto-approval** - Currently all requests are auto-approved (takeover mode coming soon)

**Usage:**
```bash
# Start the web app
cd app && pnpm dev

# Start proxy (in another terminal)
cd proxy && npm run dev

# Note the session ID from proxy output
# Open browser to: http://localhost:3000/session/{session-id}
# Run Claude commands - see requests appear in real-time
```

## API Endpoints

### POST /api/hooks

Receives permission requests from the Claude CLI hook plugin. Stores requests in memory and notifies connected SSE clients.

**Request:**
```json
{
  "hook_event_name": "PermissionRequest",
  "tool_name": "Bash",
  "session_id": "uuid",
  "permission_mode": "allow",
  "tool_input": { ... }
}
```

**Response:**
```json
{
  "exitCode": 0,
  "stdout": "{\"hookSpecificOutput\":{\"hookEventName\":\"PermissionRequest\",\"decision\":{\"behavior\":\"allow\"}}}"
}
```

**Test with curl:**
```bash
curl -X POST http://localhost:3000/api/hooks \
  -H "Content-Type: application/json" \
  -d '{"hook_event_name":"PermissionRequest","tool_name":"Bash","session_id":"test","permission_mode":"allow","tool_input":{}}'
```

### GET /api/events

Server-Sent Events (SSE) endpoint for real-time permission request updates. Clients connect with a session ID and receive events when new permission requests are made.

**Query Parameters:**
- `sessionId` (required) - UUID of the session to monitor

**Events:**
- `connected` - Sent when client connects, includes sessionId
- `request` - Sent when new permission request is received, includes full request data

**Example:**
```javascript
const eventSource = new EventSource('/api/events?sessionId=your-uuid-here')
eventSource.addEventListener('request', (event) => {
  const request = JSON.parse(event.data)
  console.log('New request:', request)
})
```

### /api/auth/*

Authentication endpoints handled by Better Auth.

## Project Structure

```
src/
├── routes/                         # File-based routes
│   ├── api/                        # API endpoints
│   │   ├── auth/                   # Auth handlers
│   │   ├── events.ts               # SSE endpoint for real-time updates
│   │   └── hooks.ts                # Hook permission handler
│   ├── session/                    # Session monitoring
│   │   └── $sessionId.tsx          # Session page (dynamic route)
│   ├── __root.tsx                  # Root layout
│   ├── index.tsx                   # Home page
│   ├── login.tsx                   # Login page
│   ├── signup.tsx                  # Signup page
│   └── dashboard.tsx               # Protected dashboard
├── components/                     # React components
│   ├── permission-request-card.tsx # Permission request display component
│   └── ui/                         # shadcn/ui components
├── middleware/                     # Server function middleware
├── services/                       # Business logic
└── lib/                            # Utilities
    ├── session-store.ts            # In-memory session/request storage
    ├── auth.ts                     # Better Auth config
    ├── auth-client.ts              # Client-side auth
    └── middleware.ts               # Route middleware
```

## Environment Variables

Create `.env.development` for local development:

```
HOST=0.0.0.0
PORT=3000
```
