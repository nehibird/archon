const EventEmitter = require('events');
const https = require('https');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

class OpenRouterProcess extends EventEmitter {
  constructor(sessionId, model, history) {
    super();
    this.sessionId = sessionId;
    this.model = model || 'anthropic/claude-sonnet-4.5';
    this.history = history || [];
    this.alive = false;
    this.currentRequest = null;
  }

  start() {
    this.alive = true;
    this.emit('init', { session_id: this.sessionId, model: this.model });
  }

  sendMessage(content) {
    if (!this.alive) throw new Error('OpenRouter process is not running');
    if (!OPENROUTER_API_KEY) {
      this.emit('error', new Error('OPENROUTER_API_KEY not configured'));
      return;
    }

    // Build messages array from history + new message
    const messages = [
      ...this.history.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      })),
      { role: 'user', content },
    ];

    const body = JSON.stringify({
      model: this.model,
      messages,
      stream: true,
    });

    const options = {
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.OPENROUTER_REFERER || 'https://github.com/nehibird/archon',
        'X-Title': 'ARCHON',
      },
    };

    const startTime = Date.now();
    let fullText = '';
    let buffer = '';

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        let errorBody = '';
        res.on('data', (chunk) => { errorBody += chunk.toString(); });
        res.on('end', () => {
          this.emit('error', new Error(`OpenRouter API error ${res.statusCode}: ${errorBody}`));
        });
        return;
      }

      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) {
              fullText += delta.content;
              this.emit('assistant', {
                text: delta.content,
                toolCalls: null,
                model: this.model,
              });
            }
          } catch {
            // Skip unparseable chunks
          }
        }
      });

      res.on('end', () => {
        const duration = Date.now() - startTime;
        this.emit('result', {
          success: true,
          duration,
          cost: null,
          usage: null,
          sessionId: this.sessionId,
        });
        // Add to history for context continuity
        this.history.push(
          { role: 'user', content },
          { role: 'assistant', content: fullText }
        );
      });
    });

    req.on('error', (err) => {
      this.emit('error', err);
    });

    this.currentRequest = req;
    req.write(body);
    req.end();
  }

  interrupt() {
    if (this.currentRequest) {
      this.currentRequest.destroy();
      this.currentRequest = null;
    }
  }

  kill() {
    this.interrupt();
    this.alive = false;
    this.emit('exit', 0);
  }
}

module.exports = { OpenRouterProcess };
