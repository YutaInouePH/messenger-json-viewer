# Messenger JSON Viewer

[![Nuxt UI](https://img.shields.io/badge/Made%20with-Nuxt%20UI-00DC82?logo=nuxt&labelColor=020420)](https://ui.nuxt.com)

A privacy-first web application to browse your [Facebook Messenger data export](https://www.facebook.com/help/212802592074644) locally.
Upload your `.zip` export, browse threads, read messages with media, and all data is **automatically deleted after 1 hour**.

## Features

- 📤 **Drag-and-drop upload** — upload your Facebook export zip (up to 500 MB)
- 💬 **Thread list** — search and filter all your conversations
- 📱 **Chat room view** — bubble-style messages with images, video, audio, reactions, and unsent message states
- 🔒 **Privacy-first** — data lives only on the server temporarily; never persisted to a database
- ⏱️ **1-hour auto-delete** — sessions expire after 60 minutes; both files and metadata are deleted
- 🌐 **UTF-8 / Japanese text** — correct rendering of all Unicode characters from Facebook's latin1-encoded exports
- 🖼️ **Media support** — images, videos, audio files, and generic attachments served through guarded routes

## Data Lifecycle

1. You upload a `.zip` file.
2. The server creates a **temporary session directory** (in `/tmp/messenger-sessions/<sessionId>/`) and extracts your zip there.
3. Messenger JSON files are parsed and indexed in memory.
4. An **expiry time of `createdAt + 1 hour`** is attached to the session.
5. All read APIs check expiry and return `410 Gone` for expired sessions.
6. Opportunistic cleanup runs on every API request; expired session directories and all their contents (JSON + media files) are deleted together.
7. You can also **manually delete your session** via the "Delete & Re-upload" button.

> **Note:** "Delete after 1 hour" is best-effort. If the server process restarts before cleanup, in-memory session metadata is lost but the directory can be cleaned up by the OS or a future restart. For stricter guarantees, consider adding a startup cleanup that removes any `/tmp/messenger-sessions/` directories older than 1 hour.

## Limitations

- **Single-server only** — sessions are stored in process memory; not suitable for multi-instance deployments.
- **Upload size** — capped at 500 MB per upload.
- **No persistence** — refreshing after session expiry requires a re-upload.
- **Media** — only media files bundled in the export zip are served; external links are displayed as text.

## How to Export Your Messenger Data

1. Go to **Facebook Settings → Your Facebook information → Download your information**.
2. Select **Messages** (and optionally **Photos/Videos**).
3. Choose **JSON format** and **Low quality** (for smaller file size).
4. Download the `.zip` when ready and upload it here.

## Setup

```bash
npm install
# or
pnpm install
```

Create a local `.env` file (do not commit it) with digest auth credentials:

```bash
cp .env.example .env
```

Required variables:

- `DIGEST_AUTH_USERNAME`
- `DIGEST_AUTH_PASSWORD`
- `DIGEST_AUTH_SECRET`

Optional:

- `DIGEST_AUTH_REALM` (defaults to `Messenger JSON Viewer`)

## Development Server

```bash
npm run dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production Build

```bash
npm run build
npm run preview
```

## Tech Stack

- [Nuxt 4](https://nuxt.com) — full-stack framework (`app/` + `server/`)
- [Nuxt UI](https://ui.nuxt.com) — component system
- [unzipper](https://www.npmjs.com/package/unzipper) — zip extraction
- [mime](https://www.npmjs.com/package/mime) — MIME type detection for media serving
