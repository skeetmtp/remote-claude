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

interface Question {
  question: string
  header: string
  options: Array<{
    label: string
    description: string
  }>
  multiSelect: boolean
}

interface AskUserQuestionInput {
  questions: Question[]
}

interface AskUserQuestionCardProps {
  request: PermissionRequest
  sessionId: string
}

export function AskUserQuestionCard({
  request,
  sessionId,
}: AskUserQuestionCardProps) {
  const [selectedAnswers, setSelectedAnswers] = useState<
    Record<number, string>
  >({})
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const toolInput = request.toolInput as AskUserQuestionInput
  const questions = toolInput?.questions ?? []

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const handleOptionClick = async (
    questionIndex: number,
    question: Question,
    optionLabel: string
  ) => {
    if (sent || sending) return

    setSelectedAnswers((prev) => ({
      ...prev,
      [questionIndex]: optionLabel,
    }))

    setSending(true)

    const prompt = `${question.question}:${optionLabel}`

    try {
      await fetch('/api/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, prompt }),
      })
      setSent(true)
    } catch (error) {
      console.error('Failed to send override:', error)
    } finally {
      setSending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <span>{request.toolName}</span>
              {sent ? (
                <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                  Answered
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                  Waiting for answer
                </span>
              )}
            </CardTitle>
            <CardDescription className="mt-1">
              <span className="mr-2 inline-flex items-center rounded bg-secondary px-1.5 py-0.5 text-xs font-medium">
                {request.hookEventName}
              </span>
              <span className="text-xs">
                {formatTimestamp(request.timestamp)}
              </span>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {questions.map((q, qIndex) => (
            <div key={qIndex} className="space-y-3">
              <div>
                <h3 className="font-medium text-sm text-muted-foreground">
                  {q.header}
                </h3>
                <p className="text-base">{q.question}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {q.options.map((option, oIndex) => {
                  const isSelected = selectedAnswers[qIndex] === option.label
                  return (
                    <Button
                      key={oIndex}
                      variant={isSelected ? 'default' : 'outline'}
                      size="sm"
                      disabled={sent || sending}
                      onClick={() =>
                        handleOptionClick(qIndex, q, option.label)
                      }
                      className="flex-col h-auto py-2 px-4"
                      title={option.description}
                    >
                      <span>{option.label}</span>
                      {option.description && (
                        <span className="text-xs opacity-70 font-normal">
                          {option.description}
                        </span>
                      )}
                    </Button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
