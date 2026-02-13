import { useState, memo } from 'react'
import { ChevronRight, Terminal, FileText, Search, Globe, Wrench, CheckCircle2, XCircle } from 'lucide-react'
import type { ToolCall } from '../../services/types'

interface ToolCallInlineProps {
  tc: ToolCall
}

const toolIcons: Record<string, typeof Terminal> = {
  Bash: Terminal,
  Read: FileText,
  Write: FileText,
  Edit: FileText,
  Glob: Search,
  Grep: Search,
  WebFetch: Globe,
  WebSearch: Globe,
}

function getSummary(tc: ToolCall): string {
  if (!tc.input) return tc.tool
  if (tc.tool === 'Bash' && tc.input.command) return `$ ${String(tc.input.command).slice(0, 100)}`
  if (tc.tool === 'Read' && tc.input.file_path) return String(tc.input.file_path)
  if ((tc.tool === 'Edit' || tc.tool === 'Write') && tc.input.file_path) return String(tc.input.file_path)
  if ((tc.tool === 'Glob' || tc.tool === 'Grep') && tc.input.pattern) return String(tc.input.pattern)
  if (tc.tool === 'Task' && tc.input.description) return String(tc.input.description)
  return tc.tool
}

export const ToolCallInline = memo(({ tc }: ToolCallInlineProps) => {
  const [expanded, setExpanded] = useState(false)

  // Don't render tool results as separate blocks
  if (tc.type === 'result') return null

  const Icon = toolIcons[tc.tool] || Wrench
  const summary = getSummary(tc)

  return (
    <div className="my-2 rounded border border-[var(--border-weak)] overflow-hidden text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-[var(--surface-raised)] hover:bg-[var(--surface-float)] transition-colors text-left"
      >
        <Icon className="w-3.5 h-3.5 text-[var(--text-weak)] flex-shrink-0" />
        <ChevronRight className={`w-3 h-3 text-[var(--text-weak)] flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        <span className="truncate font-mono text-[var(--text-base)]">{summary}</span>
        <span className="ml-auto flex-shrink-0">
          {tc.isError ? (
            <XCircle className="w-3.5 h-3.5 text-[var(--accent-error)]" />
          ) : tc.content !== undefined ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent-success)]" />
          ) : null}
        </span>
      </button>
      {expanded && tc.input && (
        <div className="px-3 py-2 bg-[var(--surface-base)] border-t border-[var(--border-weak)]">
          <pre className="whitespace-pre-wrap text-[11px] font-mono text-[var(--text-base)] overflow-x-auto">
            {JSON.stringify(tc.input, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
})

ToolCallInline.displayName = 'ToolCallInline'
