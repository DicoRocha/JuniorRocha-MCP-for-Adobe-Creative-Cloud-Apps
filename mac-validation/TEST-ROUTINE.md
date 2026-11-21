# macOS test routine

Work in order. Each test has a code to use in `RESULTS.md`. Write **Passed**, **Failed** (with the error message)
or **Not tested** (with the reason). Always use test documents.

The requests are suggestions of what to say to the assistant; the tool it should use is in parentheses.

## A. Installation

| Code | Test | Expected |
|---|---|---|
| M01 | `./SETUP.command` | The seven steps end with `exit=0` in the logs |
| M02 | Automated tests | `logs/1-test.log` shows every test passing |
| M03 | Bridges installed | `~/Library/Application Support/Adobe/CEP/extensions/com.jradbmcp.universal`, `…/Adobe/UXP/Plugins/External/com.jradbmcp.*` and `…/Adobe/Lightroom/Modules/JrAdbMcpBridge.lrplugin` exist |
| M04 | CEP debug mode | `defaults read com.adobe.CSXS.<N> PlayerDebugMode` returns `1` for the `N` used by the installed apps |
| M05 | The three `.ccx` files | Install through Creative Cloud with no error (note the error code if there is one) |
| M06 | `.mcpb` built on the Mac | Installs in Claude Desktop and the server shows up |
| M07 | `./ADD-TO-CLAUDE-DESKTOP.command` (alternative path, separate test) | Writes the entry to `claude_desktop_config.json` and keeps a backup |

## B. Server and detection

| Code | Test | Expected |
|---|---|---|
| M10 | "Check the status of my creative apps." (`jradb_get_status`) | Installed apps are listed as installed, with the right `.app` path |
| M11 | Same request with some apps open and others closed | "running" matches reality |
| M12 | "Open Illustrator." (`jradb_launch_app`) with the app closed | The app opens |
| M13 | Open an app passing a test file | The app opens with the file, without stopping at the start screen |

## C. Bridges connect on their own (no panel opened)

Close every app, open one at a time, **do not open a panel**, wait 30 seconds and ask for the status.

| Code | App | Bridge expected in the status |
|---|---|---|
| M20 | Photoshop | `photoshop:uxp` |
| M21 | Premiere Pro | `premiere:uxp` and `premiere:cep` |
| M22 | InDesign | `indesign:uxp` (and `indesign:cep` as the second path) |
| M23 | After Effects | `after-effects:cep` |
| M24 | Illustrator | `illustrator:cep` |
| M25 | Lightroom Classic | `lightroom:lua` |
| M26 | Names in the windows | Under Window, Extensions and under Plugins the panel is called **Junior Rocha MCP** |
| M27 | Invisible extension | No window of ours appears by itself or floats over the app |

If a bridge does not connect on its own: click once on the app window and ask again; then open the panel and use Reconnect. Note at which of the three moments it connected.


## D. On and off per app

| Code | Test | Expected |
|---|---|---|
| M30 | In the Illustrator panel, switch the MCP off for this app | Only the Illustrator bridge leaves the status; the others stay |
| M31 | Switch it on again | The bridge is back within seconds |
| M32 | Switch off, close and reopen the app | It stays off until switched on |
| M33 | Same test in a UXP panel (Photoshop or InDesign) | Same; the file `~/.jr-adb-mcp-bridge/bridge-state-<app>.json` is created |

## E. No bridge: direct scripting through AppleScript

Switch the app's bridge off (test D) or remove the plug-in, and run a read command.

| Code | App | Request | Expected |
|---|---|---|---|
| M40 | Photoshop | "List the open Photoshop documents." (`ps_list_documents`) | Answers; macOS may ask for Automation permission the first time |
| M41 | Illustrator | "Illustrator document info." (`ai_get_document_info`) | Answers |
| M42 | InDesign | "InDesign document info." (`id_get_document_info`) | Answers |
| M43 | After Effects | "After Effects project info." (`ae_get_project_info`) | Answers |
| M44 | Any | Text with accents and quotes in a script (`*_execute_extendscript`) | The text reaches the app and comes back unchanged |

## F. Photoshop

| Code | Request | Expected |
|---|---|---|
| M50 | "Create a 1080×1350 test document with a purple background and the text 'Olá, São Paulo'." | Document created; accents correct |
| M51 | "Add a rounded rectangle and a drop shadow." (runs in ExtendScript through the hybrid mode) | Works with only the UXP plug-in |
| M52 | "Add a clarity adjustment layer at 30 and a grain adjustment layer." (`ps_adjustment_layer`) | Both layers appear (Photoshop 27.4 or newer) |
| M53 | "Show me a preview." (`ps_get_canvas_snapshot`) | The image comes back to the chat |
| M54 | "Save as PSD and export a PNG to a new folder on the Desktop." | Folder created, two files on disk, no dialog |
| M55 | "Build a post and a story from this document." (`ps_recipe_social_set`) | Two formats produced |
| M56 | "Add a stroke, a drop shadow, a bevel and an inner shadow to this layer." (`ps_effects_and_adjustments`, one call per style) | The four styles stay together on the layer (the answer lists `styles`); `PS_UXP_ERROR` must not come back |
| M56b | With two shapes in a group: "Add a stroke and a drop shadow to the group." (`layerName` = the group's name) | Both styles sit on the group and apply to the set |
| M56c | With Photoshop on the start screen (no document open): "Create a test document." | Document created with no error |
| M56d | With a portrait open: "Make the out-of-bounds effect with a circle." (`ps_recipe_pop_out`) | New document `<name>_popout` with the Pop-out group (Subject top, Subject clipped, Shape); the head leaves the circle; the original is unchanged |
| M56e | In a layout with several layers: "Make the out-of-bounds effect on the photo layer, in this document." (`ps_recipe_pop_out` with `layerName`) | The Pop-out group takes the layer's place; the other layers are unchanged |
| M57 | "Select a rectangle, expand it by 10 px and feather 5 px." (`ps_selection_and_masks`) | Selection changed; same hybrid path as M56 |
| M58 | "Add a 3×3 guide layout with 40 px margins." (`ps_guides`) | Guides created |
| M59 | "Apply Camera Raw: exposure +0.3, contrast 15, vibrance 20." (`ps_camera_raw_filter`) | Filter applied without opening the Camera Raw window |

## G. InDesign (hybrid UXP plug-in)

| Code | Request | Expected |
|---|---|---|
| M60 | "Create an A5 test document." | Created through the `uxp` bridge (the result names the bridge) |
| M61 | "Add a text frame with 'Olá do InDesign — ação' at 24 pt." (`id_create_text_frame`) | Accents correct; **one** step in Edit, Undo |
| M62 | Invalid request (a frame with no width) | Clear error, nothing created |
| M63 | "Page preview." (`id_get_page_preview`) | The image comes back |
| M64 | "Export a PDF with bleed to the Desktop." (`id_export`) | PDF on disk, no dialog |
| M65 | "Run a preflight." (`id_preflight`) | Report |
| M66 | "Make an A5 flyer with this text." (`id_recipe_flyer`) | Piece laid out with styles |
| M67 | "Wrap the text around this box with 3 mm offset." (`id_text_wrap`) | Text runs around the box |
| M68 | "Give the second paragraph a 3-line drop cap and add a right tab with dot leader." (`id_paragraph_options`) | Drop cap and tab applied |
| M69 | "Add a QR code for https://example.com." (`id_qr_code`) and "Anchor this box inside the text." (`id_anchor_object`) | QR code created; object anchored |

## H. Illustrator

| Code | Request | Expected |
|---|---|---|
| M70 | "New 800×600 document with a circle and a star, then unite them." | Shapes created and united |
| M71 | "Artboard preview." | The image comes back |
| M72 | "Export SVG and PNG to a new folder." | Files on disk, no alert to click |
| M73 | Open an `.ai` with a missing font or a reinterpreted PDF | No alert blocks the app |
| M74 | "Clip the artwork with the ellipse." (`ai_mask`, `clip`) | Clipping mask created |
| M75 | "Make this line dashed 12/6 with round caps." (`ai_stroke`) | Dashed stroke |
| M76 | "Create a paragraph style 'Titulo' at 40 pt centered and apply it to the text." (`ai_text_styles`) | Style created and applied |
| M77 | "Trace this placed photo and expand it." (`ai_image_trace`) | Vector produced, no dialog |
| M78 | With a document open: "Place this portrait and make the out-of-bounds effect with a circle and an outline." (`ai_recipe_pop_out`, JPEG photo) | Photoshop cuts the photo out and saves a trimmed PNG; Illustrator ends with the clip groups Subject top and Subject and the shape with fill and outline; **the app does not freeze when the preview is made** |

## I. After Effects

| Code | Request | Expected |
|---|---|---|
| M80 | "New 1080×1920 comp, 5 s, with a title that fades in with easing." | Comp created, keyframes eased |
| M81 | "Frame preview at 1 s." | The image comes back |
| M82 | "Add a paper transition between two solids." (`ae_paper_transition`) | Transition created |
| M83 | "Import this logo as shape layers." with a PDF-compatible `.ai` | Shape layers |
| M84 | The same with an `.ai` saved without PDF compatibility | Error explaining what to do; the warning page is not imported |
| M85 | "Render the comp to the Desktop." (`ae_render_queue`) | File on disk |
| M86 | "Freeze the video layer at 1 s." and "Slow it to half speed with frame blending." (`ae_time_remap`) | Time remapping on, keyframes created |

## J. Premiere Pro

Open a test project and lock the server to it: "Lock Premiere to this project." (`pr_expect_project`).

| Code | Request | Expected |
|---|---|---|
| M90 | "Create a sequence called teste_mac." (`pr_create_sequence`) | Created in under 2 seconds, **without the New Sequence window** |
| M91 | "Import this video and make a sequence from it." | Sequence in the clip's format |
| M92 | "Which transcription languages are installed?" (`pr_native_transcript`, `languages`) | List of the installed ones |
| M93 | "Transcribe this clip in Portuguese and show the lines." | Text in Portuguese with times |
| M94 | "Find the cuts in this video and split it." (`pr_scene_edit_detection`, `cuts`) on a video with cuts | The clip is split at the cuts |
| M95 | "Add captions from this SRT as graphics." (`pr_captions_as_mogrt`) | One graphic per line, with the built-in template |
| M96 | "Export a frame at 1 s." | The image comes back |
| M97 | "Export the sequence to the Desktop." | File on disk |
| M98 | With another project active, any write command | Refused with `PROJECT_MISMATCH`, nothing changed |
| M99 | "Set in/out to 1–3 s, add one video track, label the clip, add Lumetri exposure +0.4, and make the clip 200% speed." (`pr_sequence_points`, `pr_label_items`, `pr_color`, `pr_clip_speed`) | Each step answers with the values applied; the clip ends at half its duration |

## K. Lightroom Classic

| Code | Request | Expected |
|---|---|---|
| M100 | "Catalog info." (`lr_get_catalog_info`) | Answers |
| M101 | On a test photo: "Create a snapshot, then warm the white balance and add contrast." | Snapshot created before the change |
| M102 | "Photo preview." | The image comes back |
| M103 | "Export this photo as JPEG to the Desktop." | File on disk |
| M104 | On a virtual copy with a snapshot: "Orange saturation +20, midtone grading hue 40 sat 12, blue primary saturation +15." (`lr_color`) | The values read back match; restore afterwards |

## L. Between apps, and media

| Code | Request | Expected |
|---|---|---|
| M110 | "Take the active Illustrator artwork into After Effects." (`jradb_bridge_transfer`) | The artwork arrives in After Effects |
| M111 | "Detect the beats of this music file." (media tool; other formats than WAV need `ffmpeg`) | List of beats, or a clear error asking for `ffmpeg` |
| M112 | "Transcribe this audio file." (the server's own transcription) | Downloads the model the first time and transcribes |

## M. Difficult paths

| Code | Test | Expected |
|---|---|---|
| M120 | Save and export to a folder with spaces and accents (`~/Desktop/Teste Ação/`) | Works |
| M121 | Project installed in a path with spaces | `SETUP.command` and the server work |
| M122 | File on an external volume or iCloud Drive | Works, or a clear error |

## When you finish

Close only the test documents that were created. Fill in `mac-validation/RESULTS.md` inside the project folder and
run `./PACK-RESULTS.command`: it writes the zip to send back to the Desktop (results, logs, environment and the
project without `node_modules`). Do this even if the validation stopped halfway.
