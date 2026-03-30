# Beacon

**Beacon** is a desktop AI assistant for codebases. Point it at a local folder or a GitHub repository and start asking questions — Luna, the embedded AI, reads your code and answers with context, not guesses.

Built with [Tauri v2](https://tauri.app), React 19, TypeScript, and Gemini.

---

## Features

- **Local & GitHub projects** — index a folder from disk or import any public or private GitHub repo by URL
- **Context-aware chat** — Luna receives your file tree and up to 60 key source files as context, so answers are grounded in your actual code
- **Private repo support** — add a GitHub personal access token in Settings for private repositories and higher API rate limits
- **Persistent chat history** — conversation is saved per-project and restored when you reopen a recent project
- **Recent projects** — quick access to previously opened projects with per-card or bulk removal
- **Live Gemini model catalog** — fetches available Gemini 3.1 models from the API at startup, with a bundled fallback
- **Secure key storage** — Gemini API key is stored in the OS keychain (Windows Credential Manager, macOS Keychain, or libsecret on Linux), never written to disk in plain text
- **Frameless, transparent window** — native-feeling UI with custom title bar and window controls

---

## Prerequisites

- [Node.js](https://nodejs.org) 20+
- [Rust](https://rustup.rs) (stable toolchain)
- [Tauri CLI prerequisites](https://tauri.app/start/prerequisites/) for your platform
- A [Gemini API key](https://aistudio.google.com/app/apikey) (free tier available)

---

## Getting Started

```bash
# Install dependencies
npm install

# Start the desktop app in development mode
npm run desktop:dev

# Build a production installer
npm run desktop:build
```

---

## Configuration

All settings are accessible from the **Settings** page inside the app:

| Setting              | Description                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------- |
| Gemini API Key       | Required to use Luna. Stored in your OS keychain.                                             |
| GitHub Access Token  | Optional. Required for private repos; also raises the GitHub API rate limit for public repos. |
| Gemini Model         | Choose from the live Gemini 3.1 catalog (Pro, Flash, Flash Lite).                             |
| Max files in context | How many source files to include in the context sent to Luna (5–200).                         |
| Streaming responses  | Toggle token-by-token streaming on or off.                                                    |

---

## Tech Stack

| Layer         | Technology                             |
| ------------- | -------------------------------------- |
| Desktop shell | Tauri v2                               |
| UI            | React 19 + TypeScript                  |
| Styling       | Tailwind v4 + custom CSS design tokens |
| State         | Zustand v5 with `persist` middleware   |
| AI            | Google Gemini (via REST streaming API) |
| File walk     | `ignore` crate (respects `.gitignore`) |
| Keychain      | `keyring` crate (native per-platform)  |
| Bundler       | Vite 7                                 |

---

## Project Structure

```
beacon/
├── src/                  # React frontend
│   ├── pages/            # Home, Chat, Settings
│   ├── store/            # Zustand store (useAppStore)
│   ├── lib/              # Tauri IPC bridge (tauri.ts)
│   └── components/       # BeaconLogo, etc.
└── src-tauri/            # Rust backend
    └── src/
        └── commands/     # chat.rs, project.rs, keychain.rs
```

---

## License

MIT
