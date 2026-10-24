# Desktop alpha

An Electron desktop app for testing the local Lark bridge on Windows, macOS and Linux. No bridge account or subscription system is included in this version.

## Try the app

Download a build for your operating system from the **Desktop alpha** GitHub Actions workflow artifacts. Unzip the artifact, then run the Windows installer, macOS DMG, or Linux AppImage/deb. These alpha builds are unsigned; operating systems may show an unidentified-publisher notice. Only run builds you obtained from this repository.

Managed Windows computers may block unsigned builds through Device Guard. A blocked build needs your administrator's approval or a signed release. This app does not change that policy. Developers can use the source-development workflow below when permitted by their organization.

You still need an installed Codex CLI or Claude Code, your own agent account, and a Lark custom app. The installer includes the bridge runtime and official Lark CLI. It does not install the coding agent for you. Keep your computer awake and online while listening.

1. Open **Connections**, choose Codex or Claude Code, select a workspace folder and **Save settings**.
2. Click **Detect & check**. If the agent is missing, use **Installation guide**. If needed, use **Sign in to agent**. For an installation outside PATH, choose its executable under Advanced.
3. If Lark CLI is already configured, choose **Use existing CLI connection**. Otherwise open **Connect a different Lark app**, enter your own App ID and App Secret, and select the region. The secret goes to the official CLI through stdin and is not stored in desktop settings.
4. Enable your app's bot, long-connection reception, `im.message.receive_v1`, and the permissions described in the [Lark setup guide](../README.md#1-configure-your-lark-app). Make the app available to your user and publish it when Lark requires it.
5. Click **Sign in to Lark**. Open the displayed link or scan the QR code, approve the requested permissions, then click **Finish sign-in**. Your user ID is filled automatically.
6. Return to **Overview** and click **Start bridge**. Send `/status` to the bot in a direct Lark chat, then try a question or attach a PDF/image.

Only the allowed user's direct messages start tasks. Read-only access is the default. Select full access explicitly when testing commands, generated files or Lark write actions; the agent then runs with your computer account's permissions.

**Cancel task** interrupts the current agent and clears queued tasks. Completed changes remain. **Stop bridge** closes this app's listener. `/stop` in Lark also cancels tasks. Closing the window keeps the bridge in the system tray; choose **Quit** from the tray to exit. If the tray is unavailable, closing the window exits.

If another listener is already consuming events for the same app, startup is refused. Stop the old bridge or use a different Lark app for independent testing. The desktop does not stop another installation.

## Local data and accounts

**Local data folder** opens the desktop's own Electron user-data directory. Its `config.json`, `state/`, and `skills/` are separate from CLI-checkout data. Agent logins and Lark CLI credentials remain in their respective tools' stores. A newly connected Lark app uses the named `lark-agent-desktop` CLI profile.

The **Memory & skills** screen shows this desktop profile's saved information. Say “remember…” in Lark for facts or preferences; explicitly ask to create a skill or reuse a workflow for skills. The viewer does not import another bridge's memory.

There is no cloud account, analytics, auto-update service, code signing, or credential sync in this alpha. Agent/Lark API traffic uses those tools' normal services. Activity is displayed in the app; it is not sent to a project server. CLI sign-in detection does not guarantee a session is fresh: the first task may ask you to sign in again.

## Run or build from source

With Node.js 22+ and Git installed:

```sh
npm ci
npm run desktop
```

```sh
npm test
npm run test:desktop
npm run desktop:pack
npm run desktop:build
```

Linux UI tests require a display, for example `xvfb-run -a npm run test:desktop` in CI. Build on the target operating system. Installer output is in `dist/desktop/`. Runtime staging is allowlisted and excludes local config, credentials, attachments and memory. Windows builds produce NSIS installers; macOS produces DMG/ZIP; Linux produces AppImage/deb. Build jobs cover the current runner architecture; hardware validation on macOS and Linux is still needed before a stable release.

For isolated automated UI testing, `LARK_DESKTOP_DATA_DIR` selects a temporary desktop data directory and `LARK_DESKTOP_TEST=1` disables the tray. `LARK_DESKTOP_EXECUTABLE` lets the UI suite run a packaged executable. Tests use fake connections and never send real Lark messages.
