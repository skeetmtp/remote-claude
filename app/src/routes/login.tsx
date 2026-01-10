import { createFileRoute } from '@tanstack/react-router'
import { LoginForm } from '@/components/login-form'

export const Route = createFileRoute('/login')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <main className="flex flex-col items-center justify-center pt-20">
      <LoginForm />
    </main>
  )
}
