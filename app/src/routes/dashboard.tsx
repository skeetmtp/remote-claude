import { createFileRoute } from '@tanstack/react-router'
import { authMiddleware } from 'lib/middleware'

export const Route = createFileRoute('/dashboard')({
  component: RouteComponent,
  server: {
    middleware: [authMiddleware],
  },
})

function RouteComponent() {
  return <div>Dashboard</div>
}
