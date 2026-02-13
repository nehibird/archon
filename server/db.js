const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, '..', 'data', 'archon.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate();
  }
  return db;
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'New Session',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
      working_dir TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
      content TEXT NOT NULL DEFAULT '',
      tool_calls TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_tokens (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      allowed_sessions TEXT,
      permissions TEXT NOT NULL DEFAULT 'read_write',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_used_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      working_dir TEXT UNIQUE,
      icon TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS login_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      role TEXT NOT NULL,
      display_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL
    );
  `);

  // Add project_id column to sessions if missing
  const sessionCols2 = db.prepare("PRAGMA table_info(sessions)").all().map(c => c.name);
  if (!sessionCols2.includes('project_id')) {
    db.exec('ALTER TABLE sessions ADD COLUMN project_id TEXT REFERENCES projects(id)');
  }

  // Add claude_session_id column if missing
  const sessionCols = db.prepare("PRAGMA table_info(sessions)").all().map(c => c.name);
  if (!sessionCols.includes('claude_session_id')) {
    db.exec('ALTER TABLE sessions ADD COLUMN claude_session_id TEXT');
  }
  if (!sessionCols.includes('provider')) {
    db.exec("ALTER TABLE sessions ADD COLUMN provider TEXT DEFAULT 'claude'");
  }
  if (!sessionCols.includes('model')) {
    db.exec('ALTER TABLE sessions ADD COLUMN model TEXT');
  }
  if (!sessionCols.includes('owner_id')) {
    db.exec('ALTER TABLE sessions ADD COLUMN owner_id TEXT');
  }

  // Auto-group existing sessions into projects
  migrateSessionsToProjects();
}

// Projects

const createProject = (name, workingDir, icon) => {
  const id = uuidv4();
  getDb().prepare(`
    INSERT INTO projects (id, name, working_dir, icon) VALUES (?, ?, ?, ?)
  `).run(id, name, workingDir || null, icon || null);
  return getProject(id);
};

const getProject = (id) => {
  return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id);
};

const getProjectByDir = (workingDir) => {
  return getDb().prepare('SELECT * FROM projects WHERE working_dir = ?').get(workingDir);
};

const listProjects = () => {
  const projects = getDb().prepare(
    'SELECT * FROM projects ORDER BY sort_order ASC, created_at ASC'
  ).all();
  // Add session counts
  const countStmt = getDb().prepare('SELECT COUNT(*) as count FROM sessions WHERE project_id = ?');
  return projects.map(p => ({
    ...p,
    session_count: countStmt.get(p.id).count,
  }));
};

const updateProject = (id, fields) => {
  const allowed = ['name', 'icon', 'sort_order'];
  const sets = [];
  const values = [];
  for (const [key, val] of Object.entries(fields)) {
    if (allowed.includes(key)) {
      sets.push(`${key} = ?`);
      values.push(val);
    }
  }
  if (sets.length === 0) return getProject(id);
  values.push(id);
  getDb().prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getProject(id);
};

const deleteProject = (id) => {
  // Unlink sessions from this project
  getDb().prepare('UPDATE sessions SET project_id = NULL WHERE project_id = ?').run(id);
  getDb().prepare('DELETE FROM projects WHERE id = ?').run(id);
};

const getOrCreateProject = (workingDir) => {
  if (!workingDir) return null;
  const existing = getProjectByDir(workingDir);
  if (existing) return existing;
  // Auto-create from directory basename
  const name = workingDir.split('/').filter(Boolean).pop() || workingDir;
  return createProject(name, workingDir);
};

// Auto-group existing sessions into projects on first run
const migrateSessionsToProjects = () => {
  const ungrouped = getDb().prepare(
    'SELECT DISTINCT working_dir FROM sessions WHERE project_id IS NULL AND working_dir IS NOT NULL'
  ).all();
  for (const row of ungrouped) {
    const project = getOrCreateProject(row.working_dir);
    if (project) {
      getDb().prepare('UPDATE sessions SET project_id = ? WHERE working_dir = ? AND project_id IS NULL').run(project.id, row.working_dir);
    }
  }

  // Backfill sessions that have a project but no working_dir
  const backfilled = getDb().prepare(`
    UPDATE sessions SET working_dir = (
      SELECT p.working_dir FROM projects p WHERE p.id = sessions.project_id
    )
    WHERE sessions.working_dir IS NULL
      AND sessions.project_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM projects p WHERE p.id = sessions.project_id AND p.working_dir IS NOT NULL)
  `).run();
  if (backfilled.changes > 0) {
    console.log(`[DB] Backfilled working_dir for ${backfilled.changes} session(s) from their project`);
  }
};

// Sessions

const createSession = (name, workingDir, provider, model, ownerId, projectId) => {
  const id = uuidv4();
  let pId = projectId || null;
  let wDir = workingDir || null;

  console.log(`[DB] createSession — input: name=${name}, workingDir=${workingDir || 'NULL'}, projectId=${projectId || 'NULL'}`);

  // If project specified but no working dir, inherit from project
  if (pId && !wDir) {
    const project = getProject(pId);
    console.log(`[DB] Project lookup for inheritance — project.working_dir=${project?.working_dir || 'NULL'}`);
    if (project && project.working_dir) {
      wDir = project.working_dir;
      console.log(`[DB] Inherited working_dir from project: ${wDir}`);
    }
  }

  // If working dir specified but no project, auto-assign
  if (!pId && wDir) {
    const project = getOrCreateProject(wDir);
    if (project) pId = project.id;
    console.log(`[DB] Auto-assigned project: ${pId}`);
  }

  // If both exist and project has no working_dir, backfill it
  if (pId && wDir) {
    const project = getProject(pId);
    if (project && !project.working_dir) {
      getDb().prepare('UPDATE projects SET working_dir = ? WHERE id = ?').run(wDir, pId);
      console.log(`[DB] Backfilled project working_dir: ${wDir}`);
    }
  }

  console.log(`[DB] Final INSERT — id=${id}, wDir=${wDir || 'NULL'}, pId=${pId || 'NULL'}`);
  getDb().prepare(`
    INSERT INTO sessions (id, name, working_dir, provider, model, owner_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, name || 'New Session', wDir, provider || 'claude', model || null, ownerId || null, pId);
  return getSession(id);
};

const getSession = (id) => {
  return getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(id);
};

const listSessions = () => {
  return getDb().prepare(
    'SELECT * FROM sessions ORDER BY CASE status WHEN \'active\' THEN 0 ELSE 1 END, updated_at DESC'
  ).all();
};

const updateSession = (id, fields) => {
  const allowed = ['name', 'status', 'working_dir', 'claude_session_id', 'provider', 'model', 'owner_id', 'project_id'];
  const sets = [];
  const values = [];
  for (const [key, val] of Object.entries(fields)) {
    if (allowed.includes(key)) {
      sets.push(`${key} = ?`);
      values.push(val);
    }
  }
  if (sets.length === 0) return getSession(id);
  sets.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  getDb().prepare(`UPDATE sessions SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getSession(id);
};

const deleteSession = (id) => {
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(id);
};

// Messages

const addMessage = (sessionId, role, content, toolCalls) => {
  const result = getDb().prepare(`
    INSERT INTO messages (session_id, role, content, tool_calls) VALUES (?, ?, ?, ?)
  `).run(sessionId, role, content || '', toolCalls ? JSON.stringify(toolCalls) : null);
  // Touch session
  getDb().prepare('UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(sessionId);
  return result.lastInsertRowid;
};

const getMessages = (sessionId, limit = 100, offset = 0) => {
  return getDb().prepare(`
    SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?
  `).all(sessionId, limit, offset);
};

const getMessageCount = (sessionId) => {
  return getDb().prepare('SELECT COUNT(*) as count FROM messages WHERE session_id = ?').get(sessionId).count;
};

const updateMessage = (id, content, toolCalls) => {
  const sets = ['content = ?'];
  const values = [content];
  if (toolCalls !== undefined) {
    sets.push('tool_calls = ?');
    values.push(JSON.stringify(toolCalls));
  }
  values.push(id);
  getDb().prepare(`UPDATE messages SET ${sets.join(', ')} WHERE id = ?`).run(...values);
};

// Settings

const getSetting = (key, defaultVal) => {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : defaultVal;
};

const setSetting = (key, value) => {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
};

// API Tokens

function hashToken(plaintext) {
  return crypto.createHash('sha256').update(plaintext).digest('hex');
}

const createToken = (name, allowedSessions, permissions = 'read_write') => {
  const id = uuidv4();
  const plaintext = 'archon_' + crypto.randomBytes(16).toString('hex');
  const token_hash = hashToken(plaintext);
  getDb().prepare(`
    INSERT INTO api_tokens (id, name, token_hash, allowed_sessions, permissions)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name, token_hash, allowedSessions ? JSON.stringify(allowedSessions) : null, permissions);
  return { id, name, token: plaintext, allowedSessions, permissions };
};

const getTokenByHash = (hash) => {
  return getDb().prepare('SELECT * FROM api_tokens WHERE token_hash = ?').get(hash);
};

const listTokens = () => {
  return getDb().prepare(
    'SELECT id, name, allowed_sessions, permissions, created_at, last_used_at FROM api_tokens ORDER BY created_at DESC'
  ).all();
};

const getToken = (id) => {
  return getDb().prepare('SELECT id, name, permissions, allowed_sessions FROM api_tokens WHERE id = ?').get(id);
};

const updateToken = (id, fields) => {
  const allowed = ['allowed_sessions', 'permissions'];
  const sets = [];
  const values = [];
  for (const [key, val] of Object.entries(fields)) {
    if (allowed.includes(key)) {
      sets.push(`${key} = ?`);
      values.push(val);
    }
  }
  if (sets.length === 0) return getToken(id);
  values.push(id);
  getDb().prepare(`UPDATE api_tokens SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getToken(id);
};

const deleteToken = (id) => {
  getDb().prepare('DELETE FROM api_tokens WHERE id = ?').run(id);
};

const touchToken = (id) => {
  getDb().prepare('UPDATE api_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
};

// Users

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
}

const createUser = (username, password, displayName, role = 'user') => {
  const id = uuidv4();
  const password_hash = hashPassword(password);
  getDb().prepare(`
    INSERT INTO users (id, username, password_hash, display_name, role)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, username, password_hash, displayName || username, role);
  return getUser(id);
};

const getUser = (id) => {
  return getDb().prepare('SELECT id, username, display_name, role, created_at, last_login_at FROM users WHERE id = ?').get(id);
};

const getUserByUsername = (username) => {
  return getDb().prepare('SELECT * FROM users WHERE username = ?').get(username);
};

const listUsers = () => {
  return getDb().prepare(
    'SELECT id, username, display_name, role, created_at, last_login_at FROM users ORDER BY created_at ASC'
  ).all();
};

const updateUser = (id, fields) => {
  const sets = [];
  const values = [];
  if (fields.display_name !== undefined) {
    sets.push('display_name = ?');
    values.push(fields.display_name);
  }
  if (fields.role !== undefined) {
    sets.push('role = ?');
    values.push(fields.role);
  }
  if (fields.password !== undefined) {
    sets.push('password_hash = ?');
    values.push(hashPassword(fields.password));
  }
  if (fields.last_login_at !== undefined) {
    sets.push('last_login_at = ?');
    values.push(fields.last_login_at);
  }
  if (sets.length === 0) return getUser(id);
  values.push(id);
  getDb().prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getUser(id);
};

const deleteUser = (id) => {
  getDb().prepare('DELETE FROM users WHERE id = ?').run(id);
};

// Login sessions (persist across restarts)
const createLoginSession = (userId, username, role, displayName) => {
  const id = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
  getDb().prepare(`
    INSERT INTO login_sessions (id, user_id, username, role, display_name, expires_at) VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, username, role, displayName || null, expires);
  return id;
};

const getLoginSession = (id) => {
  if (!id) return null;
  const row = getDb().prepare('SELECT * FROM login_sessions WHERE id = ? AND expires_at > datetime(\'now\')').get(id);
  return row || null;
};

const deleteLoginSession = (id) => {
  getDb().prepare('DELETE FROM login_sessions WHERE id = ?').run(id);
};

const cleanExpiredLoginSessions = () => {
  getDb().prepare("DELETE FROM login_sessions WHERE expires_at <= datetime('now')").run();
};

module.exports = {
  getDb, hashToken, hashPassword, verifyPassword,
  createProject, getProject, getProjectByDir, listProjects, updateProject, deleteProject, getOrCreateProject,
  createSession, getSession, listSessions, updateSession, deleteSession,
  addMessage, getMessages, getMessageCount, updateMessage,
  getSetting, setSetting,
  createToken, getToken, getTokenByHash, listTokens, updateToken, deleteToken, touchToken,
  createUser, getUser, getUserByUsername, listUsers, updateUser, deleteUser,
  createLoginSession, getLoginSession, deleteLoginSession, cleanExpiredLoginSessions,
};
