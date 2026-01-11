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
        const url = new URL(request.url)
        const sessionId = url.searchParams.get('sessionId')

        if (!sessionId) {
          return new Response('Missing sessionId parameter', { status: 400 })
        }

        const stream = new ReadableStream({
          start(controller) {
            // Register this client for the session
            addSSEClient(sessionId, controller)

            // Send connected event
            const connectedEvent = `event: connected\ndata: ${JSON.stringify({ sessionId })}\n\n`
            controller.enqueue(new TextEncoder().encode(connectedEvent))

            // Send existing requests
            const existingRequests = getRequests(sessionId)
            for (const req of existingRequests) {
              const requestEvent = `event: request\ndata: ${JSON.stringify(req)}\n\n`
              controller.enqueue(new TextEncoder().encode(requestEvent))
            }
          },
          cancel() {
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
