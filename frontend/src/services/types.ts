// ARCHON Types

export interface Project {
  id: string
  name: string
  working_dir: string | null
  icon: string | null
  sort_order: number
  session_count: number
  created_at: string
}

export interface Session {
  id: string
  name: string
  status: 'active' | 'archived'
  working_dir: string | null
  provider: string
  model: string | null
  owner_id: string | null
  project_id: string | null
  claude_session_id: string | null
  created_at: string
  updated_at: string
}

export interface ModelOption {
  id: string
  label: string
  provider: 'claude' | 'openrouter'
  description?: string
}

export interface Message {
  id: number
  session_id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  tool_calls: string | null // JSON string
  created_at: string
}

export interface ToolCall {
  id: string
  tool: string
  input?: Record<string, unknown>
  type?: 'result'
  content?: unknown
  isError?: boolean
}

export interface User {
  id: string
  username: string
  display_name: string
  role: 'admin' | 'user'
  created_at: string
  last_login_at: string | null
}

export interface MeResponse {
  role: string
  userId?: string
  username?: string
  displayName?: string
  permissions?: string
  name?: string
}

// WebSocket message types (client -> server)
export type WsOutMessage =
  | { type: 'subscribe'; sessionId: string }
  | { type: 'unsubscribe'; sessionId: string }
  | { type: 'message'; sessionId: string; content: string }
  | { type: 'interrupt'; sessionId: string }

// WebSocket message types (server -> client)
export interface WsSubscribed {
  type: 'subscribed'
  sessionId: string
  session: Session
}

export interface WsUserMessage {
  type: 'user_message'
  sessionId: string
  messageId: number
  content: string
  timestamp: string
}

export interface WsAssistantChunk {
  type: 'assistant_chunk'
  sessionId: string
  text: string | null
  toolCalls: ToolCall[] | null
  model: string | null
}

export interface WsMessageComplete {
  type: 'message_complete'
  sessionId: string
  messageId: number
  cost: number | null
  duration: number | null
  usage: Record<string, unknown> | null
}

export interface WsSessionStatus {
  type: 'session_status'
  sessionId: string
  status: 'thinking' | 'ready' | 'interrupted' | 'disconnected'
  claudeSessionId?: string
  model?: string
  exitCode?: number
}

export interface WsError {
  type: 'error'
  sessionId?: string
  message: string
}

export type WsInMessage =
  | WsSubscribed
  | WsUserMessage
  | WsAssistantChunk
  | WsMessageComplete
  | WsSessionStatus
  | WsError
  | { type: 'stderr'; sessionId: string; text: string }

// Error Types
export interface AppError extends Error {
  code?: string
  statusCode?: number
  data?: unknown
}
