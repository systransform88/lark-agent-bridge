# Security

Do not post credentials, logs containing private chat content, local configuration, or memory stores in public issues.

For a suspected vulnerability, use the repository's private security advisory reporting feature if enabled. Otherwise open an issue requesting a private contact without publishing exploit details or personal data.

The intended trust boundary is one authorized Lark user running an agent on their own computer. Full access deliberately permits that agent to execute commands with the OS account's capabilities. Read-only is the setup default. Group messages and other sender identities are rejected.

Agent providers receive the relevant task text, conversation context, memories and attachments. Incoming attachment paths and outgoing deliverable paths are checked, but full-access agent tasks are not isolated from the host OS. `/stop` cancels running processes and queued tasks; it does not roll back completed file changes or remote API calls.
