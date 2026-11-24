# Lightroom Classic

Finding photos, develop settings, presets, snapshots, collections and export.

[← All tools](README.md)

| Tool | What it does |
|---|---|
| [`lr_apply_look`](#lr_apply_look) | Apply a reference look (same as ps_recipe_look and pr_color): esportivo-dramatico, pb-papel-antigo, pb-vintage. |
| [`lr_read_legacy_preset`](#lr_read_legacy_preset) | Read an old Lightroom / Camera Raw preset (.xmp, .lrtemplate) and turn it into current Develop settings: process 2010 keys (Exposure+Brightness, Contrast, Recovery, Fill Light,… |
| [`lr_get_catalog_info`](#lr_get_catalog_info) | Lightroom Classic: catalog path, number of photos, current module, active sources (folders/collections) and the selected photos. |
| [`lr_find_photos`](#lr_find_photos) | Find photos in the Lightroom Classic catalog: from the selection, a folder, a collection or the whole catalog, filtered by file name, keyword, minimum rating, flag and colour… |
| [`lr_select_photos`](#lr_select_photos) | Select photos in Lightroom Classic (makes the first one the active photo). |
| [`lr_set_metadata`](#lr_set_metadata) | Set rating, flag, colour label, title, caption, copyright and add/remove keywords on photos (one undo step). |
| [`lr_get_develop_settings`](#lr_get_develop_settings) | Read the Develop settings of a photo (all, or only the listed keys). |
| [`lr_apply_develop_settings`](#lr_apply_develop_settings) | Apply Develop settings to photos without leaving the current module (non-destructive, one history step per photo). |
| [`lr_color`](#lr_color) | Colour panels of the Develop module by their own names (validated live on Lightroom Classic 16): the HSL / Color Mixer (hue, saturation, luminance per colour), Color Grading… |
| [`lr_tone_curve`](#lr_tone_curve) | Point tone curve (Develop > Tone Curve, point mode) for the composite RGB or one channel: named curves (linear, mediumContrast, strongContrast, fadedBlacks, matte,… |
| [`lr_photo_stats`](#lr_photo_stats) | Measure photos as developed: renders a small 8-bit TIFF of each (long edge 400 px, sRGB) and returns the luminance histogram, mean RGB/luminance, percentiles, % clipped… |
| [`lr_list_develop_presets`](#lr_list_develop_presets) | List Develop presets (built-in and user) by folder; search by words. |
| [`lr_apply_develop_preset`](#lr_apply_develop_preset) | Apply a Develop preset (exact name from lr_list_develop_presets) to photos. |
| [`lr_copy_develop_settings`](#lr_copy_develop_settings) | Copy the Develop settings of one photo to other photos (all settings, or only the listed keys) — like Sync. |
| [`lr_sync_settings_groups`](#lr_sync_settings_groups) | Sync named GROUPS of Develop settings from one photo to others (Lightroom Classic 16 settings groups) — the way to carry edits that have no parameter API. |
| [`lr_create_snapshot`](#lr_create_snapshot) | Create a named Develop snapshot on photos (a restorable state of the edit). |
| [`lr_auto_tone`](#lr_auto_tone) | Run Auto Tone on one photo (switches Lightroom to the Develop module with that photo) and return the resulting settings. |
| [`lr_masks`](#lr_masks) | Local masks on one photo (Develop module): create an AI mask (subject, people, sky, background, objects, landscape), a linear/radial gradient or a colour/luminance/depth range… |
| [`lr_collections`](#lr_collections) | Collections: list all, create one (optionally inside a collection set), add or remove photos, or list a collection's photos. |
| [`lr_import_photos`](#lr_import_photos) | Add image files to the catalog in place (no copy/move), optionally into a collection. |
| [`lr_export_photos`](#lr_export_photos) | Export photos (ids, selection or a collection) with their Develop edits: JPEG/TIFF/PSD/DNG/original, quality, long edge in pixels, colour space, output sharpening, metadata and… |
| [`lr_get_photo_preview`](#lr_get_photo_preview) | Visual check: a JPEG preview of a photo with its current Develop edits (default: the active photo). |
| [`lr_execute_lua`](#lr_execute_lua) | Lightroom Classic escape hatch: run Lua 5.1 code inside the plug-in with `catalog`, `import`, `json`, `write(name, fn)` (catalog write access as one undo step), `LrTasks`,… |
| [`lr_recipe_batch_develop`](#lr_recipe_batch_develop) | Recipe: develop a light group from one approved photo (fromId) or a preset, in one call. |
| [`lr_build_mask_presets`](#lr_build_mask_presets) | Writes Lightroom/Camera Raw Develop presets that carry an AI mask of ONE part of the person (teeth, facial skin, iris, eye white, lips, hair, eyebrows, body skin, clothes) or… |

## `lr_apply_look`

Apply a reference look (same as ps_recipe_look and pr_color): esportivo-dramatico, pb-papel-antigo, pb-vintage. Strength controls scaled by intensity (default 0.7); a snapshot is made on the photos first. Apply after the technical and tonal correction (foto-revelacao), then measure.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `look` | `esportivo-dramatico` · `pb-papel-antigo` · `pb-vintage` | yes |  |
| `intensity` | number |  |  Default: `0.7`. |
| `snapshotName` | string |  |  |
| `ids` | integer[] |  | Photo ids (localIdentifier) from lr_find_photos. |
| `useSelection` | boolean |  | Use the photos selected in Lightroom when no ids are given. Default: `true`. |

## `lr_read_legacy_preset`

Read an old Lightroom / Camera Raw preset (.xmp, .lrtemplate) and turn it into current Develop settings: process 2010 keys (Exposure+Brightness, Contrast, Recovery, Fill Light, Blacks, Clarity) translated to the current process, strength controls scaled by intensity (default 0.6: old presets were made for small files), halo-prone sharpening tamed. apply: true makes a snapshot on the photos first, then applies. The preset file is only read, never copied.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `filePath` | string | yes |  |
| `intensity` | number |  |  Default: `0.6`. |
| `apply` | boolean |  |  Default: `false`. |
| `snapshotName` | string |  |  Default: `"Antes do preset"`. |
| `ids` | integer[] |  | Photo ids (localIdentifier) from lr_find_photos. |
| `useSelection` | boolean |  | Use the photos selected in Lightroom when no ids are given. Default: `true`. |

## `lr_get_catalog_info`

Lightroom Classic: catalog path, number of photos, current module, active sources (folders/collections) and the selected photos.

No parameters.

## `lr_find_photos`

Find photos in the Lightroom Classic catalog: from the selection, a folder, a collection or the whole catalog, filtered by file name, keyword, minimum rating, flag and colour label. Returns id (localIdentifier), path, file name, rating, flag, label, size, capture date and keywords.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `source` | `selection` · `folder` · `collection` · `all` |  |  Default: `"selection"`. |
| `folderPath` | string |  | Absolute folder path for source 'folder'. |
| `includeSubfolders` | boolean |  |  Default: `true`. |
| `collection` | string |  | Collection name for source 'collection'. |
| `filenameContains` | string |  |  |
| `keyword` | string |  |  |
| `minRating` | integer |  |  |
| `pick` | `picked` · `rejected` · `unflagged` |  |  |
| `label` | `red` · `yellow` · `green` · `blue` · `purple` · `none` |  |  |
| `limit` | integer |  |  Default: `200`. |

## `lr_select_photos`

Select photos in Lightroom Classic (makes the first one the active photo).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `ids` | integer[] | yes |  |

## `lr_set_metadata`

Set rating, flag, colour label, title, caption, copyright and add/remove keywords on photos (one undo step).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `ids` | integer[] |  | Photo ids (localIdentifier) from lr_find_photos. |
| `useSelection` | boolean |  | Use the photos selected in Lightroom when no ids are given. Default: `true`. |
| `rating` | integer |  |  |
| `pick` | `picked` · `rejected` · `unflagged` |  |  |
| `label` | `red` · `yellow` · `green` · `blue` · `purple` · `none` |  |  |
| `title` | string |  |  |
| `caption` | string |  |  |
| `copyright` | string |  |  |
| `addKeywords` | string[] |  |  |
| `removeKeywords` | string[] |  |  |

## `lr_get_develop_settings`

Read the Develop settings of a photo (all, or only the listed keys).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `id` | integer |  | Photo id; default = active photo. |
| `keys` | string[] |  |  |

## `lr_apply_develop_settings`

Apply Develop settings to photos without leaving the current module (non-destructive, one history step per photo). Common keys: Exposure2012 (-5..5), Contrast2012, Highlights2012, Shadows2012, Whites2012, Blacks2012 (-100..100), Texture, Clarity2012, Dehaze, Vibrance, Saturation, Temperature (K), Tint, WhiteBalance ('As Shot'|'Auto'|'Custom'), ParametricShadows/Darks/Lights/Highlights, HueAdjustmentRed…, SaturationAdjustmentOrange…, LuminanceAdjustmentBlue…, ColorGradeShadowHue/Sat/Lum, ColorGradeMidtoneHue/Sat/Lum, ColorGradeHighlightHue/Sat/Lum, ColorGradeBlending, Sharpness, SharpenRadius, SharpenDetail, SharpenEdgeMasking, LuminanceSmoothing, ColorNoiseReduction, PostCropVignetteAmount/Midpoint/Feather/Roundness, GrainAmount/Size/Frequency, ConvertToGrayscale (true/false), CropTop/Left/Bottom/Right (0..1), CropAngle, LensProfileEnable (1), AutoLateralCA (1).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `ids` | integer[] |  | Photo ids (localIdentifier) from lr_find_photos. |
| `useSelection` | boolean |  | Use the photos selected in Lightroom when no ids are given. Default: `true`. |
| `settings` | object | yes | Develop key → value. |
| `historyName` | string |  |  Default: `"MCP"`. |

## `lr_color`

Colour panels of the Develop module by their own names (validated live on Lightroom Classic 16): the HSL / Color Mixer (hue, saturation, luminance per colour), Color Grading (shadows, midtones, highlights and global wheels, blending, balance) and Calibration (shadow tint and the red, green, blue primaries). Non-destructive; make a snapshot or a virtual copy first (lr_create_snapshot). Values: HSL and calibration -100..100; grading hue 0..360, saturation 0..100, luminance -100..100.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `ids` | integer[] |  | Photo ids (localIdentifier) from lr_find_photos. |
| `useSelection` | boolean |  | Use the photos selected in Lightroom when no ids are given. Default: `true`. |
| `hsl` | object |  | e.g. { orange: { saturation: -10, luminance: 8 }, blue: { hue: -5 } } |
| `colorGrading` | object |  |  |
| `calibration` | object |  |  |
| `historyName` | string |  |  Default: `"MCP Cor"`. |

## `lr_tone_curve`

Point tone curve (Develop > Tone Curve, point mode) for the composite RGB or one channel: named curves (linear, mediumContrast, strongContrast, fadedBlacks, matte, softHighlights, liftShadows) or your own points [[x,y], …] in 0–255 with increasing x. Make a snapshot or virtual copy first (lr_create_snapshot).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `ids` | integer[] |  | Photo ids (localIdentifier) from lr_find_photos. |
| `useSelection` | boolean |  | Use the photos selected in Lightroom when no ids are given. Default: `true`. |
| `curve` | `linear` · `mediumContrast` · `strongContrast` · `fadedBlacks` · `matte` · `softHighlights` · `liftShadows` |  |  |
| `points` | number[][] |  | [[x, y], …] in 0–255, x increasing. |
| `channel` | `rgb` · `red` · `green` · `blue` |  |  Default: `"rgb"`. |
| `historyName` | string |  |  Default: `"MCP Curva"`. |

## `lr_photo_stats`

Measure photos as developed: renders a small 8-bit TIFF of each (long edge 400 px, sRGB) and returns the luminance histogram, mean RGB/luminance, percentiles, % clipped highlights and crushed shadows, warmth (R−B in the mid-tones) and colourfulness — to check exposure and match a series objectively. Returns the first photo's histogram as an image.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `ids` | integer[] |  | Photo ids (localIdentifier) from lr_find_photos. |
| `useSelection` | boolean |  | Use the photos selected in Lightroom when no ids are given. Default: `true`. |
| `longEdge` | integer |  |  Default: `400`. |
| `bins` | integer |  |  Default: `32`. |
| `includeImageContent` | boolean |  |  Default: `true`. |

## `lr_list_develop_presets`

List Develop presets (built-in and user) by folder; search by words.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `search` | string |  |  |

## `lr_apply_develop_preset`

Apply a Develop preset (exact name from lr_list_develop_presets) to photos.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `ids` | integer[] |  | Photo ids (localIdentifier) from lr_find_photos. |
| `useSelection` | boolean |  | Use the photos selected in Lightroom when no ids are given. Default: `true`. |
| `presetName` | string | yes |  |
| `folder` | string |  | Preset folder, when names repeat. |

## `lr_copy_develop_settings`

Copy the Develop settings of one photo to other photos (all settings, or only the listed keys) — like Sync.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `fromId` | integer | yes |  |
| `ids` | integer[] |  | Photo ids (localIdentifier) from lr_find_photos. |
| `useSelection` | boolean |  | Use the photos selected in Lightroom when no ids are given. Default: `true`. |
| `keys` | string[] |  |  |

## `lr_sync_settings_groups`

Sync named GROUPS of Develop settings from one photo to others (Lightroom Classic 16 settings groups) — the way to carry edits that have no parameter API. Main use: AI Blemish Removal (Remove > Distraction Removal > Blemishes): apply it once on a reference photo, then sync group 'distractionRemovalBlemish' to the rest of the shoot. Other groups: distractionRemovalPeople, distractionRemovalReflections, distractionRemovalSensorDust, manualRemove, masking, crop, basic, color, detail, effects, lensBlur. Snapshot the targets first.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `fromId` | integer | yes |  |
| `ids` | integer[] |  | Photo ids (localIdentifier) from lr_find_photos. |
| `useSelection` | boolean |  | Use the photos selected in Lightroom when no ids are given. Default: `true`. |
| `groups` | string[] | yes | Group names from LrDevelopSettingsGroups. |

## `lr_create_snapshot`

Create a named Develop snapshot on photos (a restorable state of the edit).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `ids` | integer[] |  | Photo ids (localIdentifier) from lr_find_photos. |
| `useSelection` | boolean |  | Use the photos selected in Lightroom when no ids are given. Default: `true`. |
| `name` | string | yes |  |

## `lr_auto_tone`

Run Auto Tone on one photo (switches Lightroom to the Develop module with that photo) and return the resulting settings.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `id` | integer |  |  |

## `lr_masks`

Local masks on one photo (Develop module): create an AI mask (subject, people, sky, background, objects, landscape), a linear/radial gradient or a colour/luminance/depth range mask, and set its local sliders (Exposure, Temperature, Tint, Contrast, Highlights, Shadows, Whites, Blacks, Clarity, Dehaze, Texture, Saturation, Sharpness…); then list, adjust or delete masks. Work on a virtual copy or after lr_create_snapshot. AI masks take a few seconds.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `id` | integer |  | Photo id (default: the selected photo). |
| `operation` | `list` · `create` · `adjust` · `delete` |  |  Default: `"list"`. |
| `maskType` | `aiSelection` · `gradient` · `radialGradient` · `rangeMask` · `brush` |  | create: default aiSelection. |
| `maskSubtype` | `subject` · `people` · `sky` · `background` · `objects` · `landscape` · `color` · `luminance` · `depth` |  | aiSelection: subject/people/sky/background/objects/landscape; rangeMask: color/luminance/depth. For a person use 'subject' (tested): 'people' was not created through the SDK (Lightroom asks which detected person). |
| `invert` | boolean |  | create: invert the new mask (e.g. everything except the subject). |
| `adjustments` | object |  | Local sliders, e.g. { Exposure: 0.4, Temperature: 10, Clarity: 15 } (the 'local_' prefix is added). |
| `maskId` | string |  |  |
| `maskName` | string |  | e.g. 'Mask 1'. |
| `maskIndex` | integer |  |  |
| `waitSeconds` | number |  |  |

## `lr_collections`

Collections: list all, create one (optionally inside a collection set), add or remove photos, or list a collection's photos.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `operation` | `list` · `create` · `add` · `remove` · `photos` |  |  Default: `"list"`. |
| `name` | string |  |  |
| `parentSet` | string |  |  |
| `ids` | integer[] |  |  |

## `lr_import_photos`

Add image files to the catalog in place (no copy/move), optionally into a collection.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `paths` | string[] | yes |  |
| `collection` | string |  |  |

## `lr_export_photos`

Export photos (ids, selection or a collection) with their Develop edits: JPEG/TIFF/PSD/DNG/original, quality, long edge in pixels, colour space, output sharpening, metadata and naming collisions. Returns the exported file paths.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `ids` | integer[] |  | Photo ids (localIdentifier) from lr_find_photos. |
| `useSelection` | boolean |  | Use the photos selected in Lightroom when no ids are given. Default: `true`. |
| `collection` | string |  |  |
| `folder` | string | yes | Absolute destination folder. |
| `format` | `JPEG` · `TIFF` · `PSD` · `DNG` · `ORIGINAL` |  |  Default: `"JPEG"`. |
| `quality` | integer |  |  Default: `85`. |
| `longEdge` | integer |  | Resize so the long edge is this many pixels (no enlargement). |
| `colorSpace` | `sRGB` · `AdobeRGB` · `ProPhotoRGB` · `DisplayP3` |  |  Default: `"sRGB"`. |
| `sharpen` | `none` · `screen` · `matte` · `glossy` |  |  Default: `"screen"`. |
| `sharpenAmount` | `low` · `standard` · `high` |  |  Default: `"standard"`. |
| `metadata` | `all` · `copyrightOnly` · `copyrightAndContact` · `allExceptCameraInfo` |  |  Default: `"all"`. |
| `collision` | `rename` · `overwrite` · `skip` |  |  Default: `"rename"`. |
| `fileNames` | string[] |  | Output names without extension, one per photo in the order of ids (e.g. ['01_gespraech', '02_planung']). |

## `lr_get_photo_preview`

Visual check: a JPEG preview of a photo with its current Develop edits (default: the active photo). Falls back to a small export when Lightroom answers with no thumbnail or with a full-size placeholder (common right after Auto Tone or on a new virtual copy); method 'export' forces that path.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `id` | integer |  |  |
| `size` | integer |  |  Default: `800`. |
| `method` | `auto` · `export` |  |  Default: `"auto"`. |

## `lr_execute_lua`

Lightroom Classic escape hatch: run Lua 5.1 code inside the plug-in with `catalog`, `import`, `json`, `write(name, fn)` (catalog write access as one undo step), `LrTasks`, `LrApplication`, `LrDevelopController`, `LrPathUtils` and `LrFileUtils` in scope. `return` a JSON-serialisable value. Virtual copies: select photos, then `catalog:createVirtualCopies(name)` (outside write()).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `code` | string | yes |  |

## `lr_recipe_batch_develop`

Recipe: develop a light group from one approved photo (fromId) or a preset, in one call. 1) safety snapshot 'MCP antes do lote' on every target; 2) sync the reference's Develop settings WITHOUT crop, rotation, spot removal, masks or Upright (white balance optional); 3) measure every photo as developed and nudge Exposure so its median brightness matches the reference (two passes, ±1.5 EV max); 4) report before/after (median, clipped highlights, crushed shadows, warmth) and return a contact sheet of the series; 5) optional export. Undo per photo: restore the snapshot. Use it on one light group at a time (same place, same light).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `ids` | integer[] | yes | Target photo ids (lr_find_photos). The reference may be included; it is not changed. |
| `fromId` | integer |  | Approved reference photo. |
| `presetName` | string |  | Instead of fromId: a Develop preset (then exposure is matched to the group median). |
| `presetFolder` | string |  |  |
| `whiteBalance` | boolean |  | Sync white balance too (same light). false for mixed light. Default: `true`. |
| `excludeKeys` | string[] |  | Extra Develop keys not to sync. |
| `matchExposure` | boolean |  |  Default: `true`. |
| `measureRegion` | number[] |  | [x, y, width, height] as fractions of the frame: match the exposure on this region only (the backdrop, the skin) instead of the whole frame. Use it when the framing changes from photo to photo. |
| `maxEv` | number |  |  Default: `1.5`. |
| `snapshotName` | string |  |  |
| `exportFolder` | string |  | Export the finished group here (JPEG sRGB). |
| `exportLongEdge` | integer |  |  |
| `exportQuality` | integer |  |  Default: `85`. |
| `sheetColumns` | integer |  |  Default: `4`. |

## `lr_build_mask_presets`

Writes Lightroom/Camera Raw Develop presets that carry an AI mask of ONE part of the person (teeth, facial skin, iris, eye white, lips, hair, eyebrows, body skin, clothes) or of the background - parts the Lightroom SDK cannot select by itself. Lightroom recomputes the mask on each photo when the preset is applied (lr_apply_develop_preset). set='retrato' writes the house portrait set (teeth = the user's own recipe: saturation -39, temperature -7; the others are gentle starting values). install=true copies them into the Camera Raw presets folder; Lightroom must be restarted to list them. Slider units: exposure in stops, the rest -100..100.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `set` | `retrato` |  | Built-in set (combine with presets to add your own). |
| `presets` | object[] |  |  |
| `group` | string |  | Preset group shown in Lightroom (default 'MCP Mascaras'). |
| `outputFolder` | string |  | Where to write the .xmp files (default: <temp>/mcp_lr_mask_presets). |
| `install` | boolean |  | Also copy into the Camera Raw presets folder (sub-folder 'MCP'). Default: `false`. |
| `overwrite` | boolean |  | Replace an installed preset file of the same name. Default: `false`. |
