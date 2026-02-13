import { memo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Copy, Check } from 'lucide-react'
import { ToolCallInline } from './ToolCallInline'
import type { ChatMessage } from '../../stores/messageStore'

interface SessionTurnProps {
  userMessage: ChatMessage
  assistantMessage: ChatMessage | null
  turnIndex: number
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 rounded bg-[var(--surface-float)] hover:bg-[var(--surface-overlay)] text-[var(--text-weak)] hover:text-[var(--text-base)] transition-colors opacity-0 group-hover:opacity-100"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
    </button>
  )
}

export const SessionTurn = memo(({ userMessage, assistantMessage, turnIndex }: SessionTurnProps) => {
  return (
    <div data-turn={turnIndex} className="mb-8">
      {/* User message — sticky header */}
      <div className="sticky top-0 z-10 bg-[var(--surface-raised)] border-b border-[var(--border-weak)] px-6 py-3">
        <div className="max-w-[1000px] mx-auto">
          <div className="text-[11px] font-medium text-[var(--text-weak)] uppercase tracking-wider mb-1">You</div>
          <div className="text-[var(--text-strong)] whitespace-pre-wrap text-sm">{userMessage.content}</div>
        </div>
      </div>

      {/* Assistant response */}
      {assistantMessage && (
        <div className="px-6 py-4">
          <div className="max-w-[1000px] mx-auto">
            {/* Markdown content */}
            {assistantMessage.content && (
              <div className="prose prose-sm prose-invert max-w-none
                prose-headings:text-[var(--text-strong)]
                prose-p:text-[var(--text-base)]
                prose-a:text-[var(--accent-primary)]
                prose-strong:text-[var(--text-strong)]
                prose-code:text-[var(--text-base)]
                prose-li:text-[var(--text-base)]
              ">
                <ReactMarkdown
                  components={{
                    code({ className, children }) {
                      const match = /language-(\w+)/.exec(className || '')
                      const codeString = String(children).replace(/\n$/, '')
                      const isBlock = !!(match || codeString.includes('\n'))

                      return isBlock ? (
                        <div className="relative group not-prose">
                          <CopyButton text={codeString} />
                          <SyntaxHighlighter
                            style={oneDark as Record<string, React.CSSProperties>}
                            language={match?.[1] || 'text'}
                            PreTag="div"
                            customStyle={{
                              margin: '0.75rem 0',
                              borderRadius: '0.375rem',
                              fontSize: '12px',
                              border: '1px solid var(--border-weak)',
                            }}
                          >
                            {codeString}
                          </SyntaxHighlighter>
                        </div>
                      ) : (
                        <code className="px-1.5 py-0.5 rounded bg-[var(--surface-float)] text-[var(--text-base)] text-xs font-mono">{children}</code>
                      )
                    },
                  }}
                >
                  {assistantMessage.content}
                </ReactMarkdown>
              </div>
            )}

            {/* Inline tool calls */}
            {assistantMessage.toolCalls && assistantMessage.toolCalls.length > 0 && (
              <div className="mt-3">
                {assistantMessage.toolCalls.map((tc, i) => (
                  <ToolCallInline key={tc.id || i} tc={tc} />
                ))}
              </div>
            )}

            {/* Streaming indicator */}
            {assistantMessage.isStreaming && (
              <div className="flex items-center gap-1.5 mt-3">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-pulse" />
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-pulse [animation-delay:150ms]" />
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-pulse [animation-delay:300ms]" />
              </div>
            )}

            {/* Status footer */}
            {!assistantMessage.isStreaming && (assistantMessage.cost != null || assistantMessage.duration != null) && (
              <div className="flex items-center gap-2 mt-4 text-[11px] text-[var(--text-weak)]">
                {assistantMessage.cost != null && <span>${assistantMessage.cost.toFixed(4)}</span>}
                {assistantMessage.cost != null && assistantMessage.duration != null && <span>&middot;</span>}
                {assistantMessage.duration != null && <span>{(assistantMessage.duration / 1000).toFixed(1)}s</span>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error messages (standalone, not paired with user) */}
    </div>
  )
})

SessionTurn.displayName = 'SessionTurn'

// Standalone error/event message (not part of a turn)
export const StandaloneMessage = memo(({ message }: { message: ChatMessage }) => {
  return (
    <div className="px-6 py-3">
      <div className="max-w-[1000px] mx-auto">
        <div className={`text-sm px-4 py-3 rounded border ${
          message.type === 'error'
            ? 'border-[var(--accent-error)]/30 bg-[var(--accent-error)]/10 text-[var(--accent-error)]'
            : 'border-[var(--accent-warning)]/30 bg-[var(--accent-warning)]/10 text-[var(--accent-warning)]'
        }`}>
          {message.content}
        </div>
      </div>
    </div>
  )
})

StandaloneMessage.displayName = 'StandaloneMessage'
