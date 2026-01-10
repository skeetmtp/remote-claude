import { Link, createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/')({ component: App })

function App() {
  return (
    <main className="flex flex-col items-center justify-center pt-20 gap-4">
      <Link to="/login">
        <Button>Login</Button>
      </Link>
      <Link to="/signup">
        <Button>Sign up</Button>
      </Link>
    </main>
  )
}
