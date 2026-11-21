# Known issues and open items

Last reviewed on 21 November 2026, version 1.10.0. Items are grouped by where they show up.

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
