import { createFileRoute } from '@tanstack/react-router'
import {
  addSSEClient,
  removeSSEClient,
  getRequests,
} from '@/lib/session-store'

export const Route = createFileRoute('/api/events')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        console.log('[events] Received GET request')

        const url = new URL(request.url)
        const sessionId = url.searchParams.get('sessionId')

        console.log('[events] Session ID:', sessionId)

        if (!sessionId) {
          console.log('[events] Error: Missing sessionId parameter')
          return new Response('Missing sessionId parameter', { status: 400 })
        }

        const stream = new ReadableStream({
          start(controller) {
            console.log(`[events] SSE client connected for session ${sessionId}`)

            // Register this client for the session
            addSSEClient(sessionId, controller)

            // Send connected event
            const connectedEvent = `event: connected\ndata: ${JSON.stringify({ sessionId })}\n\n`
            controller.enqueue(new TextEncoder().encode(connectedEvent))
            console.log(`[events] Sent 'connected' event to session ${sessionId}`)

            // Send existing requests
            const existingRequests = getRequests(sessionId)
            console.log(
              `[events] Sending ${existingRequests.length} existing requests to session ${sessionId}`
            )
            for (const req of existingRequests) {
              const requestEvent = `event: request\ndata: ${JSON.stringify(req)}\n\n`
              controller.enqueue(new TextEncoder().encode(requestEvent))
            }
          },
          cancel() {
            console.log(`[events] SSE client disconnected from session ${sessionId}`)
            // Clean up when client disconnects
            removeSSEClient(sessionId, this as unknown as ReadableStreamDefaultController)
          },
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        })
      },
    },
  },
})
