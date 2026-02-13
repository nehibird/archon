import { useRef, useEffect, useMemo } from 'react'
import { useMessageStore, type ChatMessage } from '../../stores/messageStore'
import { SessionTurn, StandaloneMessage } from './SessionTurn'

interface TurnGroup {
  type: 'turn'
  user: ChatMessage
  assistant: ChatMessage | null
  turnIndex: number
}

interface StandaloneGroup {
  type: 'standalone'
  message: ChatMessage
}

type MessageGroup = TurnGroup | StandaloneGroup

export function MessageTimeline() {
  const { messages, sessionStatus } = useMessageStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Group messages into turns (user + assistant pairs)
  const groups: MessageGroup[] = useMemo(() => {
    const result: MessageGroup[] = []
    let turnIndex = 0

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]

      if (msg.type === 'user') {
        // Look ahead for assistant response
        const next = messages[i + 1]
        if (next && next.type === 'assistant') {
          result.push({ type: 'turn', user: msg, assistant: next, turnIndex: turnIndex++ })
          i++ // skip the assistant message since we paired it
        } else {
          // User message without response yet
          result.push({ type: 'turn', user: msg, assistant: null, turnIndex: turnIndex++ })
        }
      } else if (msg.type === 'assistant') {
        // Orphaned assistant message (shouldn't happen often, but handle it)
        result.push({
          type: 'turn',
          user: { id: `synthetic-${i}`, type: 'user', content: '(continued)', timestamp: msg.timestamp },
          assistant: msg,
          turnIndex: turnIndex++,
        })
      } else {
        // Error or event messages
        result.push({ type: 'standalone', message: msg })
      }
    }

    return result
  }, [messages])

  // Empty state
  if (messages.length === 0) {
    return (
      <div ref={scrollRef} className="flex-1 overflow-y-auto flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl font-bold text-[var(--text-weak)]/30 mb-3 font-mono">A</div>
          <p className="text-sm text-[var(--text-weak)]">Start a conversation</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      {groups.map((group) => {
        if (group.type === 'turn') {
          return (
            <SessionTurn
              key={group.user.id}
              userMessage={group.user}
              assistantMessage={group.assistant}
              turnIndex={group.turnIndex}
            />
          )
        }
        return <StandaloneMessage key={group.message.id} message={group.message} />
      })}

      {/* Thinking indicator when waiting for first chunk */}
      {sessionStatus === 'thinking' && messages.length > 0 && !messages[messages.length - 1]?.isStreaming && (
        <div className="px-6 py-4">
          <div className="max-w-[1000px] mx-auto flex items-center gap-2 text-[var(--text-weak)]">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-pulse" />
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-pulse [animation-delay:150ms]" />
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-pulse [animation-delay:300ms]" />
            <span className="text-xs ml-1">Thinking...</span>
          </div>
        </div>
      )}
    </div>
  )
}
