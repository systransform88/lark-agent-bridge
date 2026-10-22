# Lark Agent Bridge

Use a private Lark bot chat to work with **Codex** or **Claude Code** on your own computer.

Send instructions, upload PDFs or images, and receive answers and generated files in the same chat. The bridge keeps conversation sessions, explicit permanent memories, and reusable workflow skills locally.

This is an independent project. It uses the official Lark CLI and the selected coding agent's CLI; it is not an official Lark, OpenAI, or Anthropic product.

## Requirements

- Node.js 22 or newer and Git.
- Windows, macOS, or Linux. Windows is tested locally; the test workflow also covers macOS and Linux.
- A Lark custom app with bot capability and long-connection event reception enabled.
- A signed-in [Codex CLI](https://learn.chatgpt.com/docs/cli/reference) or [Claude Code](https://code.claude.com/docs/en/setup).
- Keep the computer awake and online while the bridge is running.

The Lark CLI is installed by `npm ci`. Use your own app and credentials. Nothing from the original author's Lark account is included.

## Install

```sh
git clone https://github.com/systransform88/lark-agent-bridge.git
cd lark-agent-bridge
npm ci
```

Install and sign in to at least one agent:

```sh
# Codex
npm install -g @openai/codex
codex login

# Or install Claude Code using Anthropic's installation instructions, then:
claude auth login
```

The bridge uses those local logins. It does not ask you to paste agent tokens into its configuration.

### 1. Configure your Lark app

Create an internal custom app in the [Lark Developer Console](https://open.larksuite.com/app), enable the bot, and make it available to your user.

In **Events & callbacks**, select the long-connection/WebSocket reception mode and subscribe to:

```text
im.message.receive_v1
```

Enable the bot permissions needed for these features, then publish the app version when the console requires it:

| Permission | Purpose |
| --- | --- |
| `im:message.p2p_msg:readonly` | Receive direct messages sent to the bot |
| `im:message:send_as_bot` | Reply as the bot |
| `im:message:readonly` | Load conversation history and message attachments |
| `im:resource` | Upload generated files and images |

Configure the app locally:

```sh
npm run lark -- config init --brand lark
npm run lark -- auth login --domain im
```

Follow the CLI's local setup and authorization prompts. Supply your own App ID and App Secret through its interactive/secure input flow. Do not put the secret in this repository or in shell arguments.

For tasks that access your personal documents or Drive, authorize the corresponding domains too:

```sh
npm run lark -- auth login --domain docs --domain drive
```

Additional Lark operations may need additional app scopes and access to the individual document/Base. Bot permissions and user OAuth authorization are separate. The bridge uses bot identity to receive/reply; an agent can use the CLI's authorized user identity for your personal resources.

For Feishu, use `--brand feishu` when configuring the CLI. This release's live Lark testing uses international Lark; verify your Feishu app's event and permission setup independently.

### 2. Run setup

```sh
npm run setup
```

The wizard asks for:

- `codex` or `claude`.
- `read-only` or `full` task access.
- The workspace directory.
- Your Lark `open_id`, usually detected from the CLI login. Only this user's direct messages are accepted.

Read-only is the default. Codex uses its read-only sandbox; Claude exposes only `Read`, `Glob`, and `Grep` with prompting disabled. File generation, skill creation, shell commands, and many agent-driven Lark operations require **full** access. Full access explicitly enables the selected CLI's permission-bypass flag and gives tasks your OS account's capabilities. Choose it only for a bot and user you control.

For scripted setup:

```sh
npm run setup -- --agent codex --access read-only --workspace ./workspace --user-id YOUR_OPEN_ID --yes
```

The selected agent must already be installed. `--force` replaces an existing local `config.json`. You can also copy `config.example.json` to `config.json`, fill in your own identity, and edit the options manually.

### 3. Check and start

```sh
npm run doctor
npm start
```

Wait for `READY: waiting for the authorized Lark user`, open a direct chat with your bot, and send `/status`. Then try a simple task.

Optional background launch:

```sh
npm run background
npm run stop
```

Logs go to `.bridge-data/bridge.log` and `.bridge-data/bridge-error.log`. `npm run stop` shuts down the service gracefully after the active task finishes. `/stop` in chat cancels the task immediately. No automatic startup service is installed.

## Chat commands

| Command | Action |
| --- | --- |
| `/status` | Show backend, model selection, access and session status |
| `/stop` | Cancel the active task and clear queued requests; keep the bot online |
| `/new` | Start a fresh conversation; retain permanent memories and workflow skills |
| `/model` | Show your model selection |
| `/models` | List the current backend's model choices |
| `/model MODEL_ID` | Select a model for subsequent tasks in this chat |
| `/model default` | Reset the model and start a new agent session on the next task |
| `/memories` | List saved permanent facts and preferences |
| `/remember key = value` | Save or update an entry directly |
| `/forget key` | Remove a saved entry |
| `/skills` | List saved workflow skills |
| `/clearfiles` | Clear active incoming-attachment context; keep downloaded files |

Model changes wait for a running task; use `/stop` first to interrupt it. Codex model choices come from its live model catalog. Claude's displayed choices are `sonnet` and `opus`; explicit Claude model IDs/aliases are also accepted and validated by Claude when a task runs. Available models depend on your account.

To change the backend, stop the bridge, edit `agent` in `config.json`, and restart. Sessions are kept separate by backend. Use `/model default` if you had selected a model for a different provider.

## Attachments

Send a PDF or PNG/JPEG/WebP/GIF image, wait for the receipt, then send an instruction:

> Summarize this PDF and create a short report.

> Extract the text from this image.

The bridge downloads the attachment, remembers the latest eight files in that chat, extracts PDF text, and renders scan/page previews. Both agent adapters receive image data. Generated files are uploaded as replies to the requesting message; images appear inline when supported.

- Incoming processing limit: 30 MB per file and 200 PDF pages.
- PDF previews: first two pages plus low-text/scanned pages, up to 20 previews. Preview-limit notes are passed to the agent.
- Up to six recent images/previews are included directly per turn; the remaining local previews can be inspected by tools when the access mode allows it.
- Outgoing limit: 10 files per task, 30 MB each. Images above 10 MB are sent as downloadable files.
- Output files must be explicitly listed in the agent's result and be inside that task's output directory.

## Memory and skills

Ordinary explicit save requests go to permanent memory:

> Remember that the customer contact prefers email.

> Remember this customer listing link: https://example.com/customers

The bridge uses a separate extraction request, writes the memory atomically, and verifies it before confirming the save. Permanent facts are scoped to the chat and loaded on every task, including after `/new` or a restart. `/memories` and `/forget` manage them. Removing a saved entry does not delete old Lark messages or transcript files.

A reusable workflow skill is created only when explicitly requested:

> Create a skill: when I say “check the customer listing,” open this exact file and check for missing contact details.

> Make this workflow reusable.

Skills live under `.bridge-data/skills/lark-workflow-*/SKILL.md` and their descriptions reload on each task. The bundled helper explains the portable skill format. No author's saved workflows are bundled.

Conversation memory resumes the saved CLI session and adds recent Lark history. Up to 150 raw messages are fetched, retaining up to 60 relevant messages / 50,000 characters plus quoted-message context. Tasks run serially, with a queue limit of 30 and a default 10-minute timeout. `/stop` terminates the task's process tree; changes or API calls already completed cannot be undone by cancellation.

## Local configuration and privacy

`config.json` contains your identity, backend choice, paths, and access mode. `.bridge-data/` contains session references, memories, downloaded-attachment metadata and logs. The workspace contains downloaded and generated files. All are ignored by Git; the source includes only a placeholder example config.

Those ignore rules cover the default paths. If you configure different directories inside the repository, add matching local Git ignore rules; `check:public` also checks configured data directories when local config is present.

Lark credentials remain in the official CLI's local configuration/key store. Codex/Claude credentials remain in those CLIs' own stores. Prompts, relevant history and attachments are sent to the selected agent provider to perform your tasks.

The bridge never accepts group messages or messages from a different user. It is intended as one person's local bridge, not a multi-tenant service. Use a distinct app if another bridge/OpenClaw/service is already receiving the same app's long-connection events.

If an executable is not discoverable on PATH, configure an explicit native command or Node entrypoint:

```json
{
  "commands": {
    "codex": {"command": "node", "args": ["/path/to/codex/bin/codex.js"]},
    "claude": {"command": "/path/to/claude", "args": []}
  }
}
```

Keep the rest of your local configuration. Commands are spawned with argument arrays, without a shell. `LARK_BRIDGE_CONFIG` can select another private config file.

To update an existing install, stop the bridge, run `git pull` and `npm ci`, then restart. Your ignored local config and data remain in place. Do not rerun setup with `--force` unless you intend to replace the configuration.

## Troubleshooting

- **No replies:** check bot availability, app publication, the event subscription, the allowed `open_id`, and the listener logs. API authorization alone does not enable event delivery.
- **Another connection exists:** stop the other consumer or use a separate Lark app.
- **Attachment permission errors:** grant the bot message-read/resource permissions and publish changes.
- **Agent cannot edit or run CLI commands:** check `access`. Read-only mode intentionally restricts tools.
- **Agent session expired:** run `codex login` or `claude auth login`, then retry. A CLI auth-status check can show configured credentials even when an API call later needs reauthentication.
- **Unsupported model:** use `/models` or `/model default`.
- **Wrong remembered information:** use `/memories`, then `/forget key` or an explicit correction.
- **Skill not listed:** its folder must start with `lark-workflow-` and contain valid `name`/`description` YAML frontmatter in `SKILL.md`.

## Development and validation

```sh
npm test
npm run check:public
```

Unit and subprocess tests use temporary fixtures; they do not require live accounts or send Lark messages. CI runs them on Windows, macOS and Linux.

Optional live adapter checks use your local agent login, make two model requests, and create test files in a temporary directory:

```sh
node tools/smoke-agent.mjs codex
node tools/smoke-agent.mjs claude
```

These checks exercise structured output, image input, file creation and session resumption. They do not send messages through Lark. An end-to-end installation check remains `/status`, an attachment, and a task in your own bot chat.

Initial release validation uses Node.js 24 on Windows, Codex CLI 0.163.0, Claude Code 2.1.277, and Lark CLI 1.0.98. The Codex live adapter check passed. The Claude adapter passes fixture tests and reaches the live CLI/API request, but this machine's expired Claude OAuth session prevented completion of its live check. Run the optional Claude check after signing in on your machine. The CI platform matrix validates fixture tests, not account-backed API calls.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). CLI behavior is based on [Codex non-interactive execution](https://learn.chatgpt.com/docs/non-interactive-mode), [Claude programmatic execution](https://code.claude.com/docs/en/headless), and the [official Lark CLI](https://github.com/larksuite/cli).

## License

AGPL-3.0-or-later. PDF processing uses MuPDF.js, which is distributed under AGPL-3.0-or-later. The complete license is in [LICENSE](LICENSE). Dependency notices remain with their packages.
