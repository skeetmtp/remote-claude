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

## API Endpoints

### POST /api/hooks

Receives permission requests from the Claude CLI hook plugin.

**Request:**
```json
{
  "hook_event_name": "PermissionRequest",
  "tool_name": "Bash",
  "session_id": "uuid",
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
  -d '{"hook_event_name":"PermissionRequest","tool_name":"Bash","session_id":"test"}'
```

### /api/auth/*

Authentication endpoints handled by Better Auth.

## Project Structure

```
src/
├── routes/           # File-based routes
│   ├── api/          # API endpoints
│   │   ├── auth/     # Auth handlers
│   │   └── hooks.ts  # Hook permission handler
│   ├── __root.tsx    # Root layout
│   ├── index.tsx     # Home page
│   ├── login.tsx     # Login page
│   ├── signup.tsx    # Signup page
│   └── dashboard.tsx # Protected dashboard
├── components/       # React components
│   └── ui/           # shadcn/ui components
├── middleware/       # Server function middleware
├── services/         # Business logic
└── lib/              # Utilities
lib/
├── auth.ts           # Better Auth config
├── auth-client.ts    # Client-side auth
└── middleware.ts     # Route middleware
```

## Environment Variables

Create `.env.development` for local development:

```
HOST=0.0.0.0
PORT=3000
```
