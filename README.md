# Garvey

An opinionated, AI-native writing primitive. The aim is to write up to 10x more, and better: essays, emails, product research, anything that has to be written.

Rather than relying on the AI to guess what you mean to say, Garvey turns a manual writing workflow into software: gather research, take notes, set out what the piece is for, then draft. AI then helps at each step. Each project carries its own context (intent, research notes linked to the passages they support, and your style profile), and every AI feature reads from that context.

Status: prototype. It runs locally, and your writing stays on your machine as plain files.

## What's in it today

AI features are small plugins, each with its own model and reasoning settings:

- **Tab completion**: suggests the rest of your sentence when you pause. Tab accepts it, Esc dismisses it.
- **Continue writing**: drafts the next paragraph from where you are.
- **Contextual suggest**: offers alternatives for a word or phrase you select, or finds the word or idiom you describe, in your own style.
- **Insert content**: decides where captured content belongs in your projects and formats it to fit.
- **OCR**: transcribes text from images and scans you attach.

The **Inspector** logs every AI call with its latency, token usage and cost.

## Requirements

- [Node.js](https://nodejs.org) 20.9 or later
- [Bun](https://bun.sh) (recommended; npm also works)
- One way to reach Claude:
  - an **Anthropic API key** from [console.anthropic.com](https://console.anthropic.com), or
  - a **Claude Pro or Max subscription**, signed in through [Claude Code](https://docs.claude.com/en/docs/claude-code)

AI calls go through the [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk/overview). It downloads its own copy of Claude Code during install, so you don't need to install Claude Code separately unless you want to use your subscription.

## Setup

```bash
git clone https://github.com/africanyeast/garvey-2.git garvey
cd garvey
bun install
```

### Connect to Claude

Choose one option.

**Option A: API key.** Copy the example env file and add your key:

```bash
cp .env.local.example .env.local
```

```
ANTHROPIC_API_KEY=sk-ant-...
```

Every AI call is then billed to that key. If a key is set, it takes priority over a Claude Code login.

**Option B: Claude subscription.** Install Claude Code, run `claude` once and sign in with your Claude account. Leave `ANTHROPIC_API_KEY` unset. Garvey uses the same login.

### Run

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

On the first request, Garvey creates two folders at the repo root:

- `vault/` holds your projects, notes and uploads, one Markdown file per item.
- `.os/` holds settings: the active style profile (`.os/styles/default.md`), the enabled plugins (`.os/config.yaml`) and the AI call log.

Both are gitignored, so your writing is never committed. Back them up yourself.

## Development

```bash
bun test      # unit tests
bun run lint
bun run build
```

## Stack

Claude Agent SDK · Next.js · BlockNote · local-first file vault
