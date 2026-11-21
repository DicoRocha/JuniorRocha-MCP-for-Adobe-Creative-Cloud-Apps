# Known issues and open items

Last reviewed on 21 November 2026, version 1.9.3. Items are grouped by where they show up.

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
| `pr_clip_speed` | Slowing down a cut clip that has another clip right after it keeps its length, so the end of its content is cut off; speeding up is handled (the clip shortens and the next ones move up) |
| `ai_get_artboard_preview` | Once, with five apps working at the same time, the reply did not arrive (the PNG was written) and the call timed out after 70 s; not reproduced in three repeats, and the next command worked normally |
| `media_analyze_audio` | Reported 60 BPM for a 120 BPM pulse (half time); the onsets were right |
| Text creation in Photoshop and Illustrator | With the World-Ready text engine as the app preference, new point text is laid out to the left of the anchor. The tools do not force the composer or the alignment yet |
| Hub port | Fixed in the panels (31001 since 1.9.0; it was 3001, a port many development servers use). If another program holds it, no bridge connects |

## Platform

- **Windows** is the main tested platform.
- **macOS** was validated once; see [`MACOS.md`](MACOS.md) for what was and was not covered.
- The CEP panel package is a plain `.zip` unless Adobe's `ZXPSignCmd` is available when packaging; an unsigned
  `.zxp` is refused by extension installers. `SETUP` installs the panel by copying the folder, so no `.zxp` is
  needed for a normal install.
