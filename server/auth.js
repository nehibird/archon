const crypto = require('crypto');
const db = require('./db');

const AUTH_TOKEN = process.env.AUTH_TOKEN;

// Rate limiting: track failed attempts per IP
const failedAttempts = new Map(); // ip -> { count, lastAttempt }
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function safeCompare(input, secret) {
  if (!input || !secret) return false;
  if (input.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(input), Buffer.from(secret));
}

function isRateLimited(ip) {
  const record = failedAttempts.get(ip);
  if (!record) return false;
  if (Date.now() - record.lastAttempt > LOCKOUT_MS) {
    failedAttempts.delete(ip);
    return false;
  }
  return record.count >= MAX_FAILURES;
}

function recordFailure(ip) {
  const record = failedAttempts.get(ip) || { count: 0, lastAttempt: 0 };
  record.count++;
  record.lastAttempt = Date.now();
  failedAttempts.set(ip, record);
  if (record.count >= MAX_FAILURES) {
    console.log(`[Auth] IP ${ip} locked out after ${record.count} failed attempts`);
  }
}

function clearFailures(ip) {
  failedAttempts.delete(ip);
}

// Create a session in SQLite (survives restarts)
function createSession(userId, username, role, displayName) {
  return db.createLoginSession(userId, username, role, displayName);
}

function getSessionFromCookie(cookieValue) {
  if (!cookieValue) return null;
  const row = db.getLoginSession(cookieValue);
  if (!row) return null;
  return {
    userId: row.user_id,
    username: row.username,
    role: row.role,
    displayName: row.display_name,
  };
}

function destroySession(cookieValue) {
  db.deleteLoginSession(cookieValue);
}

// Resolve a plaintext token to a tokenContext object, or null if invalid
function resolveToken(plaintext) {
  if (!plaintext) return null;

  // Check admin token first (backwards compat with bearer tokens)
  if (AUTH_TOKEN && safeCompare(plaintext, AUTH_TOKEN)) {
    return { role: 'admin', allowedSessions: null };
  }

  // Check DB for scoped API tokens
  const hash = db.hashToken(plaintext);
  const row = db.getTokenByHash(hash);
  if (row) {
    db.touchToken(row.id);
    return {
      role: 'scoped',
      allowedSessions: row.allowed_sessions ? JSON.parse(row.allowed_sessions) : null,
      permissions: row.permissions,
      tokenId: row.id,
    };
  }

  return null;
}

// Extract auth info from request - checks session cookie first, then bearer token
function extractAuth(req) {
  // Check session cookie first (username/password login)
  const cookie = req.headers.cookie || '';
  const sessionCookie = cookie.split(';').map(c => c.trim()).find(c => c.startsWith('archon_session='));
  if (sessionCookie) {
    const sessionId = sessionCookie.split('=')[1];
    const session = getSessionFromCookie(sessionId);
    if (session) {
      return {
        role: session.role,
        userId: session.userId,
        username: session.username,
        displayName: session.displayName,
        allowedSessions: null,
        permissions: session.role === 'admin' ? 'read_write' : 'read_write',
      };
    }
  }

  // Fall back to bearer token / old cookie (backwards compat)
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return resolveToken(header.slice(7));
  }

  // Legacy archon_token cookie
  const tokenCookie = cookie.split(';').map(c => c.trim()).find(c => c.startsWith('archon_token='));
  if (tokenCookie) {
    return resolveToken(tokenCookie.split('=')[1]);
  }

  // Query param (for WebSocket upgrade)
  if (req.query && req.query.token) {
    return resolveToken(req.query.token);
  }

  return null;
}

function authMiddleware(req, res, next) {
  if (!AUTH_TOKEN && db.listUsers().length === 0) {
    // No auth configured at all
    req.tokenContext = { role: 'admin', allowedSessions: null };
    return next();
  }

  const ctx = extractAuth(req);
  if (ctx) {
    req.tokenContext = ctx;
    return next();
  }

  res.status(401).json({ error: 'Unauthorized' });
}

function authenticateWs(req) {
  if (!AUTH_TOKEN && db.listUsers().length === 0) {
    req.tokenContext = { role: 'admin', allowedSessions: null };
    return true;
  }

  // Extract from query string or cookie
  const ctx = extractAuth(req);
  if (ctx) {
    req.tokenContext = ctx;
    return true;
  }

  return false;
}

// Clean expired sessions on startup
db.cleanExpiredLoginSessions();

module.exports = {
  authMiddleware, authenticateWs, resolveToken, safeCompare,
  isRateLimited, recordFailure, clearFailures,
  createSession, getSessionFromCookie, destroySession,
};
