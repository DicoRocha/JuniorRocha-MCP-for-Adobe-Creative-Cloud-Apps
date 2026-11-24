# Known issues and open items

Last reviewed on 23 November 2026, version 1.12.0. Items are grouped by where they show up.

## Not available through the server

| App | Feature | Reason |
|---|---|---|
| Illustrator | Opacity masks | No scripting access in Illustrator 31 |
| Illustrator | Arrowheads on strokes | No scripting access |
| Illustrator | The app's own Remove Background | No scripting access; `ai_recipe_pop_out` has Photoshop cut the photo out first |
| Photoshop | Pattern overlay layer style, Blur Gallery (iris blur) | Not implemented |
| Photoshop | Several copies of the same layer style on one layer | Applying a style of a type replaces the copies of that type; other types are kept |
| Premiere Pro | Adjustment layers, freeze frame | Not exposed by the scripting interfaces in use |
| Premiere Pro | Work area | Premiere Pro 27 ignores the setter; the tool reports `NOT_APPLIED` |
| Premiere Pro | Creating and styling native caption tracks, writing text into a `.mogrt` through UXP | Not exposed; captions are added as editable graphics instead |
| All | Features that spend generative credits (Generative Fill, Generative Expand, Text to Vector and similar) | Left out on purpose |

## Found during the macOS validation, to check on Windows too

| Tool | Observation |
|---|---|
| `ps_save_document` | After saving, the document is named `x.psd`; the earlier `documentName` no longer finds it |
| `pr_scene_edit_detection` | Found one of two hard cuts at medium sensitivity |
| `pr_clip_speed` | On some clips cut out of a longer source Premiere applies less speed than asked (150 % for 200 %). The tool keeps the content, reports the speed applied and adds a warning |
| `ai_get_artboard_preview` | Once, with five apps working at the same time, the reply did not arrive (the PNG was written) and the call timed out after 70 s; not reproduced in three repeats, and the next command worked normally |
| `media_analyze_audio` | Reported 60 BPM for a 120 BPM pulse (half time); the onsets were right |
| Text creation in Photoshop and Illustrator | With the World-Ready text engine as the app preference, new point text is laid out to the left of the anchor. The tools do not force the composer or the alignment yet |
| Hub port | Fixed in the panels (31001 since 1.9.0; it was 3001, a port many development servers use). If another program holds it, no bridge connects |

## New and fixed in 1.11.0 and 1.12.0 (23 November 2026), to confirm live

| Tool | Was | Now |
|---|---|---|
| `ae_render_queue` | The render ran inside After Effects and blocked it for the whole render (one froze and had to be restarted) | `engine: "auto"` (default) renders a saved, clean project with **aerender**, a separate After Effects process, and returns `renderJobId`; unsaved changes keep the render in the app with `engineNote` |
| `jradb_code` background jobs | A step over 60 s "timed out", the script threw and the render queued after it never started | Inside a background job each app call may wait as long as the job has left |
| All panels | A long script made the app look frozen with no sign of work | The panel shows "Executando: … · N s" while a command runs |
| `pr_export_frame_or_sequence` (sequence) | `exportAsMediaDirect` failed with "Unknown Error" | Falls back to Media Encoder by itself and returns `renderJobId` |
| `media_normalize_loudness` (new) | Loudness was fixed with hand-made ffmpeg commands that mapped streams by index | Two-pass EBU R128 (default -14 LUFS, -1.5 dBTP), streams mapped by type, original kept |
| `media_zone_report` (new) | — | Zone System report on L* (zones, clipping, key, midtone cast, zone map PNG) |
| `ps_organize_layers`, `ai_organize_objects`, `id_organize_objects` (new) | Files came out as flat stacks of layers | Groups by meaning (text on a shape, icon + text, lists, rows of buttons), plan first, stacking-safe; `ps_audit_document` warns `UNGROUPED_RELATED` |
| `pr_duplicate_sequence` (new) | Copies were made with scripts | Duplicates, renames, moves to a bin and activates |
| `media_build_captions` | Names were fixed by hand each time | `kitPath`: the kit's `termos`, `glossario` and client name fix the spelling |
| `ae_create_shape_layer` | The stroke was added under the fill (half its width hidden); trimming a filled outline trimmed the fill too | Stroke above the fill by default (`paintOrder`), stroke opacity and blend modes per paint, `trimTarget: "stroke"` draws on only the outline in the same layer; `ae_audit_motion` warns `SPLIT_FILL_STROKE` for a fill layer + outline layer of the same shape (blend-mode indices to confirm live) |
| `jradb_get_status`, panels | No word about new versions | A newer GitHub release is reported once a day at most, silent offline, never installed automatically (`JRADB_MCP_UPDATE_CHECK=off`) |

| Photoshop without a brush (new) | Dodge & burn and skin needed brush work the MCP cannot do | `ps_luminosity_masks`, `ps_recipe_zone_dodge_burn`, `ps_recipe_frequency_separation` (light, skin-tone mask), `ps_recipe_film_grain` (to confirm live: curves descriptor, Color Range skin tones) |
| Lightroom (new) | Old presets (process 2010, .lrtemplate) applied as they were, too strong on today's files | `lr_read_legacy_preset` translates and scales them (snapshot first); `lr_find_photos` returns `iso` for noise reduction by ISO (to confirm live: tone curve arrays through applyDevelopSettings) |
| Premiere (new) | Cuts clicked without audio fades; jump cuts in talking heads; looks typed by hand | `pr_apply_cut_plan` adds 2-frame Constant Power fades (`audioFadeFrames`) and `punchIn`; `pr_color` takes `look` + `intensity`; `pr_audit_timeline` lists `AUDIO_PEAKS` moments with `renderPath` (fades apply to every cut of that audio track) |

Still open: `ae_manage_project` save that took ~70 s once and reconnected the panel (not reproduced yet).

## Fixed in 1.10.0 (21 November 2026), to confirm live

| Tool | Was | Now |
|---|---|---|
| `ae_render_queue` | An existing output file opened "already exists. Overwrite?" and After Effects stopped until someone clicked | The file is removed before the render starts (`overwrite: false` refuses with `OUTPUT_EXISTS`); a long render is followed as a job |
| Any After Effects command that fails | Undo reverted only the last part when the command had imported footage, leaving a half-built comp; a second run then found two comps with the same name | Items created by the failed command are removed and listed in `leftoversRemoved` |
| `ps_recipe_remove_background`, `ps_recipe_pop_out`, `ps_recipe_product_shot` with `closeAfter` | The file was written but the tool answered "No active document" | The preview comes from the written file, or from the named document |
| All creating or changing tools | Could run without the craft skills | Blocked with `SKILLS_REQUIRED` until skills were looked up (`JRADB_MCP_SKILLS_GATE`) |

## Platform

- **Windows** is the main tested platform.
- **macOS** was validated once; see [`MACOS.md`](MACOS.md) for what was and was not covered.
- The CEP panel package is a plain `.zip` unless Adobe's `ZXPSignCmd` is available when packaging; an unsigned
  `.zxp` is refused by extension installers. `SETUP` installs the panel by copying the folder, so no `.zxp` is
  needed for a normal install.
