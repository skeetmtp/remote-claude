import { createFileRoute } from '@tanstack/react-router'
import { notifySSEClients } from '@/lib/session-store'

export const Route = createFileRoute('/api/override')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        console.log('[override] Received POST request')

        const body = await request.json()
        const { sessionId, prompt } = body as {
          sessionId: string
          prompt: string
        }

        console.log('[override] Parsed body:', { sessionId, prompt })

        if (!sessionId || !prompt) {
          console.log('[override] Error: Missing sessionId or prompt')
          return new Response(
            JSON.stringify({ error: 'Missing sessionId or prompt' }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }

        // Send override event to all connected proxy clients
        console.log(
          `[override] Sending override event to session ${sessionId} with prompt: "${prompt}"`
        )
        notifySSEClients(sessionId, 'override', prompt)

        console.log('[override] Override event sent successfully')
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
