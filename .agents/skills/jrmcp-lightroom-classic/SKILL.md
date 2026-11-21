---
name: jrmcp-lightroom-classic
description: Photo editing, culling, organising and export in Adobe Lightroom Classic through the lr_* tools — find and rate photos, keywords, Develop settings and presets, sync, snapshots, collections, import and export. Use for batch colour grading, culling sessions, client deliveries and catalogue clean-up.
---

# Adobe Lightroom Classic Skill (`lr_*`)

## 1. Critical rules
- **Bridge**: a Lua plug-in that starts with Lightroom and long-polls the MCP Hub. If `lr_*` answers BRIDGE_NOT_CONNECTED,
  ask the user to open Lightroom Classic (or `Library > Plug-in Extras > Iniciar ponte MCP`). There is no COM fallback.
- **Photos are addressed by `id`** (the catalog `localIdentifier`) from `lr_find_photos` / `lr_get_catalog_info`.
  Without `ids` the tools act on the current selection (or the whole filmstrip when nothing is selected — check first).
- **Everything is non-destructive.** Develop changes are history steps; each tool call that writes is one Edit > Undo.
  Before a big batch edit, `lr_create_snapshot` (e.g. "antes MCP") so the user can go back per photo.
- **No module switching.** `lr_apply_develop_settings` / presets / copy work from any module and never switch.
  Only `lr_auto_tone` jumps to Develop (it needs the Develop controller).
- **Look at the result**: `lr_get_photo_preview` after any visible edit, at 800–1200 px.

## 2. Develop keys (Process Version 2012+)
| Panel | Keys | Range |
|---|---|---|
| Basic | `Exposure2012` | −5..+5 (stops) |
| Basic | `Contrast2012`, `Highlights2012`, `Shadows2012`, `Whites2012`, `Blacks2012` | −100..+100 |
| Presence | `Texture`, `Clarity2012`, `Dehaze`, `Vibrance`, `Saturation` | −100..+100 |
| White balance | `WhiteBalance` (`"As Shot"`, `"Auto"`, `"Custom"`), `Temperature` (K, raw) / `IncrementalTemperature` (JPEG), `Tint` | |
| Tone curve | `ParametricShadows`, `ParametricDarks`, `ParametricLights`, `ParametricHighlights` | −100..+100 |
| HSL | `HueAdjustmentRed`…`Magenta`, `SaturationAdjustment…`, `LuminanceAdjustment…` (Red Orange Yellow Green Aqua Blue Purple Magenta) | −100..+100 |
| Color grading | `ColorGradeShadowHue/Sat/Lum`, `ColorGradeMidtoneHue/Sat/Lum`, `ColorGradeHighlightHue/Sat/Lum`, `ColorGradeGlobalHue/Sat/Lum`, `ColorGradeBlending`, `ColorGradeBalance` | Hue 0..359, Sat 0..100 |
| B&W | `ConvertToGrayscale: true`, then `GrayMixerRed`…`GrayMixerMagenta` | −100..+100 |
| Detail | `Sharpness` (0..150), `SharpenRadius` (0.5..3), `SharpenDetail`, `SharpenEdgeMasking`, `LuminanceSmoothing`, `ColorNoiseReduction` | |
| Lens | `LensProfileEnable: 1`, `AutoLateralCA: 1`, `LensManualDistortionAmount` | |
| Effects | `PostCropVignetteAmount` (−100..100), `PostCropVignetteMidpoint/Feather/Roundness`, `GrainAmount/Size/Frequency` | |
| Crop | `CropLeft/Top/Right/Bottom` (0..1 of the image), `CropAngle` (−45..45), `HasCrop: true` | |

Unknown key? `lr_get_develop_settings` on a photo the user edited by hand shows the exact names and current values.

## 3. Recipes
- **Cull a shoot**: `lr_find_photos source:"folder"` → look at a few with `lr_get_photo_preview` → `lr_set_metadata`
  `pick: "rejected"` / `rating` / `label` → `lr_collections create` "Selecionadas" with the picks.
- **Consistent look across a set**: edit ONE hero photo (settings or preset) → preview → `lr_copy_develop_settings
  fromId: <hero>` to the others with `keys` limited to the look (Basic, HSL, ColorGrade, Effects) — leave out
  `WhiteBalance`/`Temperature`/`Tint`, `Crop*` and `Exposure2012` when lighting differs between shots.
- **Preset first, then tweak**: `lr_list_develop_presets search:"..."` (names are localized and per install) →
  `lr_apply_develop_preset` → small `lr_apply_develop_settings` corrections.
- **Client delivery**: `lr_export_photos format:"JPEG" quality:85 longEdge:2048 colorSpace:"sRGB" sharpen:"screen"`
  for web/social; print `format:"TIFF" colorSpace:"AdobeRGB" sharpen:"matte"|"glossy"`; archive `format:"ORIGINAL"`.
  The tool returns the exported paths; nothing is re-imported.
- **Bring files in**: `lr_import_photos` adds files **in place** (no copy/move), optionally into a collection.
- **Many small edits in one round-trip**: `jradb_batch app:"lightroom"` (each operation stays its own undo step).
- **Anything else** (keywords hierarchy, smart collections, virtual copies, metadata presets): `lr_execute_lua` with the
  Lightroom SDK — `catalog`, `import`, `json`, `write(name, fn)` are in scope; wrap catalog changes in `write(...)`;
  `return` plain tables/strings/numbers.

## 4. Pitfalls
- `Temperature` only works on raw files; on JPEG/TIFF use `IncrementalTemperature` / `IncrementalTint`.
- Preset and collection names follow the user's language ("Preto e branco", not "B&W").
- A photo in a collection is the same photo: editing it changes it everywhere. For alternatives ask the user for a
  virtual copy (Photo > Create Virtual Copy, Ctrl+') or use snapshots.
- Exports with `collision:"overwrite"` replace files in the folder — use the default `rename` unless asked.
