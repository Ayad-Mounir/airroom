<div align="center">

<img src="public/icon-192.png" width="96" alt="AirRoom Logo" />

# AirRoom

**Real-time P2P File Sharing — Like WhatsApp, for Files**

[![Node.js](https://img.shields.io/badge/Node.js-≥18.0-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.7-010101?logo=socket.io)](https://socket.io)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)](https://sqlite.org)
[![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-2.0.0-brightgreen)](package.json)

Send files instantly between devices on the same network — or across the internet.  
No accounts, no cloud upload, no size limits enforced by a third party.

[Features](#-features) · [Quick Start](#-quick-start) · [Architecture](#-architecture) · [API Reference](#-api-reference) · [Deploy](#-deploy-to-railway) · [Contributing](#-contributing)

</div>

---

## ✨ Features

| Feature | Description |
|---|---|
| ⚡ **Instant Transfer** | Files arrive in real-time via Socket.io WebSocket — zero delay |
| 📴 **Offline Queue** | Send to offline contacts; files are stored in SQLite and delivered when they reconnect |
| 🧩 **Chunked Transfer** | Large files are split into chunks, assembled in-order, and saved reliably |
| 👥 **Contact System** | Add contacts by username; see online/offline status in real-time |
| 📱 **PWA — Installable** | Install on Android, iOS, or desktop — works like a native app |
| 🔌 **Works Offline** | Service Worker caches the UI shell; app loads without internet |
| 🔑 **Device Identity** | Persistent login via `deviceId` stored locally — no password needed |
| 🌐 **Any Network** | LAN, Wi-Fi, or public internet — works anywhere the server is reachable |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 18.0
- **npm** ≥ 8

### Run Locally

```bash
# 1. Clone the repository
git clone https://github.com/your-username/airroom.git
cd airroom

# 2. Install dependencies
npm install

# 3. Start the server
npm start
```

Open your browser at **`http://localhost:8080`**

> **Tip:** To share files between devices on the same network, use your machine's local IP (e.g. `http://192.168.1.x:8080`) instead of `localhost`.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | Server port |
| `DATABASE_PATH` | `./airroom.db` | Path to SQLite database file |

```bash
# Example
PORT=3000 DATABASE_PATH=/data/airroom.db npm start
```

---

## 📐 Architecture

```
airroom/
├── server.js          # Express + Socket.io backend
├── package.json
└── public/
    ├── index.html     # Single-page app (UI + client logic)
    ├── install.html   # PWA install guide page
    ├── sw.js          # Service Worker (cache strategy)
    ├── manifest.json  # PWA manifest
    ├── favicon.ico
    ├── favicon-32.png
    ├── icon-192.png   # PWA icon
    └── icon-512.png   # PWA icon (splash)
```

### Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js ≥ 18 |
| **HTTP Server** | Express 4 |
| **Real-time** | Socket.io 4.7 |
| **Database** | SQLite 3 (via `sqlite3`, WAL mode) |
| **Frontend** | Vanilla JS + HTML/CSS (no framework) |
| **PWA** | Service Worker + Web App Manifest |

### Database Schema

**`users`** — Registered devices
```sql
id TEXT PRIMARY KEY, username TEXT UNIQUE, deviceId TEXT UNIQUE,
createdAt DATETIME, lastLogin DATETIME
```

**`contacts`** — Bidirectional contact list
```sql
id, userId → users.id, contactUserId, contactUsername, isOnline, createdAt
UNIQUE(userId, contactUserId)
```

**`pending_files`** — Offline delivery queue
```sql
id, senderUserId, senderUsername, recipientUserId,
fileName, fileSize, fileData BLOB, mimeType, status, createdAt, sentAt
```

---

## 📡 API Reference

### REST Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/check-username/:username` | Check if username is available |
| `GET` | `/health` | Server health + online user count |
| `GET` | `/install.html` | PWA install guide |
| `GET` | `*` | SPA fallback → `index.html` |

### Socket.io Events

#### Client → Server

| Event | Payload | Description |
|---|---|---|
| `register_new_user` | `{ username }` | Register a new account |
| `login_user` | `{ deviceId }` | Log in with saved device ID |
| `reconnect_user` | `{ username }` | Reconnect by username |
| `connect_to_user` | `{ targetUsername }` | Add a contact |
| `send_file` | `{ recipientUserId, fileName, fileSize, fileData, mimeType }` | Send a complete file |
| `send_chunk` | `{ recipientUserId, name, type, size, total, index, data }` | Send one chunk of a large file |
| `get_contacts` | _(none)_ | Fetch contact list with online status |
| `ping_test` | _(none)_ | Latency check |

#### Server → Client

| Event | Description |
|---|---|
| `receive_file` | A complete file was delivered live |
| `receive_chunk` | A file chunk from a live sender |
| `receive_pending_file` | An offline-queued file delivered on login |
| `file_sent_success` | Delivery confirmation |
| `file_queued` | File saved to offline queue |
| `file_error` | Delivery failure |
| `contact_online` | A contact just connected |
| `contact_offline` | A contact just disconnected |
| `user_added_as_contact` | Someone added you as a contact |
| `session_replaced` | Your session was replaced by a newer login |
| `pong_test` | Ping response with server timestamp |

---

## 📦 File Transfer Flow

```
Sender                          Server                        Recipient
  │                               │                               │
  │── send_file / send_chunk ────►│                               │
  │                               │─── Online? ──────────────────►│
  │                               │       YES: relay instantly    │
  │◄── file_sent_success ─────────│                               │
  │                               │       NO: save to SQLite      │
  │◄── file_queued ───────────────│                               │
  │                               │                               │
  │                               │  (recipient reconnects later) │
  │                               │─── deliver pending files ────►│
  │                               │◄── markFileAsSent ────────────│
```

---

## 📱 PWA — Install as App

AirRoom is a fully installable Progressive Web App.

| Platform | Steps |
|---|---|
| **Android (Chrome)** | Tap the browser menu → *Add to Home Screen* |
| **iOS (Safari)** | Tap Share → *Add to Home Screen* |
| **Desktop (Chrome/Edge)** | Click the install icon (⊕) in the address bar |

The Service Worker uses a **Network First** strategy for HTML and **Cache First** for static assets, ensuring the app loads instantly even without internet.

---

## 🚂 Deploy to Railway

AirRoom is Railway-ready out of the box.

1. Push your code to a GitHub repository
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
3. Select your repository — Railway auto-detects Node.js and runs `npm start`
4. *(Optional)* Set environment variables in the Railway dashboard:
   - `DATABASE_PATH` → `/data/airroom.db` (for a persistent volume)

> **Note:** For production deployments with persistent data, attach a Railway Volume and point `DATABASE_PATH` to it. Otherwise the SQLite file resets on each redeploy.

---

## 🔒 Security Notes

- `deviceId` values are UUIDs generated server-side and stored client-side (`localStorage`). Guard your device ID — anyone with it can log in as you.
- File data is stored as binary BLOBs in SQLite. For production use, consider encrypting sensitive files at rest.
- The server accepts CORS from all origins (`*`). Restrict this in production if needed.

---

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you'd like to change.

```bash
# Development mode (auto-restart with nodemon if installed)
npx nodemon server.js

# Or simply
npm run dev
```

---

## 📄 License

[MIT](LICENSE) © AirRoom Contributors

---

<div align="center">

Built with ⚡ Socket.io · 🗃️ SQLite · 📱 PWA

</div>
