const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { resolveToken, safeCompare, isRateLimited, recordFailure, clearFailures, createSession: createAuthSession, destroySession: destroyAuthSession } = require('../auth');
const router = express.Router();

// --- Access control helpers ---

function checkSessionAccess(req, sessionId) {
  const ctx = req.tokenContext;
  if (!ctx || ctx.role === 'admin') return true;
  if (!ctx.allowedSessions) {
    // For user-based auth, check ownership
    if (ctx.userId) {
      const session = db.getSession(sessionId);
      return session && (session.owner_id === ctx.userId || !session.owner_id);
    }
    return true;
  }
  return ctx.allowedSessions.includes(sessionId);
}

function requireAdmin(req, res) {
  if (!req.tokenContext || req.tokenContext.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return false;
  }
  return true;
}

// Login — username/password or legacy token
router.post('/auth/login', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress;

  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
  }

  const { username, password, token } = req.body;

  // Username/password login
  if (username && password) {
    const user = db.getUserByUsername(username);
    if (user && db.verifyPassword(password, user.password_hash)) {
      clearFailures(ip);
      db.updateUser(user.id, { last_login_at: new Date().toISOString() });
      const sessionId = createAuthSession(user.id, user.username, user.role, user.display_name);
      res.cookie('archon_session', sessionId, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });
      return res.json({ ok: true, role: user.role, displayName: user.display_name });
    }
    recordFailure(ip);
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  // Legacy token-based login (backwards compat)
  if (token) {
    const AUTH_TOKEN = process.env.AUTH_TOKEN;
    if (!AUTH_TOKEN) {
      clearFailures(ip);
      return res.json({ ok: true, role: 'admin' });
    }

    const ctx = resolveToken(token);
    if (ctx) {
      clearFailures(ip);
      res.cookie('archon_token', token || '', {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
      return res.json({ ok: true, role: ctx.role });
    }

    recordFailure(ip);
    return res.status(401).json({ error: 'Invalid token' });
  }

  res.status(400).json({ error: 'username/password or token required' });
});

router.post('/auth/logout', (req, res) => {
  // Destroy session cookie
  const cookie = req.headers.cookie || '';
  const sessionCookie = cookie.split(';').map(c => c.trim()).find(c => c.startsWith('archon_session='));
  if (sessionCookie) {
    destroyAuthSession(sessionCookie.split('=')[1]);
  }
  res.clearCookie('archon_session');
  res.clearCookie('archon_token');
  res.json({ ok: true });
});

// Identity
router.get('/me', (req, res) => {
  const ctx = req.tokenContext;
  if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
  const result = { role: ctx.role };
  if (ctx.userId) {
    result.userId = ctx.userId;
    result.username = ctx.username;
    result.displayName = ctx.displayName;
  }
  if (ctx.role === 'scoped') {
    result.permissions = ctx.permissions;
    const token = db.getToken(ctx.tokenId);
    if (token) result.name = token.name;
  }
  res.json(result);
});

// Models
router.get('/models', (req, res) => {
  const models = [
    { id: 'claude', label: 'Claude Code (Agent)', provider: 'claude', description: 'Full agent with file access and tool use' },
    { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5', provider: 'openrouter' },
    { id: 'anthropic/claude-opus-4', label: 'Claude Opus 4', provider: 'openrouter' },
    { id: 'openai/gpt-5', label: 'GPT-5', provider: 'openrouter' },
    { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'openrouter' },
    { id: 'deepseek/deepseek-chat-v3.1', label: 'DeepSeek V3.1', provider: 'openrouter' },
    { id: 'moonshotai/kimi-k2.5', label: 'Kimi K2.5', provider: 'openrouter' },
  ];
  res.json(models);
});

// Projects
router.get('/projects', (req, res) => {
  res.json(db.listProjects());
});

router.post('/projects', (req, res) => {
  const { name, working_dir, icon } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!working_dir) return res.status(400).json({ error: 'working_dir is required' });
  const project = db.createProject(name, working_dir, icon);
  res.status(201).json(project);
});

router.patch('/projects/:id', (req, res) => {
  const project = db.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const updated = db.updateProject(req.params.id, req.body);
  res.json(updated);
});

router.delete('/projects/:id', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const project = db.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  db.deleteProject(req.params.id);
  res.json({ ok: true });
});

// Sessions
router.get('/sessions', (req, res) => {
  let sessions = db.listSessions();
  const ctx = req.tokenContext;
  // Scoped API tokens: filter by allowed_sessions
  if (ctx && ctx.role === 'scoped' && ctx.allowedSessions) {
    sessions = sessions.filter(s => ctx.allowedSessions.includes(s.id));
  }
  // Regular users: filter by ownership
  if (ctx && ctx.role === 'user' && ctx.userId) {
    sessions = sessions.filter(s => s.owner_id === ctx.userId || !s.owner_id);
  }
  res.json(sessions);
});

router.post('/sessions', (req, res) => {
  const ctx = req.tokenContext;
  // Both admin and regular users can create sessions
  if (ctx.role === 'scoped' && ctx.permissions === 'read_only') {
    return res.status(403).json({ error: 'Read-only access' });
  }
  const { name, working_dir, provider, model, project_id } = req.body;
  console.log(`[API] POST /sessions — name=${name}, working_dir=${working_dir || 'NULL'}, project_id=${project_id || 'NULL'}, provider=${provider}`);
  const ownerId = ctx.userId || null;
  const session = db.createSession(name, working_dir, provider, model, ownerId, project_id);
  console.log(`[API] Session created — id=${session.id}, resolved working_dir=${session.working_dir || 'NULL'}, project_id=${session.project_id || 'NULL'}`);
  res.status(201).json(session);
});

router.get('/sessions/:id', (req, res) => {
  if (!checkSessionAccess(req, req.params.id)) {
    return res.status(403).json({ error: 'Access denied to this session' });
  }
  const session = db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

router.patch('/sessions/:id', (req, res) => {
  if (!checkSessionAccess(req, req.params.id)) {
    return res.status(403).json({ error: 'Access denied to this session' });
  }
  const session = db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // Scoped tokens can only rename sessions
  const ctx = req.tokenContext;
  let fields = req.body;
  if (ctx && ctx.role === 'scoped') {
    fields = {};
    if (req.body.name) fields.name = req.body.name;
  }

  const updated = db.updateSession(req.params.id, fields);
  res.json(updated);
});

router.delete('/sessions/:id', (req, res) => {
  const ctx = req.tokenContext;
  const session = db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  // Admin can delete any session; users can delete their own
  if (ctx.role !== 'admin' && session.owner_id !== ctx.userId) {
    return res.status(403).json({ error: 'Cannot delete sessions you don\'t own' });
  }
  db.deleteSession(req.params.id);
  res.json({ ok: true });
});

// Messages
router.get('/sessions/:id/messages', (req, res) => {
  if (!checkSessionAccess(req, req.params.id)) {
    return res.status(403).json({ error: 'Access denied to this session' });
  }
  const session = db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  const messages = db.getMessages(req.params.id, limit, offset);
  const total = db.getMessageCount(req.params.id);
  res.json({ messages, total });
});

// Send message to session (REST alternative to WebSocket)
router.post('/sessions/:id/messages', (req, res) => {
  if (!checkSessionAccess(req, req.params.id)) {
    return res.status(403).json({ error: 'Access denied to this session' });
  }
  const ctx = req.tokenContext;
  if (ctx && ctx.permissions === 'read_only') {
    return res.status(403).json({ error: 'Read-only token cannot send messages' });
  }

  const { sendMessageToSession } = require('../ws-handler');
  const session = db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'content required' });

  const claudeManager = req.app.locals.claudeManager;
  const result = sendMessageToSession(req.params.id, content, claudeManager);
  if (result.error) return res.status(400).json(result);
  res.status(201).json(result);
});

// Browse directories
const BROWSE_ROOT = process.env.DEFAULT_WORKING_DIR || process.cwd();

router.get('/browse', (req, res) => {
  if (!requireAdmin(req, res)) return;

  const reqPath = req.query.path || BROWSE_ROOT;
  const resolved = path.resolve(reqPath);
  if (!resolved.startsWith(BROWSE_ROOT) && resolved !== '/') {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== '@eaDir' && e.name !== 'node_modules')
      .map(e => ({
        name: e.name,
        path: path.join(resolved, e.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      current: resolved,
      parent: resolved !== BROWSE_ROOT ? path.dirname(resolved) : null,
      dirs,
    });
  } catch (e) {
    res.status(400).json({ error: 'Cannot read directory' });
  }
});

// --- Token management (admin only) ---

router.post('/tokens', (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { name, allowedSessions, permissions } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const validPerms = ['read_only', 'read_write'];
  const perm = validPerms.includes(permissions) ? permissions : 'read_write';

  const result = db.createToken(name, allowedSessions || null, perm);
  res.status(201).json(result);
});

router.get('/tokens', (req, res) => {
  if (!requireAdmin(req, res)) return;

  const tokens = db.listTokens().map(t => ({
    ...t,
    allowed_sessions: t.allowed_sessions ? JSON.parse(t.allowed_sessions) : null,
  }));
  res.json(tokens);
});

router.patch('/tokens/:id', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const token = db.getToken(req.params.id);
  if (!token) return res.status(404).json({ error: 'Token not found' });

  const fields = {};
  if (req.body.allowed_sessions !== undefined) {
    fields.allowed_sessions = req.body.allowed_sessions ? JSON.stringify(req.body.allowed_sessions) : null;
  }
  if (req.body.permissions !== undefined) {
    const validPerms = ['read_only', 'read_write'];
    if (!validPerms.includes(req.body.permissions)) {
      return res.status(400).json({ error: 'Invalid permissions value' });
    }
    fields.permissions = req.body.permissions;
  }

  const updated = db.updateToken(req.params.id, fields);
  res.json({
    ...updated,
    allowed_sessions: updated.allowed_sessions ? JSON.parse(updated.allowed_sessions) : null,
  });
});

// Grant session access to a token
router.post('/tokens/:tokenId/sessions/:sessionId', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const token = db.getToken(req.params.tokenId);
  if (!token) return res.status(404).json({ error: 'Token not found' });
  const session = db.getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  let current = token.allowed_sessions ? JSON.parse(token.allowed_sessions) : null;
  if (current === null) {
    current = [req.params.sessionId];
  } else if (!current.includes(req.params.sessionId)) {
    current.push(req.params.sessionId);
  }

  db.updateToken(req.params.tokenId, { allowed_sessions: JSON.stringify(current) });
  res.json({ ok: true, allowed_sessions: current });
});

// Revoke session access from a token
router.delete('/tokens/:tokenId/sessions/:sessionId', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const token = db.getToken(req.params.tokenId);
  if (!token) return res.status(404).json({ error: 'Token not found' });

  let current = token.allowed_sessions ? JSON.parse(token.allowed_sessions) : null;
  if (current === null) {
    // Unrestricted — expand to all sessions, then remove target
    const allSessions = db.listSessions().map(s => s.id);
    current = allSessions.filter(id => id !== req.params.sessionId);
  } else {
    current = current.filter(id => id !== req.params.sessionId);
  }

  db.updateToken(req.params.tokenId, { allowed_sessions: JSON.stringify(current) });
  res.json({ ok: true, allowed_sessions: current });
});

router.delete('/tokens/:id', (req, res) => {
  if (!requireAdmin(req, res)) return;
  db.deleteToken(req.params.id);
  res.json({ ok: true });
});

// --- User management (admin only) ---

router.get('/users', (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json(db.listUsers());
});

router.post('/users', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { username, password, displayName, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  // Check uniqueness
  const existing = db.getUserByUsername(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already exists' });
  }
  const validRoles = ['admin', 'user'];
  const userRole = validRoles.includes(role) ? role : 'user';
  const user = db.createUser(username, password, displayName, userRole);
  res.status(201).json(user);
});

router.patch('/users/:id', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const user = db.getUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const fields = {};
  if (req.body.display_name !== undefined) fields.display_name = req.body.display_name;
  if (req.body.role !== undefined) {
    const validRoles = ['admin', 'user'];
    if (!validRoles.includes(req.body.role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    fields.role = req.body.role;
  }
  if (req.body.password !== undefined) {
    if (req.body.password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    fields.password = req.body.password;
  }

  const updated = db.updateUser(req.params.id, fields);
  res.json(updated);
});

router.delete('/users/:id', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const user = db.getUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.deleteUser(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
