const { spawn } = require('child_process');
const EventEmitter = require('events');
const path = require('path');

const CLAUDE_PATH = process.env.CLAUDE_PATH || 'claude';
const DEFAULT_CWD = process.env.DEFAULT_WORKING_DIR || process.cwd();

class ClaudeProcess extends EventEmitter {
  constructor(sessionId, workingDir, resumeSessionId) {
    super();
    this.sessionId = sessionId;
    this.workingDir = workingDir || DEFAULT_CWD;
    this.resumeSessionId = resumeSessionId || null;
    this.proc = null;
    this.claudeSessionId = null;
    this.alive = false;
    this.buffer = '';
    console.log(`[ClaudeProcess] constructor — sessionId=${sessionId}, inputWorkingDir=${workingDir || 'NULL'}, resolvedWorkingDir=${this.workingDir}, DEFAULT_CWD=${DEFAULT_CWD}`);
  }

  start() {
    if (this.proc) return;

    const args = [
      '--print',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--dangerously-skip-permissions',
    ];

    if (this.resumeSessionId) {
      args.push('--resume', this.resumeSessionId);
      console.log('[Claude] Resuming session:', this.resumeSessionId);
    }

    console.log(`[Claude] Spawning with cwd: ${this.workingDir}`);
    this.proc = spawn(CLAUDE_PATH, args, {
      cwd: this.workingDir,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.alive = true;

    this.proc.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString();
      this._processBuffer();
    });

    this.proc.stderr.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (text) {
        console.log('[Claude stderr]', text.slice(0, 200));
        this.emit('stderr', text);
      }
    });

    this.proc.on('close', (code) => {
      console.log('[Claude] Process closed with code', code);
      this.alive = false;
      this.proc = null;
      this.emit('exit', code);
    });

    this.proc.on('error', (err) => {
      console.error('[Claude] Process error:', err.message);
      this.alive = false;
      this.emit('error', err);
    });
  }

  _processBuffer() {
    const lines = this.buffer.split('\n');
    // Keep the last incomplete line in the buffer
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        this._handleMessage(msg);
      } catch {
        // Not valid JSON, ignore
      }
    }
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'system':
        if (msg.subtype === 'init') {
          this.claudeSessionId = msg.session_id;
          this.emit('init', msg);
        }
        break;

      case 'assistant':
        this.emit('assistant', this._parseAssistantMessage(msg));
        break;

      case 'result':
        this.emit('result', {
          success: msg.subtype === 'success',
          error: msg.is_error,
          duration: msg.duration_ms,
          cost: msg.total_cost_usd,
          usage: msg.usage,
          sessionId: msg.session_id,
        });
        break;

      default:
        this.emit('raw', msg);
    }
  }

  _parseAssistantMessage(msg) {
    const message = msg.message || {};
    const content = message.content || [];

    let text = '';
    const toolCalls = [];

    for (const block of content) {
      if (block.type === 'text') {
        text += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          tool: block.name,
          input: block.input,
        });
      } else if (block.type === 'tool_result') {
        toolCalls.push({
          id: block.tool_use_id,
          type: 'result',
          content: block.content,
          isError: block.is_error,
        });
      }
    }

    return {
      id: message.id,
      text,
      toolCalls: toolCalls.length > 0 ? toolCalls : null,
      model: message.model,
      usage: message.usage,
      stopReason: message.stop_reason,
    };
  }

  sendMessage(content) {
    if (!this.proc || !this.alive) {
      throw new Error('Claude process is not running');
    }
    const msg = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text: content }],
      },
    }) + '\n';
    this.proc.stdin.write(msg);
  }

  interrupt() {
    if (this.proc && this.alive) {
      this.proc.kill('SIGINT');
    }
  }

  kill() {
    if (this.proc) {
      this.proc.kill('SIGTERM');
      this.proc = null;
      this.alive = false;
    }
  }
}

class ClaudeManager {
  constructor() {
    this.processes = new Map(); // sessionId -> ClaudeProcess
  }

  getProcess(sessionId) {
    return this.processes.get(sessionId);
  }

  createProcess(sessionId, workingDir, resumeSessionId) {
    if (this.processes.has(sessionId)) {
      return this.processes.get(sessionId);
    }

    const proc = new ClaudeProcess(sessionId, workingDir, resumeSessionId);
    this.processes.set(sessionId, proc);

    proc.on('exit', () => {
      this.processes.delete(sessionId);
    });

    proc.start();
    return proc;
  }

  killProcess(sessionId) {
    const proc = this.processes.get(sessionId);
    if (proc) {
      proc.kill();
      this.processes.delete(sessionId);
    }
  }

  killAll() {
    for (const [id, proc] of this.processes) {
      proc.kill();
    }
    this.processes.clear();
  }

  getActiveCount() {
    return this.processes.size;
  }
}

module.exports = { ClaudeManager, ClaudeProcess };
