# ARCHON

**A self-hosted web interface for Claude Code and multi-model LLM sessions.**

ARCHON gives you a professional chat UI for Claude Code — accessible from any device with a browser. Run Claude Code sessions with full file system access, persistent history, and real-time streaming. Supports 7+ models via OpenRouter alongside native Claude Code agent mode.

## Features

- **Claude Code Agent Mode** — Full subprocess management with file access, tool use, and `--dangerously-skip-permissions`
- **Multi-Model Support** — Claude Sonnet 4.5, Opus 4, GPT-5, Gemini 2.5 Flash, DeepSeek V3.1, Kimi K2.5 via OpenRouter
- **Project Organization** — Group sessions by project with automatic working directory inheritance
- **Real-Time Streaming** — WebSocket-based message streaming with tool call visualization
- **Multi-User Auth** — Username/password authentication with admin/user roles and session ownership
- **Dark Theme** — OpenCode-inspired professional UI with Inter + IBM Plex Mono typography
- **Folder Browser** — Navigate and select working directories from the server's file system
- **Session Management** — Create, rename, delete, and organize sessions within projects
- **Turn-Based Rendering** — User/assistant message pairs with expandable tool call blocks

## Architecture

```
Frontend (React 19 + Vite 7 + Tailwind CSS 4)
    |
    WebSocket + REST API
    |
Backend (Node.js + Express + better-sqlite3)
    |
    ├── Claude Code subprocess (stream-json I/O)
    └── OpenRouter API (SSE streaming)
```

**Key design decisions:**
- `child_process.spawn()` with `--input-format stream-json --output-format stream-json` for clean bidirectional JSON communication with Claude Code
- SQLite for zero-config persistence (sessions, messages, users, projects)
- Unified provider abstraction — EventEmitter-based interface for both Claude and OpenRouter
- Zustand for frontend state management with localStorage persistence

## Quick Start

### Prerequisites

- Node.js 20+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- (Optional) [OpenRouter API key](https://openrouter.ai/) for non-Claude models

### Setup

```bash
git clone https://github.com/nehibird/archon.git
cd archon

# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..

# Configure environment
cp .env.example .env
# Edit .env with your settings (ADMIN_USERNAME, ADMIN_PASSWORD, etc.)

# Build frontend
cd frontend && npx vite build --outDir ../public && cd ..

# Start server
npm start
```

Open `http://localhost:3003` in your browser.

### Production Deployment

ARCHON is designed to run behind a reverse proxy (Cloudflare Tunnel, nginx, etc.) with HTTPS:

```bash
# Systemd service example
[Unit]
Description=ARCHON
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/opt/archon
ExecStart=/usr/bin/node server/index.js
Restart=always
Environment=NODE_ENV=production
Environment=DEFAULT_WORKING_DIR=/home/youruser/projects
Environment=ADMIN_USERNAME=admin
Environment=ADMIN_PASSWORD=your-secure-password
Environment=OPENROUTER_API_KEY=sk-or-v1-...

[Install]
WantedBy=multi-user.target
```

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3003` | Server port |
| `ADMIN_USERNAME` | No | — | Auto-create admin user on first startup |
| `ADMIN_PASSWORD` | No | — | Admin password (used with ADMIN_USERNAME) |
| `CLAUDE_PATH` | No | `claude` | Path to Claude Code binary |
| `DEFAULT_WORKING_DIR` | No | cwd | Fallback working directory for sessions |
| `OPENROUTER_API_KEY` | No | — | Required for non-Claude models |
| `AUTH_TOKEN` | No | — | Legacy bearer token auth (optional) |

## Security

ARCHON runs Claude Code with `--dangerously-skip-permissions`, which means Claude can execute arbitrary commands on your server. **Do not expose ARCHON to the public internet without proper authentication and HTTPS.**

- Always set strong `ADMIN_PASSWORD`
- Use HTTPS (Cloudflare Tunnel, nginx + Let's Encrypt, etc.)
- Consider network-level isolation (Tailscale, VPN, firewall rules)
- Session cookies are httpOnly and secure in production

## Tech Stack

- **Backend**: Node.js + Express + WebSocket (ws) + better-sqlite3
- **Frontend**: React 19 + Vite 7 + Tailwind CSS 4 + shadcn/ui + Lucide icons
- **State**: Zustand (frontend) + SQLite (backend)
- **Process Management**: child_process.spawn with stream-json
- **Multi-Model**: OpenRouter API with SSE streaming

## Credits

Frontend originally scaffolded from [opencode-web](https://github.com/chris-tse/opencode-web). The project has since been extensively rewritten with custom components, backend, auth system, project organization, and multi-model support.

## License

MIT
