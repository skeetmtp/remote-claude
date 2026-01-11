import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { PermissionRequestCard } from '@/components/permission-request-card'
import type { PermissionRequest } from '@/lib/session-store'

export const Route = createFileRoute('/session/$sessionId')({
  component: SessionPage,
})

function SessionPage() {
  const { sessionId } = Route.useParams()
  const [requests, setRequests] = useState<PermissionRequest[]>([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const eventSource = new EventSource(`/api/events?sessionId=${sessionId}`)

    eventSource.addEventListener('connected', () => {
      setConnected(true)
    })

    eventSource.addEventListener('request', (event) => {
      const request = JSON.parse(event.data) as PermissionRequest
      // Parse the timestamp string back to Date
      request.timestamp = new Date(request.timestamp)
      setRequests((prev) => {
        // Avoid duplicates by checking ID
        if (prev.some((r) => r.id === request.id)) {
          return prev
        }
        return [...prev, request]
      })
    })

    eventSource.onerror = () => {
      setConnected(false)
    }

    return () => {
      eventSource.close()
    }
  }, [sessionId])

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2">Session Monitor</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span
            className={`inline-block w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
          />
          <span>{connected ? 'Connected' : 'Disconnected'}</span>
          <span className="mx-2">|</span>
          <span className="font-mono text-xs">{sessionId}</span>
        </div>
      </div>

      {requests.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>Waiting for permission requests...</p>
          <p className="text-sm mt-2">
            Requests will appear here as Claude makes tool calls.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <PermissionRequestCard key={request.id} request={request} />
          ))}
        </div>
      )}
    </div>
  )
}
