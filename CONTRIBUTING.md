# Contributing

Use Node.js 22 or newer, run `npm ci`, then `npm test`. Add a regression test when changing task routing, permission modes, provider adapters, cancellation, or memory persistence.

Use temporary fixtures and mock CLI scripts for automated tests. Live agent checks are opt-in and use the contributor's own account. Do not send test messages to other people's Lark chats.

Run `npm run check:public` after staging your changes. Never commit local configuration, credentials, identities, chat transcripts, memories, downloads, generated files, logs, or real-account smoke-test data.

Keep CLI invocations as executable-plus-argument arrays. Preserve the sender allowlist and explicit full-access opt-in. Document backend/platform limitations and include the relevant test results in pull requests.
