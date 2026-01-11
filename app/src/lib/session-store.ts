export interface PermissionRequest {
  id: string
  timestamp: Date
  toolName: string
  toolInput: Record<string, unknown>
  hookEventName: string
  permissionMode: string
  decision: 'allow' | 'deny' | 'pending'
}

export interface Session {
  id: string
  requests: PermissionRequest[]
  sseClients: Set<ReadableStreamDefaultController>
}

// In-memory session storage
const sessions = new Map<string, Session>()

export function getOrCreateSession(sessionId: string): Session {
  let session = sessions.get(sessionId)
  if (!session) {
    session = {
      id: sessionId,
      requests: [],
      sseClients: new Set(),
    }
    sessions.set(sessionId, session)
  }
  return session
}

export function addRequest(
  sessionId: string,
  request: Omit<PermissionRequest, 'id' | 'timestamp' | 'decision'>
): PermissionRequest {
  const session = getOrCreateSession(sessionId)
  const fullRequest: PermissionRequest = {
    ...request,
    id: crypto.randomUUID(),
    timestamp: new Date(),
    decision: 'allow', // Auto-approve for now (takeover=false mode)
  }
  session.requests.push(fullRequest)

  // Notify all SSE clients of the new request
  notifySSEClients(sessionId, 'request', fullRequest)

  return fullRequest
}

export function getRequests(sessionId: string): PermissionRequest[] {
  const session = sessions.get(sessionId)
  return session?.requests ?? []
}

export function addSSEClient(
  sessionId: string,
  controller: ReadableStreamDefaultController
): void {
  const session = getOrCreateSession(sessionId)
  session.sseClients.add(controller)
}

export function removeSSEClient(
  sessionId: string,
  controller: ReadableStreamDefaultController
): void {
  const session = sessions.get(sessionId)
  if (session) {
    session.sseClients.delete(controller)
  }
}

export function notifySSEClients(
  sessionId: string,
  event: string,
  data: unknown
): void {
  const session = sessions.get(sessionId)
  if (!session) return

  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

  for (const controller of session.sseClients) {
    try {
      controller.enqueue(new TextEncoder().encode(message))
    } catch {
      // Client disconnected, remove from set
      session.sseClients.delete(controller)
    }
  }
}
