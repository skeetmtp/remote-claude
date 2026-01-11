import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { addRequest } from '@/lib/session-store'
import { Flashlight } from 'lucide-react'
import { fa } from 'zod/v4/locales'


/* ex
{
    "session_id": "1e99ece0-8b47-4d93-97f0-89fe76b080a9",
    "transcript_path": "/Users/alban/.claude/projects/-Users-alban-Developer-tanstack-remote-claude/1e99ece0-8b47-4d93-97f0-89fe76b080a9.jsonl",
    "cwd": "/Users/alban/Developer/tanstack/remote-claude",
    "permission_mode": "plan",
    "hook_event_name": "PreToolUse",
    "tool_name": "AskUserQuestion",
    "tool_input": {
        "questions": [
            {
                "question": "Are you happy?",
                "header": "Mood check",
                "options": [
                    {
                        "label": "Yes",
                        "description": "I'm happy"
                    },
                    {
                        "label": "No",
                        "description": "I'm not happy"
                    }
                ],
                "multiSelect": false
            }
        ]
    },
    "tool_use_id": "toolu_01HnbiCesU5ki69DdsRXZcCz"
}*/

// Generate output based on hook event name (matching hook-prompt.js format)
const generateOutput = (hookData: any) => {
  const hookEventName = hookData.hook_event_name;
  const toolName = hookData.tool_name;
  const baseOutput = {
    hookSpecificOutput: {
      hookEventName,
    } as Record<string, any>,
  }

  if (hookEventName === 'PermissionRequest') {
    baseOutput.hookSpecificOutput.decision = { behavior: 'allow' }
    if(toolName === 'AskUserQuestion') {
      const answers = {} as Record<string, string>;
      for(const entry of hookData.tool_input.questions) {
        answers[entry.question] = entry.options[0].label;
      }
      const questions = hookData.tool_input.questions;
      questions[0].options = questions[0].options.slice(0, 1);
      // baseOutput.hookSpecificOutput.decision = 'approve';
      baseOutput.hookSpecificOutput.updatedInput = {
        // questions: hookData.tool_input.questions,
        // questions,
        answers: {} as Record<string, string>,
      };
      for(const entry of hookData.tool_input.questions) {
        baseOutput.hookSpecificOutput.updatedInput.answers[entry.question] = entry.options[0].label;
      }
      baseOutput.hookSpecificOutput.updatedInput = {
        answers,
      };
      baseOutput.hookSpecificOutput.permissionDecisionReason = JSON.stringify(answers);
      baseOutput.hookSpecificOutput.message = JSON.stringify(answers);
    }
  } else if (hookEventName === 'PostToolUse') {
    return undefined;
    if(toolName === 'AskUserQuestion') {
      const answers = {} as Record<string, string>;
      for(const entry of hookData.tool_input.questions) {
        answers[entry.question] = entry.options[0].label;
      }
      baseOutput.hookSpecificOutput.additionalContext = JSON.stringify(answers);
    }
    else {
      return undefined;
    }
  } else if (hookEventName === 'PreToolUse') {
    return undefined;
    baseOutput.hookSpecificOutput.permissionDecision = 'allow'
    baseOutput.hookSpecificOutput.permissionDecisionReason = 'Auto-approved by server'
    if(toolName === 'AskUserQuestion') {
      const answers = {} as Record<string, string>;
      for(const entry of hookData.tool_input.questions) {
        answers[entry.question] = entry.options[0].label;
      }
      /*
      // baseOutput.hookSpecificOutput.decision = 'approve';
      const questions = hookData.tool_input.questions;
      baseOutput.hookSpecificOutput.updatedInput = {
        questions,
        answers,
      };
      for(const entry of hookData.tool_input.questions) {
        baseOutput.hookSpecificOutput.updatedInput.answers[entry.question] = entry.options[0].label;
      }
      */
      baseOutput.hookSpecificOutput.permissionDecisionReason = JSON.stringify(answers);
    }
  } else {
    return undefined;
    // Fallback for unknown event types
    baseOutput.hookSpecificOutput.permissionDecision = 'allow'
    baseOutput.hookSpecificOutput.permissionDecisionReason =
      'Auto-approved by server (unknown event type)'
  }

  return baseOutput
}

const TAKEOVER = false;

export const Route = createFileRoute('/api/hooks')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const hookData = await request.json()
        const hookEventName = hookData.hook_event_name || 'PreToolUse'
        const sessionId = hookData.session_id

        // Store the permission request if we have a session ID
        if (sessionId && hookEventName === 'PermissionRequest') {
          addRequest(sessionId, {
            toolName: hookData.tool_name || 'unknown',
            toolInput: hookData.tool_input || {},
            hookEventName,
            permissionMode: hookData.permission_mode || 'unknown',
          })
        }

        let output;
        // eslint-disable-next-line
        if (TAKEOVER) {
          output = generateOutput(hookData)
        }

        return json({
          exitCode: 0,
          stdout: JSON.stringify(output),
        })
      },
    },
  },
})
