import { Link, useNavigate } from '@tanstack/react-router'
import { authClient } from 'lib/auth-client'
import { toast } from 'sonner'
import { Button } from './ui/button'

export default function Header() {
  const { data: session } = authClient.useSession()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          navigate({ to: '/login' })
          toast.success('Logged out successfully')
        },
      },
    })
  }

  return (
    <header className="flex justify-between items-center p-4">
      <Link to="/">
        <h1 className="text-2xl font-bold">My app</h1>
      </Link>

      <nav className="flex gap-4">
        {session ? (
          <Button onClick={handleLogout}>Logout</Button>
        ) : (
          <>
            <Button asChild>
              <Link to="/login">Login</Link>
            </Button>
            <Button asChild>
              <Link to="/signup">Sign up</Link>
            </Button>
          </>
        )}
      </nav>
    </header>
  )
}
