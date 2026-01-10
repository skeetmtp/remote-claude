import { createFileRoute } from '@tanstack/react-router'
import { SignupForm } from '@/components/signup-form'

export const Route = createFileRoute('/signup')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <main className="flex flex-col items-center justify-center pt-20">
      <SignupForm />
    </main>
  )
}
