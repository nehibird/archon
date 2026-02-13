import { useRef, useEffect, memo } from 'react'
import { ScrollArea } from '../ui/scroll-area'
import { MessageBubble } from './MessageBubble'
import { useMessageStore } from '../../stores/messageStore'

const MemoizedMessageBubble = memo(MessageBubble)

export function ChatContainer() {
  const { messages, sessionStatus } = useMessageStore()
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }, [messages])

  return (
    <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
      <div className="space-y-4 max-w-3xl mx-auto">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full min-h-[200px]">
            <div className="text-center text-muted-foreground">
              <div className="text-4xl mb-4">A</div>
              <p className="text-lg font-medium">Ready to chat</p>
              <p className="text-sm">Send a message to start the conversation</p>
            </div>
          </div>
        )}
        {messages.map((message) => (
          <MemoizedMessageBubble key={message.id} message={message} />
        ))}
        {sessionStatus === 'thinking' && messages.length > 0 && !messages[messages.length - 1]?.isStreaming && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground pl-11">
            <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
            <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse [animation-delay:150ms]" />
            <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse [animation-delay:300ms]" />
            <span className="ml-1">Thinking...</span>
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
