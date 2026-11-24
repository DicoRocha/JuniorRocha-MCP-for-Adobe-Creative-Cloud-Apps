# JuniorRocha MCP for Adobe Creative Cloud — Agent Rules & Operational Guide (`AGENTS.md`)

You control **Adobe Photoshop**, **After Effects**, **Premiere Pro**, **Illustrator**, **InDesign** and **Lightroom Classic** through the **Junior Rocha MCP** server (`adobe_*`, `ps_*`, `ae_*`, `pr_*`, `ai_*`, `id_*`, `lr_*`): 227 typed tools for the common operations, plus script escape hatches for everything else. The typed tools cover a subset of each app; see `docs/tools/` for the list and `docs/KNOWN-ISSUES.md` for what is not built in.

---

## 1. Golden Rules Across the 6 Adobe Applications

| Application | Tool Prefix | Coordinate System & Origin | Units | Color Format | Primary Bridge & Escape Hatch |
|---|---|---|---|---|---|
| **Photoshop** | `ps_*` | `[0, 0]` = **Top-Left** (`X` right, `Y` down) | Pixels (`px`) | RGB `0..255` (`{r, g, b}`) | UXP (`ps_batch_play`, `ps_execute_uxp_script`) + ExtendScript (`ps_execute_extendscript`) |
| **After Effects** | `ae_*` | `[0, 0]` = **Top-Left** (`X` right, `Y` down, `Z` depth). New layers sit at `[width/2, height/2]`; indices are 1-based | Pixels (`px`) & Seconds (`s`) | Normalized RGB **`0.0..1.0`** (`[r, g, b]`) | CEP/ExtendScript (`ae_execute_extendscript`, `ae_execute_menu_command`) |
| **Premiere Pro** | `pr_*` | Program Monitor `[0, 0]` = Top-Left; Motion Center = `[0.5, 0.5]` | Seconds (`s`) in MCP (`1s = 254016000000` ticks internally) | RGB `0..255` | UXP + CEP QE DOM (`pr_execute_uxp_script`, `pr_execute_extendscript`) |
| **Illustrator** | `ai_*` | **Y grows UPWARD.** Read `artboardRect` `[left, top, right, bottom]` first: script-created docs are `[0, H, W, 0]`, user-created docs `[0, 0, W, -H]`. Always `aiX = left + x`, `aiY = top - y` | Points (`pt`, `1pt = 1px` at 72dpi) | RGB `0..255` (`{r, g, b}`) | CEP/COM (`ai_execute_extendscript`, `ai_execute_menu_or_action`, `ai_send_cpp_script_message`) |
| **InDesign** | `id_*` | `{x, y, width, height}` from the **top-left of the page** (Y down), set per call | `units` per call: `mm` (default), `pt`, `px`, `cm`, `in`, `pica` | Swatch name, `#RRGGBB`, `[r,g,b]` or `[c,m,y,k]` | CEP panel or Windows COM (`id_execute_extendscript`); every call = one undo step |
| **Lightroom Classic** | `lr_*` | Photos by `id` (catalog `localIdentifier`) or the current selection | Develop slider values as in the Develop panel (`Exposure2012` −5..5, most others −100..100) | — | Lua plug-in (HTTP long-poll, starts with Lightroom; `lr_execute_lua`); every write = one undo step |

---

## 1b. Craft skills, checkpoints and errors (v1.3)

- **Skills first (1.10).** Never do a task in the apps without the skills it needs. Before the first tool
  that creates or changes work, call `jradb_find_skills { task }` with the request in plain words (or
  `jradb_get_skill` with no arguments for the router), tell the person which skills you will follow and ask
  once whether to go ahead with them, then load each with `jradb_get_skill { name }`. Until skills were looked
  up in the session, creating or changing tools answer `SKILLS_REQUIRED` (`JRADB_MCP_SKILLS_GATE`:
  `strict` default, `notice`, `off`). If no skill covers the request, say so before starting.
- **Before any creative deliverable**, call `jradb_get_skill` with no arguments: it returns the router
  (`skills/index.md`) that says which craft skills to load (composition, formats, social post, speech
  editing, print, scripts, QA) and in what order. Every delivery ends with the `qa-revisao-visual` gate.
- **`jradb_checkpoint`** saves a named, timestamped iteration (PS layered PSD copy, ID saveACopy, AI/AE/PR
  save + copy, LR develop snapshot). Use it before structural changes, renders, heavy previews and long scripts.
- **Errors carry `recoverable`, `hint` and `nextTools`.** After `BRIDGE_TIMEOUT` do not resend in a loop: the
  next command to that app first probes it and returns `APP_BUSY` if it is still stuck. `HOST_BLOCKED` = a
  dialog is open; `SCRIPT_PARSE_ERROR` = installed bridge bug (`npm run install-bridges`). Skill `ops-recuperacao`.
- Timeouts follow the kind of action (reads 30 s, scripts/previews 60 s, save/open/export/render 70 s, so the
  router's own timeout and busy probe fit inside the ~80 s window of a linked device). Override with
  `JRADB_MCP_TIMEOUT_{READ,MEDIUM,HEAVY,PROBE}_MS`.
- InDesign: type sizes in typed tools are points; in `id_execute_extendscript` write `"10pt"` strings.
- **Saves and exports create missing folders** and run with the app's dialogs off; the result is checked on disk
  (`SAVE_PATH_MISMATCH`, `SAVE_FAILED`). In your own scripts, write through `__mcpPrepareOutputFile(path)`:
  a save into a missing folder opens a blocking dialog in Illustrator and After Effects.
- After Effects `new`/`open` refuse to drop unsaved work (`PROJECT_DIRTY`) unless `discardChanges: true`.
- InDesign PDF: document bleed included by default, `cropMarks: true` on request; feather effects via
  `feather` in `id_modify_objects` / `id_create_shape`.
- Premiere: `pr_manage_project` operation `new`; `.aep` in `pr_import_media` comes in by Dynamic Link
  (`aeCompNames`); `pr_export_frame_or_sequence` takes `timeSeconds`.
- Photoshop document tools take `documentName`: the user may switch tabs while you work, and an edit or a save
  then lands in the wrong file. In scripts use `app.documents.getByName(...)`, never a bare `activeDocument`.
  New: `ps_list_fonts`, `ps_place_file`; layer styles (incl. colorOverlay, gradientOverlay) work without UXP.
- `ae_render_queue` queues first, then removes an existing output file (`overwrite`, default true; false
  answers `OUTPUT_EXISTS`) so After Effects never stops on its "Overwrite?" dialog. A render longer than the
  bridge timeout returns `renderJobId`: poll `media_job_status`. A failed After Effects command also removes
  the project items it created (`leftoversRemoved`).
- After Effects renders (`ae_render_queue`) and project switches close the command's undo group first (an open
  group raised "Undo group mismatch"). `ae_apply_preset` takes `time`; `ae_manage_project` `settings` sets bpc.
- Lightroom: previews detect the full-size blank placeholder and export instead; `lr_export_photos` `fileNames`;
  `lr_execute_lua` has `LrTasks`, `LrApplication`, `LrDevelopController` in scope.
- Premiere: Dynamic Link items answer to their comp name; a missing `targetBinName` is created.
- InDesign: literal `\r` / `\n` in text become real breaks; `id_find_change` samples are read before changing.

## 2. Mandatory Operational Protocol

1. **Check Status First When Unsure:**
   - Call `jradb_get_status` to verify whether target applications are running and whether a real-time WebSocket bridge (`UXP` or `CEP`) is connected.
   - If an app is installed but not running, call `jradb_launch_app`.
   - If `hub.role` is `offline`, read `hub.error` (usually another program is using port 31001) and tell the user; no panel can connect until that is fixed.
   - With no panel open, **Photoshop**, **Illustrator** and **InDesign** still run through **Windows COM**, and a **running After Effects** through **CLI `-r`** (slower; needs "Allow Scripts to Write Files and Access Network"). **Premiere Pro** needs its `Window > Extensions > Junior Rocha MCP` panel. **Lightroom Classic** needs its plug-in (installed by `install-bridges`, starts with Lightroom; `Library > Plug-in Extras > Status da ponte MCP`).
   - Photoshop's `ps_execute_uxp_script` needs the UXP panel (`Plugins > Junior Rocha MCP`). `ps_batch_play`, `ps_adjustment_layer` and `ps_smart_object` run on UXP **and** on CEP/COM (a built-in actionJSON → ActionDescriptor converter).
   - A bridge that does not implement an action answers `ACTION_NOT_SUPPORTED`; the server retries on the next bridge by itself. If that error reaches you, ask the user to open the panel named in the message instead of retrying.

2. **3-Tier Tool Selection Strategy:**
   - **Tier 1 (Semantic Tools First):** Always prefer typed semantic tools (`ps_create_layer`, `ae_create_shape_layer`, `ae_set_keyframes`, `pr_place_clip_on_timeline`, `ai_create_bezier_path`, etc.) because they automatically wrap operations in Undo Groups (`beginUndoGroup`/`endUndoGroup` or `executeAsModal` + `suspendHistory`).
   - **Tier 2 (Live DOM Introspection):** Before guessing an unknown property or object structure, call `jradb_inspect_dom` (e.g., `app: "after-effects"`, `targetExpression: "app.project.activeItem.layer(1)"`) to list exact properties, methods, and values at runtime.
   - **Tier 3 (Script Escape Hatches):** For anything the typed tools do not cover, use:
     - Photoshop: `ps_batch_play` (ActionManager descriptors), `ps_execute_uxp_script`, `ps_execute_extendscript`.
     - After Effects: `ae_execute_extendscript`, `ae_execute_menu_command`.
     - Premiere Pro: `pr_execute_uxp_script`, `pr_execute_extendscript` (with `app.enableQE(); qe.project...`).
     - Illustrator: `ai_execute_extendscript`, `ai_execute_menu_or_action`, `ai_send_cpp_script_message`.

3. **Strict ECMAScript 3 Rule for `*_execute_extendscript`:**
   - Adobe's ExtendScript engine (`Photoshop`, `After Effects`, `Premiere Pro`, `Illustrator` `.jsx`) runs **ECMAScript 3 (1999)**.
   - **NEVER** use `const`, `let`, arrow functions `() =>`, template literals `` `...` ``, destructuring, `for..of`, or `Array.prototype.map/filter/forEach` inside the `code` string passed to `*_execute_extendscript`.
   - **Chained conditionals are evaluated left to right by ExtendScript** (`x === 1 ? "a" : x === 2 ? "b" : "c"` gives "b" when x is 1 — verified in Photoshop and InDesign 2027). Parenthesise every nested conditional: `x === 1 ? "a" : (x === 2 ? "b" : "c")`, or use `if`. In `String.replace`, `"$1"` of an unmatched group becomes "undefined".
   - Always use `var` and standard `for (var i = 0; i < arr.length; i++)` loops. The value of the **last expression** is returned (a top-level `return` also works); make it a plain serializable value (numbers, strings, arrays, simple objects), not a live DOM object.
   - *(Note: `ps_execute_uxp_script` and `pr_execute_uxp_script` run in UXP's modern JavaScript engine and DO support ES6+/async-await; they must `return` their result).*
   - **Names are localized.** Effect/property display names and menu texts follow the app's UI language. Prefer matchNames (After Effects), internal menu identifiers (Illustrator) and `commandId`; in Premiere list the real effect names with `qe.project.getVideoEffectList()`.

4. **Visual Self-Correction Loop (Multimodal Vision):**
   - After creating or modifying visual layouts, typography, keyframes, or vector paths, capture a live preview to inspect your work visually:
     - Photoshop: `ps_get_canvas_snapshot`
     - After Effects: `ae_get_comp_frame_preview`
     - Premiere Pro: `pr_export_frame_or_sequence` (`mode: "frame"`)
     - Illustrator: `ai_get_artboard_preview`
     - InDesign: `id_get_page_preview`
     - Lightroom Classic: `lr_get_photo_preview`
   - Verify alignment, contrast, text legibility, and proportions before reporting completion.

---

## 3. Specialized Skills & Reference Cheatsheets

Consult the skills in `.agents/skills/` whenever working on specific tasks:
- **Photoshop**: [SKILL.md](.agents/skills/jrmcp-photoshop-expert/SKILL.md) & [batchplay-cheatsheet.md](.agents/skills/jrmcp-photoshop-expert/references/batchplay-cheatsheet.md)
- **After Effects**: [SKILL.md](.agents/skills/jrmcp-after-effects-motion/SKILL.md) & [ae-matchnames.md](.agents/skills/jrmcp-after-effects-motion/references/ae-matchnames.md)
- **Premiere Pro**: [SKILL.md](.agents/skills/jrmcp-premiere-editor/SKILL.md) & [premiere-qe-effects.md](.agents/skills/jrmcp-premiere-editor/references/premiere-qe-effects.md)
- **InDesign**: [SKILL.md](.agents/skills/jrmcp-indesign-layout/SKILL.md)
- **Lightroom Classic**: [SKILL.md](.agents/skills/jrmcp-lightroom-classic/SKILL.md)
- **Illustrator**: [SKILL.md](.agents/skills/jrmcp-illustrator-vector/SKILL.md) & [bezier-and-menus.md](.agents/skills/jrmcp-illustrator-vector/references/bezier-and-menus.md)
- **Cross-App Pipelines**: [SKILL.md](.agents/skills/jrmcp-creative-director/SKILL.md) & [cross-app-pipelines.md](.agents/skills/jrmcp-creative-director/references/cross-app-pipelines.md)

---

## 4. Effects, presets, batches (v1.2)

1. **Discover before applying.** Effect and transition names differ per install and per UI language.
   - After Effects: `ae_list_effects` (search by words; returns matchNames) → `ae_apply_effect` (returns every parameter: readback) → animate parameters with `ae_set_keyframes` and `propertyPath: ["ADBE Effect Parade", "<effect name>", "<parameter>"]`. Presets: `ae_list_presets` → `ae_apply_preset`. Manage existing effects: `ae_manage_effect`.
   - Premiere Pro: `pr_list_effects` (`kind`: videoEffects / audioEffects / videoTransitions / audioTransitions) → `pr_apply_transition` (one edge or `allCuts: true`) / `pr_apply_effect` → `pr_list_clip_effects` (readback) → `pr_set_effect_params` (values + keyframes). Volume in dB: `pr_set_volume`.
   - Photoshop: `ps_apply_filter` (37 DOM filters), `ps_adjustment_layer` (16 types), `ps_smart_object`, `ps_list_actions` / `ps_play_action`, `ps_menu_command`. For a Smart Filter convert the layer first (`ps_smart_object` operation `convert`).
   - Illustrator: `ai_find_objects` (returns `uuid`) → `ai_modify_objects`, `ai_apply_live_effect`, `ai_apply_gradient`, `ai_graphic_style`, `ai_swatches`, `ai_align_distribute`, `ai_pathfinder`. Target objects by `uuids` whenever possible.
   - A wrong name returns `EFFECT_NOT_FOUND` with the closest installed names: pick one, do not guess again.
2. **Batch repetitive work.** `jradb_batch` runs up to 100 operations of ONE app in a single round-trip, written as `{ tool, args }` with the same args each tool accepts. Everything is validated before anything runs. After Effects: one undo group. Photoshop: one history state. Illustrator / Premiere: no grouped undo (each step is its own undo). Image tools (snapshots, previews) are not allowed inside a batch.
3. **Read back, then look.** Tools return the state after the change (`layerId`, parameters, positions). Check it, then take one visual snapshot before reporting completion.
