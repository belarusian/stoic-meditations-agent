# Stoic What If Cards

A web-based Stoic philosophy dialogue tool that reads from Marcus Aurelius' *Meditations* to help users reflect on present-moment challenges.

## Architecture

```
client/          ← Frontend (HTML + testable client module)
src/             ← Backend (A2A agent server, Genkit, RAG)
dist/            ← Built output (gitignored)
```

## Setup

```bash
npm install
```

## Running

### Server (A2A + LLM proxy)

```bash
npm run build:server    # Compile TypeScript → dist/
npm start               # Start agent server on localhost:41242
```

### Client (web UI)

```bash
npm run build:client    # Run tests + bundle → dist/index.html + dist/client.js
npx serve dist -l 3000  # Serve built assets from dist/ on localhost:3000
```

### Both together

```bash
npm run build           # Compiles server + runs client build (tests + bundle)
npm start &             # Start server in background
npx serve . -l 3000     # Open browser at localhost:3000
```

## Configuration

Set environment variables before running the server:

| Variable | Default | Description |
|---|---|---|
| `LLM_BASE_URL` | `http://10.106.1.89:8080/v1` | OpenAI-compatible LLM endpoint |
| `LLM_API_KEY` | `dummy` | API key for the LLM server |
| `STOIC_AGENT_PORT` | `41242` | Port for the A2A agent server |

```bash
LLM_BASE_URL=http://10.106.1.182:8888/v1 LLM_API_KEY=sk-your-key npm run build && npm start
```

## Client Package

The client lives in `client/` and is separated from the server to keep testable logic isolated from Node-only dependencies.

### Structure

```
client/
  src/client.ts         ← Testable module (exports: extractTextFromEvent, isConversationFinished, renderText, processEventStream)
  test/client.test.ts   ← 12 unit tests (no DOM, no network, no LLM)
  index.html            ← Source HTML (with placeholder for build)
  build.mjs             ← Build pipeline: tests → bundle → wire HTML → copy to dist/
```

### Client Commands

```bash
npm run build:client    # Run tests + bundle (outputs to dist/)
npm test                # Run unit tests only
```

The build pipeline:
1. Runs unit tests (fails fast if tests don't pass)
2. Bundles `client/src/client.ts` → `dist/client.js` (minified ESM)
3. Wires `client/index.html` → `dist/index.html` (replaces placeholder with app script)
4. Copies `dist/client.js` and `dist/index.html` to root `dist/` for serving

### Server Package

The server lives in `src/` and handles the A2A protocol, LLM integration, and RAG:

```bash
npm run build:server    # Compile TypeScript → dist/
npm start               # Run compiled server
```

## Design

- Minimalist, colorless UI — clean typography, no distractions
- Supports system dark mode (`prefers-color-scheme: dark`)
- Markdown rendering for agent responses (bold, italic, lists, blockquotes)
- Conversation history preserved across messages via A2A task lifecycle
- Streaming responses with real-time updates
