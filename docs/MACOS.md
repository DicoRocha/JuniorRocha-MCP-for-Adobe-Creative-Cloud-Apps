# macOS

**Status on 21 November 2026:** validated once, on one machine. Installation, detection, the six bridges and the
main commands of each app work. A few items were not exercised and are listed under [Not tested yet](#not-tested-yet).
Treat macOS as supported but young: if something fails, the logs in `logs/` and this page are the place to start.

| | |
|---|---|
| Validated on | macOS 27.2.1, Apple Silicon (arm64), Node.js 26.8.1 |
| Apps | Photoshop 28.0, Illustrator 31.0, InDesign 22.0, After Effects 27.0, Premiere Pro 27.0, Lightroom Classic 16.0.1 |
| Project version | 1.8.0 plus the fixes below, shipped in 1.9.0 |

## Install on macOS

1. Install [Node.js](https://nodejs.org) 20 or newer (`node -v`).
2. Get the project (clone, or unzip the source) into a folder such as `~/Dev/jr-adb-mcp-bridge`.
3. Close the creative apps and run the setup script. If macOS refuses to run it, restore the execute bit first:

   ```bash
   chmod +x *.command
   ./SETUP.command
   ```

   It runs `npm install`, the build, the tests, `install-bridges`, `package-plugins`, `doctor` and
   `package-mcpb`, and writes one log per step to `logs/`.
4. Double-click each `.ccx` in `release/`. Creative Cloud installs them into Photoshop, Premiere Pro and InDesign.
5. Install `release/jr-adb-mcp-bridge-<version>.mcpb` in Claude Desktop (Settings, Extensions), or run
   `./ADD-TO-CLAUDE-DESKTOP.command` instead. Use one of the two, not both. Quit Claude Desktop and open it again.
6. Open your apps and ask: *"Check the status of my creative apps."*

Port `31001` must be free: the panels connect to it and the port is fixed in the panels. If another program holds
it, the server starts but no bridge connects. (Up to version 1.8 the port was 3001, which clashed with another
program on the Mac used for the validation.)

## How the macOS path differs from Windows

| Part | File | On macOS |
|---|---|---|
| App detection | `src/core/adobe-detector.ts` | Looks for `/Applications/<folder>/<name>.app`; "running" comes from `ps -A -o comm=` |
| Launching an app | `src/tools/shared/index.ts` (`jradb_launch_app`) | `open -a <bundle.app> [file]` |
| Scripting without a panel | `src/core/com-runner.ts` | `osascript`: Photoshop and Illustrator `do javascript`, InDesign `do script … language javascript`, After Effects `DoScript`. The target is the path of the detected `.app`, because bundle ids change between apps and versions |
| After Effects answers | `src/core/com-runner.ts` | `DoScript` always returns `"0"`, so the result is written to a file and read back, like the Windows `-r` route |
| CEP debug mode | `scripts/install-bridges.ts` | `defaults write com.adobe.CSXS.N PlayerDebugMode 1` for N from 9 to 14 |
| Install folders | `scripts/install-bridges.ts` | `~/Library/Application Support/Adobe/CEP/extensions`, `…/Adobe/UXP/Plugins/External`, `…/Adobe/Lightroom/Modules` |
| Claude Desktop config | `scripts/install-claude-desktop.mjs` | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Paths with accents | `src/extendscript/es3-runtime.jsx` (`__mcpSamePath`) | Apps return paths decomposed (NFD) and tools pass them composed (NFC); Latin accents are composed before comparing |
| Premiere presets | `src/extendscript/pr-handlers.jsx` | Sequence and export presets live under `<app>.app/Contents/`; both roots are tried |
| InDesign preview | `src/extendscript/id-handlers.jsx` | A JPEG preview requested as `x.png` is written as `x.png.jpg`; the handler looks for that name |
| ffmpeg | `src/media/ffmpeg.ts` | Also searched in `/opt/homebrew/bin`, `/usr/local/bin`, `/opt/local/bin`; the arm64 `ffmpeg-static` from npm works |

Windows behaviour is untouched: every macOS branch is behind `process.platform === "darwin"`.

## What was validated

- `SETUP.command` end to end: seven steps with `exit=0`, 310 tests passing.
- Detection: folders and `.app` names correct, "running" correct.
- The three `.ccx` files install through Creative Cloud. The copy installed by `.ccx` and the copy placed by
  `install-bridges` do not load twice.
- **All six bridges connect on their own, without opening a panel:** Photoshop `uxp` (about 17 s after launch),
  Illustrator `cep` (under 10 s), InDesign `uxp` and `cep` (under 20 s), After Effects `cep` (about 40 s),
  Premiere Pro `uxp` and `cep` (about 60 s), Lightroom Classic `lua` (about 20 s).
- Scripting without a panel through AppleScript in Photoshop and After Effects, with accents and quotes intact.
  No Automation permission prompt appeared for the terminal that ran the server.
- Photoshop, InDesign, Illustrator, After Effects, Premiere Pro and Lightroom Classic: document creation, text
  with accents, layer styles, selections, guides, Camera Raw, text wrap, drop caps, QR codes, clipping masks,
  dashed strokes, text styles, time-based animation, rendering, sequence creation without a dialog, import,
  scene detection, export, project lock, develop settings, snapshots, colour panels and export.
- Saving and exporting to a folder with a space and an accent (`~/Desktop/MAC_TESTE Ação/`) in all six apps.
- Leader and follower servers sharing the hub (on port 3001 at the time; the default is 31001 since 1.9.0).

Real bundle ids found: Photoshop `com.adobe.Photoshop`, Illustrator `com.adobe.illustrator`, InDesign
`com.adobe.InDesign`, After Effects `com.adobe.AfterEffects.application`, Premiere Pro `com.adobe.PremierePro.27`,
Lightroom Classic `com.adobe.LightroomClassicCC7`. Illustrator 2027 runs CEP 12 (`CSXS.12`).

## Fixes that came out of the validation

| File | Problem on macOS | Change |
|---|---|---|
| `scripts/doctor.ts` | Looked for bridges and the Claude config under `~/AppData/Roaming` | Uses `~/Library/Application Support` on macOS |
| `src/core/com-runner.ts` | `tell application id "com.adobe.AfterEffects"`: the real id differs and changes with the version | Targets the detected `.app` path; the bundle id is the fallback |
| `src/core/com-runner.ts` | After Effects `DoScript` runs the script but always returns `"0"` | The answer goes through a file |
| `src/extendscript/es3-runtime.jsx` | NFC and NFD forms of the same path did not match: creating a project in a folder with an accent reported `SAVE_FAILED` although the project had been created | Latin accents are composed before comparing |
| `src/core/adobe-detector.ts` | Wrong After Effects bundle id | Corrected |
| `src/extendscript/pr-handlers.jsx` | Default export preset looked for outside `Contents/` | Both roots are tried |
| `src/extendscript/id-handlers.jsx` | Preview written as `x.png.jpg`, handler returned `x.png` | Falls back to the `.jpg` name |
| `scripts/package-plugins.ts` | `EISDIR` when a double-clicked `.zip` had been extracted into `release/` | Recursive cleanup |
| `.mcp.json` | Absolute Windows path | Relative `dist/index.js` |

## Not tested yet

- Installing the `.mcpb` in Claude Desktop on macOS was not confirmed (the extension did not show up in the first
  attempt; the alternative `ADD-TO-CLAUDE-DESKTOP.command` was not run).
- The on and off switch in each panel (it needs a click on the panel).
- Scripting without a panel in Illustrator and InDesign (same route as Photoshop, which passed).
- Out-of-bounds recipes, Image Trace, importing `.ai` files into After Effects, time remapping and captions from an
  SRT: they need specific source files.
- The project installed in a path with spaces, and files on an external volume or iCloud Drive.
- Transcription with the server's own engine (it downloads a model on first use).

## Validating again

The routine and the helper used for this validation are in [`mac-validation/`](../mac-validation/README.md).
