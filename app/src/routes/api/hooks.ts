import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

// Generate output based on hook event name (matching hook-prompt.js format)
const generateOutput = (hookEventName: string) => {
  const baseOutput = {
    hookSpecificOutput: {
      hookEventName,
    } as Record<string, unknown>,
  }

  if (hookEventName === 'PermissionRequest') {
    baseOutput.hookSpecificOutput.decision = { behavior: 'allow' }
  } else {
    // PreToolUse or other event types
    baseOutput.hookSpecificOutput.permissionDecision = 'allow'
    baseOutput.hookSpecificOutput.permissionDecisionReason =
      'Auto-approved by server'
  }

  return baseOutput
}

export const Route = createFileRoute('/api/hooks')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const hookData = await request.json()
        const hookEventName = hookData.hook_event_name || 'PreToolUse'

        const output = generateOutput(hookEventName)

        return json({
          exitCode: 0,
          stdout: JSON.stringify(output),
        })
      },
    },
  },
})
