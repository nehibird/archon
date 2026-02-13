import React, { useRef, useCallback, type FormEvent } from 'react'
import { Send, Square } from 'lucide-react'

interface PromptDockProps {
  onSubmit: (message: string) => void
  onInterrupt?: () => void
  disabled: boolean
  isThinking: boolean
}

export function PromptDock({ onSubmit, onInterrupt, disabled, isThinking }: PromptDockProps) {
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
    <div className="flex-shrink-0">
      {/* Gradient fade */}
      <div className="h-6 prompt-dock-fade pointer-events-none" />

      {/* Input area */}
      <div className="px-6 pb-4">
        <form onSubmit={handleSubmit} className="max-w-[1000px] mx-auto relative">
          <div className="flex items-end gap-2 bg-[var(--surface-raised)] border border-[var(--border-base)] rounded-lg overflow-hidden focus-within:border-[var(--border-focus)] transition-colors">
            <textarea
              ref={textareaRef}
              placeholder={disabled ? 'Disconnected...' : 'Send a message...'}
              disabled={disabled}
              className="flex-1 bg-transparent text-[var(--text-strong)] text-sm placeholder:text-[var(--text-weak)] px-4 py-3 resize-none outline-none min-h-[44px] max-h-[200px] font-[var(--font-sans)]"
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              rows={1}
            />
            <div className="flex items-center gap-1 pr-2 pb-2">
              {isThinking ? (
                <button
                  type="button"
                  onClick={onInterrupt}
                  className="w-8 h-8 rounded flex items-center justify-center bg-[var(--accent-error)] text-white hover:bg-[var(--accent-error)]/80 transition-colors"
                  title="Stop"
                >
                  <Square className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={disabled}
                  className="w-8 h-8 rounded flex items-center justify-center bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)]/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Send"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
