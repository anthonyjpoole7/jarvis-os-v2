# Jarvis OS v2 — Experimental Dashboard Rebuild

> **This is NOT the live Jarvis system.**
> The original lives at `~/jarvis`. This project is a separate experimental rebuild.

## Naming — read this first

| Path | What it is | How to open |
|------|------------|-------------|
| **`~/jarvis`** | **Original live system** (menubar app, n8n, Kokoro, voice-relay, amber HUD). **Do not treat this folder as the rebuild.** | **⌥⌘D** (Option+Cmd+D) — owned by `JarvisMenuBar.app` |
| **`~/jarvis-os-v2`** | **This rebuild** — cyan/steel experimental dashboard inspired by the original. Browser / static-server only. | `./scripts/open-dashboard.sh` → http://localhost:**8767** |

Also see [`DISTINCTION.md`](./DISTINCTION.md) for a short sibling-project checklist.

## Purpose

- **Original (`~/jarvis`)**: production personal OS — LaunchAgents, Swift menubar window, EventKit calendar, native speech.
- **This rebuild (`~/jarvis-os-v2`)**: visual + UX experiment. Same localhost backends when they are up; no launch agents; no Swift app; clearly branded **JARVIS OS v2** on screen.

## Open THIS dashboard (without touching the original)

```bash
~/jarvis-os-v2/scripts/open-dashboard.sh
```

That starts `python3 -m http.server` in `dashboard/` on **port 8767** (chosen so it does not collide with n8n `:5678`, Kokoro `:8765`, or voice-relay `:8766`), then opens the page in your browser.

Or manually:

```bash
cd ~/jarvis-os-v2/dashboard && python3 -m http.server 8767
# then visit http://localhost:8767
```

You can also open `dashboard/index.html` as a `file://` URL; some browsers restrict CORS/`file://` fetches to localhost, so the static server is preferred.

**⌥⌘D still belongs to the ORIGINAL menubar app** (`~/jarvis`). It will not open this rebuild.

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

It does **not** replace LaunchAgents, copy `.env`, or modify `~/jarvis`.

## Limitations (browser preview)

- **Calendar (EventKit)** needs the native Swift bridge — browser preview shows an honest note, not fake events.
- **VOICE mic / hide-window / restart-service** need the native bridge — toast explains that; typed chat still works via voice-relay when it is up.
- Market digest / projects / weather / status need n8n webhooks healthy.

## Git

Optional local repo. Secrets are gitignored. Do not push a remote unless you ask to.
