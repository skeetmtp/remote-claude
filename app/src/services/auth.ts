import { getRequestHeaders } from '@tanstack/react-start/server'
import { auth } from 'lib/auth'
import { createServerFn } from '@tanstack/react-start'

export const getSessionFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const headers = getRequestHeaders()
    const session = await auth.api.getSession({
      headers,
    })

    return session
  },
)
