# Jarvis OS v2 — Experimental Dashboard Rebuild

> **This is NOT the live Jarvis system.**
> The original lives at `~/jarvis`. This project is a separate experimental rebuild.

## Naming — read this first

| Path | What it is | How to open |
|------|------------|-------------|
| **`~/jarvis`** | **Original live system** (menubar app, n8n, Kokoro, voice-relay, amber HUD). **Do not treat this folder as the rebuild.** | **⌥⌘D** (Option+Cmd+D) — owned by `JarvisMenuBar.app` (menu bar **J**) |
| **`~/Code/agents/jarvis-os-v2`** | **This rebuild** — cyan/steel experimental dashboard inspired by the original. | **⌥⌘S** (Option+Cmd+S) — owned by `JarvisOSv2MenuBar.app` (menu bar **J2**); or `./scripts/open-dashboard.sh` → http://localhost:**8767** |

Also see [`DISTINCTION.md`](./DISTINCTION.md) for a short sibling-project checklist.

## Live demo (GitHub Pages)

**Public UI preview:** [https://anthonyjpoole7.github.io/jarvis-os-v2/](https://anthonyjpoole7.github.io/jarvis-os-v2/)

Static snapshot under `docs/` — cyan/steel dashboard with offline stubs (no localhost backends required). Chat, voice, and health are demo-only.


## Purpose

- **Original (`~/jarvis`)**: production personal OS — LaunchAgents, Swift menubar window, EventKit calendar, native speech. Hotkey **⌥⌘D**.
- **This rebuild (`~/Code/agents/jarvis-os-v2`)**: visual + UX experiment. Same localhost backends when they are up; separate LaunchAgent + Swift accessory; clearly branded **JARVIS OS v2** on screen. Hotkey **⌥⌘S**.

## Native menubar helper (⌥⌘S)

Lightweight accessory app (separate from original `JarvisMenuBar`):

- Path: `~/Code/agents/jarvis-os-v2/menubar-app/JarvisOSv2MenuBar.app`
- Global hotkey: **Option+Cmd+S** (Carbon `kVK_ANSI_S` + `optionKey|cmdKey`)
- Menu bar title: **J2**
- Window title: **Jarvis OS v2**
- Loads `dashboard/index.html` via `loadFileURL`
- LaunchAgent: `com.jarvis.os.v2.menubar` (does **not** touch `com.jarvis.menubar`)

Rebuild after source changes:

```bash
~/Code/agents/jarvis-os-v2/menubar-app/build.sh
launchctl kickstart -k gui/$(id -u)/com.jarvis.os.v2.menubar
```

Logs: `~/Code/agents/jarvis-os-v2/logs/menubar.log` and `menubar-error.log`.

**⌥⌘D still belongs to the ORIGINAL menubar app** (`~/jarvis`).

## Open THIS dashboard in a browser (without the native helper)

```bash
~/Code/agents/jarvis-os-v2/scripts/open-dashboard.sh
```

That starts `python3 -m http.server` in `dashboard/` on **port 8767** (chosen so it does not collide with n8n `:5678`, Kokoro `:8765`, or voice-relay `:8766`), then opens the page in your browser.

Or manually:

```bash
cd ~/Code/agents/jarvis-os-v2/dashboard && python3 -m http.server 8767
# then visit http://localhost:8767
```

You can also open `dashboard/index.html` as a `file://` URL; some browsers restrict CORS/`file://` fetches to localhost, so the static server is preferred.

## What improved vs the original dashboard

- Cool **cyan/steel** theme (not amber Iron-Man gold)
- Live **service health** panel (n8n, Kokoro, voice-relay) with ONLINE/OFFLINE
- Working **Focus / Compact** layout toggle (hides secondary cards; emphasizes orb + assistant)
- Removed decorative page-dots and unwired CAMERA chrome
- Honest empty/error states when backends are down
- Branded **JARVIS OS v2** in the topbar so it is obvious on screen

## What still talks to the live backends

When the original services are running, this dashboard calls the same localhost endpoints:

- n8n webhooks: `http://localhost:5678/webhook/jarvis/...`
- Kokoro TTS: `http://localhost:8765`
- Voice relay WebSocket: `ws://localhost:8766/converse`
- Health: `5678/healthz`, `8765/health`, `8766/health`

It does **not** replace the original LaunchAgents, copy `.env`, or modify `~/jarvis`.

## Limitations (v2 native helper is minimal)

- **Calendar (EventKit)** and **Speech** are not wired in the v2 accessory yet — browser/native bridge notes still apply for those.
- **hideWindow** via the `jarvis` script message is supported; restart-service / voice are skipped for a simple build.
- Market digest / projects / weather / status need n8n webhooks healthy.

## Git

Remote: `anthonyjpoole7/jarvis-os-v2`. Secrets stay gitignored. GitHub Pages serves `docs/` from `main`.
