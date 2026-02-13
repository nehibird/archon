import React, { useRef, useCallback, type FormEvent } from 'react'
import { Send, Square } from 'lucide-react'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'

interface MessageInputProps {
  onSubmit: (message: string) => void
  onInterrupt?: () => void
  disabled: boolean
  isThinking: boolean
}

export function MessageInput({ onSubmit, onInterrupt, disabled, isThinking }: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = useCallback((e: FormEvent) => {
    e.preventDefault()
    const userInput = textareaRef.current?.value.trim() ?? ''
    if (!userInput || disabled) return

    if (textareaRef.current) {
      textareaRef.current.value = ''
      textareaRef.current.style.height = 'auto'
    }

    onSubmit(userInput)
  }, [onSubmit, disabled])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as unknown as FormEvent)
    }
  }, [handleSubmit])

  const handleInput = useCallback(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 200) + 'px'
    }
  }, [])

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 p-4 border-t bg-background">
      <Textarea
        ref={textareaRef}
        placeholder="Type a message..."
        disabled={disabled}
        className="flex-1 min-h-[44px] max-h-[200px] resize-none"
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        rows={1}
      />
      {isThinking ? (
        <Button type="button" variant="destructive" size="icon" onClick={onInterrupt} className="flex-shrink-0">
          <Square className="w-4 h-4" />
        </Button>
      ) : (
        <Button type="submit" size="icon" disabled={disabled} className="flex-shrink-0">
          <Send className="w-4 h-4" />
        </Button>
      )}
    </form>
  )
}
