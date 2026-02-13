const path = require('path');

// Load .env
const envPath = path.join(__dirname, '..', '.env');
try {
  const fs = require('fs');
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const val = trimmed.slice(eq + 1);
    if (!process.env[key]) process.env[key] = val;
  }
} catch {}

const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const { ClaudeManager } = require('./claude-manager');
const { authMiddleware, authenticateWs } = require('./auth');
const { setupWebSocket } = require('./ws-handler');
const apiRoutes = require('./routes/api');
const db = require('./db');

const PORT = parseInt(process.env.PORT) || 3003;

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });
const claudeManager = new ClaudeManager();

// Make claudeManager available to routes
app.locals.claudeManager = claudeManager;

// Auto-create admin user from env vars on first startup
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (ADMIN_USERNAME && ADMIN_PASSWORD) {
  try {
    const existing = db.getUserByUsername(ADMIN_USERNAME);
    if (!existing) {
      db.createUser(ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_USERNAME, 'admin');
      console.log(`[Auth] Created admin user: ${ADMIN_USERNAME}`);
    }
  } catch (err) {
    console.error('[Auth] Failed to create admin user:', err.message);
  }
}

// Middleware
app.use(express.json());
app.use('/api', (req, res, next) => {
  // Skip auth for login/logout endpoints
  if (req.path === '/auth/login' || req.path === '/auth/logout') return next();
  authMiddleware(req, res, next);
}, apiRoutes);
app.use(express.static(path.join(__dirname, '..', 'public')));

// SPA fallback
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// WebSocket upgrade with auth
server.on('upgrade', (req, socket, head) => {
  console.log('[WS] Upgrade request:', req.url, 'cookie:', (req.headers.cookie || 'none').slice(0, 50));
  if (!authenticateWs(req)) {
    console.log('[WS] Auth failed, rejecting');
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  console.log('[WS] Auth passed, upgrading');

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  setupWebSocket(ws, claudeManager, req.tokenContext);
});

// Ping all clients every 30s to detect dead connections
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      console.log('[WS] Terminating dead connection');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// Graceful shutdown
function shutdown() {
  console.log('Shutting down...');
  clearInterval(pingInterval);
  claudeManager.killAll();
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`ARCHON running on http://0.0.0.0:${PORT}`);
  console.log(`Auth: ${process.env.AUTH_TOKEN ? 'token' : ''} ${db.listUsers().length > 0 ? `+ ${db.listUsers().length} user(s)` : db.listUsers().length === 0 && !process.env.AUTH_TOKEN ? 'DISABLED' : ''}`);
});
