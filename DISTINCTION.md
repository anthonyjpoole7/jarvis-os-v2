# Sibling projects — do not confuse them

Home directory neighbors:

| Folder | Role |
|--------|------|
| `~/jarvis` | **Live original.** Amber HUD. **⌥⌘D** (Option+Cmd+D). LaunchAgents. Do not edit as part of v2 work. |
| `~/Code/agents/jarvis-os-v2` | **Experimental rebuild** (this repo). Cyan/steel. **⌥⌘S** (Option+Cmd+S) via `JarvisOSv2MenuBar.app`, or `scripts/open-dashboard.sh` on port **8767**. |

| Hotkey | Opens | App / label |
|--------|-------|-------------|
| **⌥⌘D** | Original `~/jarvis` dashboard | `JarvisMenuBar.app` / `com.jarvis.menubar` — menu bar **J** |
| **⌥⌘S** | Jarvis OS v2 dashboard | `JarvisOSv2MenuBar.app` / `com.jarvis.os.v2.menubar` — menu bar **J2** |

If you ever see both open: amber + Option+Cmd+D = original; cyan + Option+Cmd+S / localhost:8767 = v2.
