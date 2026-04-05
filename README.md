# Agent Kanban

<p align="center">
  <img src="./public/banner/agentKanban.png" alt="Agent Kanban banner" width="100%" />
</p>

<p align="center">
  <strong>Agent coding simplified. A visual workflow for staging prompts, dispatching agent work, and reviewing results in one place.</strong>
</p>

<p align="center">
  <a href="https://x.com/jorvekdev"><strong>@jorvekdev</strong></a> ·
  <a href="#workflow">Workflow</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="#roadmap">Roadmap</a>
</p>

<p align="center">
  <img alt="workflow" src="https://img.shields.io/badge/workflow-agent%20kanban-111111?style=for-the-badge">
  <img alt="focus" src="https://img.shields.io/badge/focus-agent%20coding-1f6feb?style=for-the-badge">
  <img alt="ui" src="https://img.shields.io/badge/ui-visual%20review-16a34a?style=for-the-badge">
  <img alt="stack" src="https://img.shields.io/badge/built%20with-next.js%2016-0f172a?style=for-the-badge">
</p>

Agent Kanban is a drag-and-drop board for running agent-driven coding work through the CLI tools you already use locally.

Instead of burying prompts inside chats, terminals, and scattered notes, it gives you a visual control surface where you can stage prompts, send them to the right agent, review the results, and iterate cleanly.

## Why Agent Kanban

Modern coding with agents gets messy fast.

You have prompts to stage, research to run, coding to execute, review loops to manage, and finished work to either keep or throw away. Agent Kanban turns that into a visible board flow that stays lightweight enough for daily use.

It is built for:

- solo developers
- AI-heavy builders
- small teams using CLI agents
- anyone who wants a cleaner review loop than "scroll back through the terminal"

## Workflow

Agent Kanban is not a generic left-to-right kanban board. It works more like a prompt staging area plus dispatch and review loop.

The default flow is:

- `Ideas`
- `Research`
- `Coder`
- `Reviewer`
- `Ready for Review`
- `Archive`

### What Each Column Means

- `Ideas` is where you stage prompts before sending them anywhere
- `Research` is for investigation, context gathering, and digging through source material
- `Coder` is for implementation work
- `Reviewer` is for review, validation, and quality checks
- `Ready for Review` is where completed agent output lands for you to inspect
- `Archive` stores finished work you want to keep around

## How It Works

1. Create a card in `Ideas`
2. Send it to the right agent lane:
   - `Research`
   - `Coder`
   - `Reviewer`
3. The selected agent runs through your configured local CLI
4. When the agent finishes, the card moves to `Ready for Review`
5. Inspect the result
6. If you want changes, use the chat field and dropdown selector to send adjustments back to the agent you want
7. When the work is done, move it to `Archive` or delete it

This makes Agent Kanban feel less like project management software and more like a control panel for prompt-driven development.

## Features

- drag-and-drop task routing
- prompt staging in `Ideas`
- agent-specific lanes for research, coding, and review
- automatic move to `Ready for Review` on completion
- follow-up adjustment loop through chat plus agent selector
- archive or delete cleanup path
- local CLI execution instead of app-side API lock-in

## Quick Start

```bash
git clone https://github.com/BitL8-ByteShort/agent-kanban.git
cd agent-kanban
npm install
cp config.example.yaml config.yaml
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Then edit `config.yaml` to define the agents you want available on the board.

## Configuration

Agent Kanban shells out to the CLI agents already installed on your machine. There is no separate hosted agent layer inside the app.

Example `config.yaml`:

```yaml
cli: "claude"

agents:
  - name: "Research"
    system_prompt: "You are a research specialist."
    on_complete: "move_to_review"

  - name: "Coder"
    system_prompt: "You are a senior developer."
    on_complete: "move_to_review"

  - name: "Reviewer"
    system_prompt: "You are a strict code reviewer."
    on_complete: "move_to_review"
```

### Agent Options

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Column header text |
| `system_prompt` | No | System prompt sent to the agent |
| `cli` | No | Override the global CLI for this agent |
| `model` | No | Specify a model |
| `skills` | No | Paths to skill or prompt files to reference |
| `on_complete` | No | `move_to_review` (default), `stay`, or `archive` |

## Requirements

- Node.js 18+
- a CLI agent installed and authenticated, such as `claude`, `codex`, or `gemini`
- a shell environment where your chosen CLI supports non-interactive execution

### Gemini Headless Note

Agent Kanban runs Gemini with `gemini -p` for one-shot execution. Browser OAuth alone is often not enough for that mode.

If Gemini cards fail immediately with an auth error, configure one of these before launching the app:

- `GEMINI_API_KEY`
- Vertex AI or Google Cloud auth such as `GOOGLE_GENAI_USE_VERTEXAI` or `GOOGLE_GENAI_USE_GCA`

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- `@hello-pangea/dnd`
- `xterm`

## Roadmap

- better board presets for common agent workflows
- improved review and adjustment history
- cleaner board setup for first-time users
- more flexible agent lane customization
- richer prompt and result presentation

## Follow

Build updates live on X: [@jorvekdev](https://x.com/jorvekdev)

## License

MIT
