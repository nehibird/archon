import { memo, useState } from 'react'
import { Avatar, AvatarFallback } from '../ui/avatar'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react'
import type { ChatMessage } from '../../stores/messageStore'
import type { ToolCall } from '../../services/types'

interface MessageBubbleProps {
  message: ChatMessage
}

function ToolCallBlock({ tc }: { tc: ToolCall }) {
  const [open, setOpen] = useState(false)

  const getIcon = (tool: string) => {
    if (tool === 'Bash') return '>'
    if (tool === 'Read') return 'R'
    if (tool === 'Edit' || tool === 'Write') return 'E'
    if (tool === 'Glob' || tool === 'Grep') return 'S'
    if (tool === 'WebFetch' || tool === 'WebSearch') return 'W'
    if (tool === 'Task') return 'T'
    return 'F'
  }

  const getSummary = (tc: ToolCall) => {
    if (!tc.input) return tc.tool
    if (tc.tool === 'Bash' && tc.input.command) return `$ ${String(tc.input.command).slice(0, 80)}`
    if (tc.tool === 'Read' && tc.input.file_path) return String(tc.input.file_path)
    if ((tc.tool === 'Edit' || tc.tool === 'Write') && tc.input.file_path) return String(tc.input.file_path)
    if ((tc.tool === 'Glob' || tc.tool === 'Grep') && tc.input.pattern) return String(tc.input.pattern)
    return tc.tool
  }

  // Tool result
  if (tc.type === 'result') {
    return null // Don't render tool results as separate blocks
  }

  return (
    <div className="my-2 border rounded-md text-xs overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted transition-colors text-left"
      >
        <span className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center text-[10px] font-mono font-bold text-primary flex-shrink-0">
          {getIcon(tc.tool)}
        </span>
        {open ? <ChevronDown className="w-3 h-3 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 flex-shrink-0" />}
        <span className="truncate font-mono text-muted-foreground">{getSummary(tc)}</span>
      </button>
      {open && tc.input && (
        <div className="p-3 bg-muted/25 border-t">
          <pre className="whitespace-pre-wrap text-[11px] font-mono overflow-x-auto">
            {JSON.stringify(tc.input, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
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
      className="absolute top-2 right-2 p-1.5 rounded bg-background/80 hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
    </button>
  )
}

export const MessageBubble = memo(({ message }: MessageBubbleProps) => {
  const isUser = message.type === 'user'
  const isError = message.type === 'error'
  const isEvent = message.type === 'event'

  return (
    <div className={`flex items-start gap-3 max-w-full ${isUser ? 'flex-row-reverse' : ''}`}>
      <Avatar className="w-8 h-8 flex-shrink-0">
        <AvatarFallback className={isUser ? 'bg-primary text-primary-foreground' : ''}>
          {isUser ? 'U' : isError ? '!' : isEvent ? 'E' : 'A'}
        </AvatarFallback>
      </Avatar>
      <div className={`flex-1 min-w-0 ${isUser ? 'flex justify-end' : ''}`}>
        <div className={`rounded-lg p-3 max-w-[85%] inline-block ${
          isUser ? 'bg-primary text-primary-foreground' :
          isError ? 'bg-destructive/10 text-destructive' :
          isEvent ? 'bg-yellow-50 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200' :
          'bg-muted'
        } ${!isUser && !isError && !isEvent ? 'prose prose-sm max-w-none dark:prose-invert' : ''}`}>

          {message.type === 'assistant' ? (
            <>
              {message.content && (
                <ReactMarkdown
                  components={{
                    code({ className, children }) {
                      const match = /language-(\w+)/.exec(className || '')
                      const codeString = String(children).replace(/\n$/, '')
                      const isBlock = !!(match || codeString.includes('\n'))

                      return isBlock ? (
                        <div className="relative group">
                          <CopyButton text={codeString} />
                          <SyntaxHighlighter
                            style={oneDark as { [key: string]: React.CSSProperties }}
                            language={match?.[1] || 'text'}
                            PreTag="div"
                          >
                            {codeString}
                          </SyntaxHighlighter>
                        </div>
                      ) : (
                        <code className={className}>{children}</code>
                      )
                    },
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              )}
              {/* Tool calls */}
              {message.toolCalls && message.toolCalls.length > 0 && (
                <div className="mt-2">
                  {message.toolCalls.map((tc, i) => (
                    <ToolCallBlock key={tc.id || i} tc={tc} />
                  ))}
                </div>
              )}
              {/* Streaming indicator */}
              {message.isStreaming && (
                <div className="flex items-center gap-1 mt-2">
                  <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                  <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse [animation-delay:150ms]" />
                  <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse [animation-delay:300ms]" />
                </div>
              )}
              {/* Cost/duration footer */}
              {!message.isStreaming && (message.cost != null || message.duration != null) && (
                <div className="mt-2 text-[10px] text-muted-foreground">
                  {message.cost != null && <span>${message.cost.toFixed(4)}</span>}
                  {message.cost != null && message.duration != null && <span> · </span>}
                  {message.duration != null && <span>{(message.duration / 1000).toFixed(1)}s</span>}
                </div>
              )}
            </>
          ) : (
            <div className="whitespace-pre-wrap">{message.content}</div>
          )}
        </div>
      </div>
    </div>
  )
})

MessageBubble.displayName = "MessageBubble"
export default MessageBubble
