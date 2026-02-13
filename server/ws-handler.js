const db = require('./db');
const { OpenRouterProcess } = require('./openrouter-process');

// Track which clients are subscribed to which sessions
// Map<sessionId, Set<ws>>
const subscriptions = new Map();

// Track OpenRouter processes separately (Claude processes managed by ClaudeManager)
const openRouterProcesses = new Map(); // sessionId -> OpenRouterProcess

function getSubscribers(sessionId) {
  if (!subscriptions.has(sessionId)) {
    subscriptions.set(sessionId, new Set());
  }
  return subscriptions.get(sessionId);
}

function broadcast(sessionId, data) {
  const subs = subscriptions.get(sessionId);
  if (!subs || subs.size === 0) {
    if (data.type === 'assistant_chunk' || data.type === 'message_complete') {
      console.log(`[WS] WARNING: No subscribers for ${data.type} on session ${sessionId.slice(0, 8)}`);
    }
    return;
  }
  const json = JSON.stringify(data);
  let sent = 0;
  for (const ws of subs) {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(json);
      sent++;
    }
  }
  if (data.type === 'message_complete') {
    console.log(`[WS] Broadcast message_complete to ${sent}/${subs.size} clients for session ${sessionId.slice(0, 8)}`);
  }
}

function hasSessionAccess(tokenContext, sessionId) {
  if (!tokenContext || tokenContext.role === 'admin') return true;
  if (!tokenContext.allowedSessions) return true;
  return tokenContext.allowedSessions.includes(sessionId);
}

function setupWebSocket(ws, claudeManager, tokenContext) {
  ws.tokenContext = tokenContext || { role: 'admin', allowedSessions: null };
  let subscribedSessions = new Set();
  console.log('[WS] New client connected, role:', ws.tokenContext.role);

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }

    console.log('[WS] Received:', msg.type, msg.sessionId || '');

    switch (msg.type) {
      case 'subscribe':
        handleSubscribe(ws, msg, subscribedSessions);
        break;
      case 'unsubscribe':
        handleUnsubscribe(ws, msg, subscribedSessions);
        break;
      case 'message':
        handleMessage(ws, msg, claudeManager);
        break;
      case 'interrupt':
        handleInterrupt(ws, msg, claudeManager);
        break;
      default:
        ws.send(JSON.stringify({ type: 'error', message: `Unknown type: ${msg.type}` }));
    }
  });

  ws.on('close', () => {
    // Clean up all subscriptions for this client
    for (const sessionId of subscribedSessions) {
      const subs = subscriptions.get(sessionId);
      if (subs) {
        subs.delete(ws);
        if (subs.size === 0) subscriptions.delete(sessionId);
      }
    }
  });
}

function handleSubscribe(ws, msg, subscribedSessions) {
  const { sessionId } = msg;
  if (!sessionId) return;

  if (!hasSessionAccess(ws.tokenContext, sessionId)) {
    ws.send(JSON.stringify({ type: 'error', message: 'Access denied to this session' }));
    return;
  }

  const session = db.getSession(sessionId);
  if (!session) {
    ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
    return;
  }

  getSubscribers(sessionId).add(ws);
  subscribedSessions.add(sessionId);

  ws.send(JSON.stringify({
    type: 'subscribed',
    sessionId,
    session,
  }));
}

function handleUnsubscribe(ws, msg, subscribedSessions) {
  const { sessionId } = msg;
  if (!sessionId) return;

  const subs = subscriptions.get(sessionId);
  if (subs) {
    subs.delete(ws);
    if (subs.size === 0) subscriptions.delete(sessionId);
  }
  subscribedSessions.delete(sessionId);
}

function handleMessage(ws, msg, claudeManager) {
  const { sessionId, content } = msg;
  if (!sessionId || !content) {
    ws.send(JSON.stringify({ type: 'error', message: 'sessionId and content required' }));
    return;
  }

  if (!hasSessionAccess(ws.tokenContext, sessionId)) {
    ws.send(JSON.stringify({ type: 'error', message: 'Access denied to this session' }));
    return;
  }

  if (ws.tokenContext.permissions === 'read_only') {
    ws.send(JSON.stringify({ type: 'error', message: 'Read-only token cannot send messages' }));
    return;
  }

  const session = db.getSession(sessionId);
  if (!session) {
    ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
    return;
  }

  // Save user message
  const userMsgId = db.addMessage(sessionId, 'user', content);
  broadcast(sessionId, {
    type: 'user_message',
    sessionId,
    messageId: userMsgId,
    content,
    timestamp: new Date().toISOString(),
  });

  const provider = session.provider || 'claude';

  if (provider === 'openrouter') {
    handleOpenRouterMessage(sessionId, content, session);
  } else {
    handleClaudeMessage(sessionId, content, session, claudeManager);
  }
}

function handleClaudeMessage(sessionId, content, session, claudeManager) {
  // Get or create Claude process
  let proc = claudeManager.getProcess(sessionId);
  if (!proc || !proc.alive) {
    let workingDir = session.working_dir;

    // If session has no working_dir but has a project, inherit from project
    if (!workingDir && session.project_id) {
      const project = db.getProject(session.project_id);
      if (project && project.working_dir) {
        workingDir = project.working_dir;
        // Backfill the session too so this only happens once
        db.updateSession(sessionId, { working_dir: workingDir });
        console.log(`[Claude] Backfilled session working_dir from project: ${workingDir}`);
      }
    }

    console.log(`[Claude] Spawning new process for session ${sessionId}`);
    console.log(`[Claude]   session.working_dir = ${session.working_dir || 'NULL'}`);
    console.log(`[Claude]   resolved workingDir  = ${workingDir || 'NULL (will use DEFAULT_CWD)'}`);
    console.log(`[Claude]   session.project_id   = ${session.project_id || 'NULL'}`);
    console.log(`[Claude]   claude_session_id     = ${session.claude_session_id || 'NULL (fresh)'}`);
    proc = claudeManager.createProcess(sessionId, workingDir, session.claude_session_id);
    setupClaudeProcess(proc, sessionId);
  }

  console.log('[Claude] Sending message to process');
  proc.sendMessage(content);
  broadcast(sessionId, { type: 'session_status', sessionId, status: 'thinking' });
}

function handleOpenRouterMessage(sessionId, content, session) {
  let proc = openRouterProcesses.get(sessionId);
  if (!proc || !proc.alive) {
    console.log('[OpenRouter] Creating new process for session', sessionId);
    // Load message history for context
    const messages = db.getMessages(sessionId, 100, 0);
    const history = messages.map(m => ({ role: m.role, content: m.content }));
    proc = new OpenRouterProcess(sessionId, session.model, history);
    openRouterProcesses.set(sessionId, proc);
    setupOpenRouterProcess(proc, sessionId);
    proc.start();
  }

  console.log('[OpenRouter] Sending message to process');
  proc.sendMessage(content);
  broadcast(sessionId, { type: 'session_status', sessionId, status: 'thinking' });
}

function setupClaudeProcess(proc, sessionId) {
  let currentText = '';
  let currentToolCalls = [];

  proc.on('init', (data) => {
    // Save Claude's session ID so we can resume later
    if (data.session_id) {
      db.updateSession(sessionId, { claude_session_id: data.session_id });
      console.log('[Claude] Saved Claude session ID:', data.session_id);
    }

    broadcast(sessionId, {
      type: 'session_status',
      sessionId,
      status: 'thinking',
      claudeSessionId: data.session_id,
      model: data.model,
    });
  });

  proc.on('assistant', (data) => {
    if (data.text) {
      currentText += data.text;
    }
    if (data.toolCalls) {
      currentToolCalls.push(...data.toolCalls);
    }

    // Stream content to clients
    broadcast(sessionId, {
      type: 'assistant_chunk',
      sessionId,
      text: data.text,
      toolCalls: data.toolCalls,
      model: data.model,
    });
  });

  proc.on('result', (data) => {
    // Save complete assistant message
    const msgId = db.addMessage(
      sessionId, 'assistant', currentText,
      currentToolCalls.length > 0 ? currentToolCalls : null
    );

    // Update Claude session ID from result if available
    if (data.sessionId) {
      db.updateSession(sessionId, { claude_session_id: data.sessionId });
    }

    broadcast(sessionId, {
      type: 'message_complete',
      sessionId,
      messageId: msgId,
      cost: data.cost,
      duration: data.duration,
      usage: data.usage,
    });

    broadcast(sessionId, { type: 'session_status', sessionId, status: 'ready' });

    // Reset accumulators
    currentText = '';
    currentToolCalls = [];
  });

  proc.on('error', (err) => {
    broadcast(sessionId, {
      type: 'error',
      sessionId,
      message: err.message,
    });
  });

  proc.on('exit', (code) => {
    broadcast(sessionId, {
      type: 'session_status',
      sessionId,
      status: 'disconnected',
      exitCode: code,
    });
  });

  proc.on('stderr', (text) => {
    broadcast(sessionId, {
      type: 'stderr',
      sessionId,
      text,
    });
  });
}

function setupOpenRouterProcess(proc, sessionId) {
  let currentText = '';

  proc.on('assistant', (data) => {
    if (data.text) {
      currentText += data.text;
    }

    broadcast(sessionId, {
      type: 'assistant_chunk',
      sessionId,
      text: data.text,
      toolCalls: null,
      model: data.model,
    });
  });

  proc.on('result', (data) => {
    const msgId = db.addMessage(sessionId, 'assistant', currentText, null);

    broadcast(sessionId, {
      type: 'message_complete',
      sessionId,
      messageId: msgId,
      cost: data.cost,
      duration: data.duration,
      usage: data.usage,
    });

    broadcast(sessionId, { type: 'session_status', sessionId, status: 'ready' });
    currentText = '';
  });

  proc.on('error', (err) => {
    broadcast(sessionId, {
      type: 'error',
      sessionId,
      message: err.message,
    });
    broadcast(sessionId, { type: 'session_status', sessionId, status: 'ready' });
  });

  proc.on('exit', () => {
    openRouterProcesses.delete(sessionId);
    broadcast(sessionId, {
      type: 'session_status',
      sessionId,
      status: 'disconnected',
    });
  });
}

function handleInterrupt(ws, msg, claudeManager) {
  const { sessionId } = msg;

  // Try Claude process first
  const proc = claudeManager.getProcess(sessionId);
  if (proc) {
    proc.interrupt();
    broadcast(sessionId, { type: 'session_status', sessionId, status: 'interrupted' });
    return;
  }

  // Try OpenRouter process
  const orProc = openRouterProcesses.get(sessionId);
  if (orProc) {
    orProc.interrupt();
    broadcast(sessionId, { type: 'session_status', sessionId, status: 'interrupted' });
  }
}

// Send a message to a session (usable from REST or WS)
function sendMessageToSession(sessionId, content, claudeManager) {
  const session = db.getSession(sessionId);
  if (!session) return { error: 'Session not found' };

  const userMsgId = db.addMessage(sessionId, 'user', content);
  broadcast(sessionId, {
    type: 'user_message',
    sessionId,
    messageId: userMsgId,
    content,
    timestamp: new Date().toISOString(),
  });

  const provider = session.provider || 'claude';

  if (provider === 'openrouter') {
    handleOpenRouterMessage(sessionId, content, session);
  } else {
    let proc = claudeManager.getProcess(sessionId);
    if (!proc || !proc.alive) {
      console.log('[Claude] Spawning new process for session', sessionId);
      proc = claudeManager.createProcess(sessionId, session.working_dir, session.claude_session_id);
      setupClaudeProcess(proc, sessionId);
    }

    console.log('[Claude] Sending message to process');
    proc.sendMessage(content);
    broadcast(sessionId, { type: 'session_status', sessionId, status: 'thinking' });
  }

  return { ok: true, messageId: userMsgId };
}

module.exports = { setupWebSocket, broadcast, sendMessageToSession };
