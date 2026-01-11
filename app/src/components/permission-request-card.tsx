import { useState } from 'react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { PermissionRequest } from '@/lib/session-store'

interface PermissionRequestCardProps {
  request: PermissionRequest
}

export function PermissionRequestCard({ request }: PermissionRequestCardProps) {
  const [expanded, setExpanded] = useState(false)

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <span>{request.toolName}</span>
              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                Auto-approved
              </span>
            </CardTitle>
            <CardDescription className="mt-1">
              <span className="inline-flex items-center rounded bg-secondary px-1.5 py-0.5 text-xs font-medium mr-2">
                {request.hookEventName}
              </span>
              <span className="text-xs">{formatTimestamp(request.timestamp)}</span>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="mb-2 px-0 text-muted-foreground hover:text-foreground"
          >
            {expanded ? 'Hide' : 'Show'} tool input
          </Button>
          {expanded && (
            <pre className="mt-2 overflow-auto rounded bg-muted p-3 text-xs">
              {JSON.stringify(request.toolInput, null, 2)}
            </pre>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
