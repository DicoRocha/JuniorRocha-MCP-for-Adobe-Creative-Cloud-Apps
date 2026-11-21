# Shared tools

Status, code mode, skills, checkpoints, templates and campaigns. They work across apps.

[← All tools](README.md)

| Tool | What it does |
|---|---|
| [`jradb_get_status`](#jradb_get_status) | Check installed Adobe apps, running processes, live WebSocket/COM bridges and each app's command queue (command in flight and for how long, queued commands, suspected busy… |
| [`jradb_launch_app`](#jradb_launch_app) | Launch an installed Adobe Creative Cloud application on the local machine, optionally opening a file with it (.prproj, .aep, .psd, .ai, .indd…) so it does not stop on the start… |
| [`jradb_inspect_dom`](#jradb_inspect_dom) | API discovery: dynamically inspect any runtime object, property list, and method signatures inside Photoshop, After Effects, Premiere Pro, or Illustrator (e.g. |
| [`jradb_bridge_transfer`](#jradb_bridge_transfer) | Cross-application pipeline: export the active document of a source app (Illustrator or Photoshop) to exchangeFilePath and import that file into After Effects or Premiere Pro. |
| [`jradb_checkpoint`](#jradb_checkpoint) | Save a named, timestamped iteration of the active document/project BEFORE a structural change, a long render, a heavy preview or anything that could hang the app. |
| [`jradb_contact_sheet`](#jradb_contact_sheet) | Contact sheet of delivered pieces: every image (png, jpg, webp, tiff) and video (one frame) in a folder, in name order, laid out in one PNG grid — review a whole campaign,… |
| [`jradb_usage`](#jradb_usage) | Token accounting of this MCP's tool calls (sizes only, logged per call). |
| [`jradb_get_skill`](#jradb_get_skill) | Craft knowledge for marketing and advertising work in the Adobe apps (planning, scripts, prompts for external AI, design fundamentals, photo, social, vector, motion, video,… |
| [`jradb_templates_build`](#jradb_templates_build) | Build the brand's template set from the brand kit: Photoshop .psdt social posts (feed 4:5, story 9:16, square — layers named Titulo, Apoio, CTA, Foto, Logo, Botao, Fundo for… |
| [`jradb_batch`](#jradb_batch) | Run many operations on ONE Adobe app in a single round-trip and as a single undo step (After Effects undo group; one Photoshop history state). |
| [`jradb_code`](#jradb_code) | Code mode: run an async JavaScript body that calls this MCP's tools and return only what you need. |
| [`jradb_api`](#jradb_api) | Signatures for jradb_code: with `tools`, each tool's arguments as TypeScript (with defaults and one-line notes); with `search` or `prefix` (ps_, ae_, pr_, ai_, id_, lr_,… |
| [`jradb_campaign_run`](#jradb_campaign_run) | Run a whole campaign from <campaignFolder>/00_briefing/plano-de-pecas.json (schema: skills/_shared/plano-de-pecas.schema.json) with kit-de-marca.json: each piece calls a… |

## `jradb_get_status`

Check installed Adobe apps, running processes, live WebSocket/COM bridges and each app's command queue (command in flight and for how long, queued commands, suspected busy after a timeout, last error, last success). Call it first, and whenever a command times out or returns APP_BUSY.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `checkRunningProcesses` | boolean |  | Whether to check OS process list for running Adobe apps. Default: `true`. |

## `jradb_launch_app`

Launch an installed Adobe Creative Cloud application on the local machine, optionally opening a file with it (.prproj, .aep, .psd, .ai, .indd…) so it does not stop on the start screen. If the app is already running, the reply names the tool that opens the file inside it.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `app` | `photoshop` · `after-effects` · `premiere` · `illustrator` · `indesign` · `lightroom` | yes | Target Adobe application to launch. |
| `filePath` | string |  | Project or document to open on launch (Premiere: a .prproj avoids the start screen). |

## `jradb_inspect_dom`

API discovery: dynamically inspect any runtime object, property list, and method signatures inside Photoshop, After Effects, Premiere Pro, or Illustrator (e.g. 'app', 'app.project', 'app.activeDocument').

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `app` | `photoshop` · `after-effects` · `premiere` · `illustrator` · `indesign` | yes | Target Adobe host application. |
| `targetExpression` | string |  | JavaScript/ExtendScript expression to inspect (e.g. 'app.project.activeItem' or 'app.activeDocument'). Default: `"app"`. |
| `maxProperties` | integer |  | Maximum number of properties/methods to return. Default: `150`. |

## `jradb_bridge_transfer`

Cross-application pipeline: export the active document of a source app (Illustrator or Photoshop) to exchangeFilePath and import that file into After Effects or Premiere Pro. Supported: Illustrator -> png; Photoshop -> png or psd. (After Effects and Premiere Pro do not import SVG; for layered Illustrator art save the .ai with ai_manage_document and import it with ae_manage_project.)

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `sourceApp` | `illustrator` · `photoshop` | yes | Source application holding the active artwork/document. |
| `targetApp` | `after-effects` · `premiere` | yes | Destination video/motion application. |
| `exchangeFilePath` | string | yes | Absolute path for the intermediate exported asset (e.g. 'C:/temp/transferred_asset.png'). |
| `format` | `png` · `psd` · `svg` |  | Intermediate file format. Default: `"png"`. |
| `importAsComp` | boolean |  | When importing PSD/AI into After Effects, import as layered composition. Default: `false`. |

## `jradb_checkpoint`

Save a named, timestamped iteration of the active document/project BEFORE a structural change, a long render, a heavy preview or anything that could hang the app. Photoshop: layered PSD copy; InDesign: saveACopy; Illustrator, After Effects, Premiere: save, then copy the file (a never-saved document is saved as the checkpoint, reported as documentPathChanged); Lightroom: a Develop snapshot on the target photos. Default folder: '_checkpoints' next to the original file, or Documents/MCP-checkpoints.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `app` | `photoshop` · `illustrator` · `indesign` · `after-effects` · `premiere` · `lightroom` | yes |  |
| `label` | string |  | Short name for the iteration, e.g. 'antes-da-animacao'. |
| `folder` | string |  | Absolute folder for the copy. Ignored for Lightroom. |

## `jradb_contact_sheet`

Contact sheet of delivered pieces: every image (png, jpg, webp, tiff) and video (one frame) in a folder, in name order, laid out in one PNG grid — review a whole campaign, carousel or variant batch in a single look before delivery. Folders starting with '_' are skipped. Needs ffmpeg (installed with the MCP's optional packages).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `folder` | string | yes | Absolute folder with the pieces. |
| `recursive` | boolean |  |  Default: `false`. |
| `filter` | string |  | Regular expression on file names, e.g. '4x5\|9x16'. |
| `columns` | integer |  |  |
| `cellWidth` | integer |  | Width of each piece, px (default 240). |
| `videoAtSeconds` | number |  |  Default: `1`. |
| `maxFiles` | integer |  |  Default: `60`. |
| `outputPath` | string |  | Default: <folder>/_folha-de-contato.png. |
| `includeImageContent` | boolean |  |  Default: `true`. |

## `jradb_usage`

Token accounting of this MCP's tool calls (sizes only, logged per call). start: label the calls that follow (e.g. 'fluxo-A-classico'); stop: end the label; report: totals and the heaviest tools for a label or since a time.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `operation` | `start` · `stop` · `report` | yes |  |
| `run` | string |  | Label (start) or label to report. |
| `since` | string |  | ISO time: report calls after it. |

## `jradb_get_skill`

Craft knowledge for marketing and advertising work in the Adobe apps (planning, scripts, prompts for external AI, design fundamentals, photo, social, vector, motion, video, print, QA). Call with no arguments FIRST for any creative deliverable: it returns the router (studio-router) that says which skills to load and in what order. Then call with `name` to load a skill, and with `name` + `reference` for one of its reference files. `list: true` lists every skill with its description.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `name` | string |  | Skill name, e.g. 'social-post'. Omit to get the router. |
| `reference` | string |  | File in the skill's references/ folder, e.g. 'formatos.md'. |
| `list` | boolean |  | List every skill (name, area, description, references). Default: `false`. |

## `jradb_templates_build`

Build the brand's template set from the brand kit: Photoshop .psdt social posts (feed 4:5, story 9:16, square — layers named Titulo, Apoio, CTA, Foto, Logo, Botao, Fundo for ps_batch_variants), InDesign .indt (flyer A4, catalogue A4, manual A5), Illustrator .ait (brand swatches, character styles, social artboards) and After Effects .mogrt (lower third, title card, counter) plus the .aep. Writes manifest.json and LEIA-ME.md. Each app is optional and reported on its own; the apps must be open. Slow (minutes): run it from jradb_code with background.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `kitPath` | string |  |  |
| `colors` | object |  |  |
| `fonts` | object |  |  |
| `apps` | `photoshop` · `indesign` · `illustrator` · `after-effects`[] |  | Default: all four. |
| `slug` | string |  | Folder name under templates/ (default: client folder of the kit, or 'neutro'). |
| `outputFolder` | string |  | Default <project>/templates/<slug>. |
| `allowLocalFonts` | boolean |  | AE: export .mogrt even with fonts not from Adobe Fonts (AE asks for an OK click). |

## `jradb_batch`

Run many operations on ONE Adobe app in a single round-trip and as a single undo step (After Effects undo group; one Photoshop history state). Each operation is {tool, args} using any ps_/ae_/pr_/ai_ tool name and exactly the args that tool accepts. All operations are validated before anything runs. Returns one result per operation. Illustrator and Premiere have no grouped undo: there each operation is its own undo step. Image tools (snapshots/previews) are not allowed inside a batch.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `app` | `photoshop` · `after-effects` · `premiere` · `illustrator` · `indesign` · `lightroom` | yes | Adobe app that runs every operation. |
| `operations` | object[] | yes |  |
| `stopOnError` | boolean |  | Stop at the first failing operation (default). false = run all and report each failure. Default: `true`. |
| `undoName` | string |  | Name of the undo step / history state. |
| `timeoutMs` | integer |  | Overall timeout; default grows with the number of operations. |

## `jradb_code`

Code mode: run an async JavaScript body that calls this MCP's tools and return only what you need. `await tools.<tool_name>(args)` calls any tool (args as in jradb_api; returns the parsed JSON). Helpers: log(...), show(i?) adds the last call's images to the answer, sleep(ms), readText/readJson/writeText/exists/mkdir/listDir(path), path.join/dirname/basename. End with `return {...}` (keep it small). Independent apps can run in parallel with Promise.all. A failed tool throws (catch it to continue). Long work: background: true returns a jobId at once; poll with { jobId }. Read jradb_api first for signatures.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `code` | string |  | Body of an async function. Example: const d = await tools.ps_audit_document({}); return d.verdict; |
| `background` | boolean |  | Return a jobId at once and run in the background (for work over ~60 s). |
| `jobId` | string |  | Poll a background script: its result, or 'running'. |
| `timeoutSeconds` | integer |  |  Default: `900`. |
| `maxResultChars` | integer |  |  Default: `6000`. |

## `jradb_api`

Signatures for jradb_code: with `tools`, each tool's arguments as TypeScript (with defaults and one-line notes); with `search` or `prefix` (ps_, ae_, pr_, ai_, id_, lr_, media_, jradb_), matching names with one line each.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `tools` | string[] |  | Exact names to describe in full. |
| `search` | string |  | Words to look for in names and descriptions. |
| `prefix` | string |  |  |

## `jradb_campaign_run`

Run a whole campaign from <campaignFolder>/00_briefing/plano-de-pecas.json (schema: skills/_shared/plano-de-pecas.schema.json) with kit-de-marca.json: each piece calls a recipe/tool (tipo → tool table), in production order and respecting 'depende', and the run STOPS at the approval points (conceito, arte-chave, video) until operation 'approve'. State is saved in 00_briefing/campanha-estado.json, so runs continue later. Operations: plan (validate, no app calls), run, approve, mark (a hand-made or redone piece), status, report (06_entrega/relatorio-campanha.md). Long: call from jradb_code with background, or with timeBudgetSeconds.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `campaignFolder` | string | yes | CLIENTE/ANO_CAMPANHA folder (has 00_briefing/). |
| `operation` | `plan` · `run` · `approve` · `mark` · `status` · `report` |  |  Default: `"plan"`. |
| `gate` | `conceito` · `arte-chave` · `video` |  | approve: which approval point. |
| `note` | string |  |  |
| `pieceId` | string |  | mark: piece id. |
| `status` | `feito` · `pendente` · `pulado` |  | mark: new status ('pendente' runs it again). |
| `only` | string[] |  | run: only these piece ids (dependencies must be done). |
| `timeBudgetSeconds` | integer |  | run: stop starting new pieces after this many seconds (default 600). |
| `retryFailed` | boolean |  | run: run failed pieces again. |
