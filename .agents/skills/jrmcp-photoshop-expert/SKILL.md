---
name: jrmcp-photoshop-expert
description: >-
  Specialized workflow and reference guide for controlling Adobe Photoshop via MCP (ps_* tools).
  Use this skill whenever the user asks to create, edit, retouch, mask, composite, style layers,
  or run batchPlay / UXP / ExtendScript actions in Adobe Photoshop.
---

# Adobe Photoshop Expert Skill (`ps_*`)

## 1. Coordinate System, Units & Colors
- **Origin `[0, 0]`**: top-left corner of the canvas (`X` right, `Y` down).
- **Units**: pixels. Font sizes are points.
- **Colors**: `"#RRGGBB"` or `{ "r": 0..255, "g": 0..255, "b": 0..255 }`.

## 2. Which bridge runs what
`jradb_get_status` lists the connected bridges. The router picks one automatically and retries on the next
when a bridge does not implement an action, so you normally do not choose. What matters is what is open:

| Open in Photoshop | What works |
|---|---|
| UXP panel (`Plugins > Junior Rocha MCP`) | Every `ps_*` tool. `ps_execute_extendscript` is passed on to CEP/COM. |
| Only the CEP panel, or nothing (Windows COM) | Everything except `ps_execute_uxp_script` and the `layerStyle` / `adjustmentLayer` categories of `ps_effects_and_adjustments`. `ps_batch_play`, `ps_adjustment_layer` and `ps_smart_object` work here too: actionJSON is converted to ActionDescriptor. |

If a call answers `ACTION_NOT_SUPPORTED`, ask the user to open the UXP panel instead of retrying.

## 3. Standard Workflow
1. **Document**: `ps_list_documents`, then `ps_create_document` or `ps_open_document` if none is open.
2. **Layers**: call `ps_get_layer_tree` before targeting a layer. Tools take `layerId` or `layerName`
   (exact match). With neither, the active layer is used. A named layer that does not exist is an error.
3. **Create**: `ps_create_layer` with `layerType: "pixel" | "group" | "text" | "solidColor"`.
   Text takes `text`, `font` (PostScript name, e.g. `"ArialMT"`), `fontSize`, `color`, `position: [x, y]`.
4. **Edit text**: `ps_edit_text_layer` (`text`, `font`, `fontSize`, `color`, `tracking`, `leading`, `alignment`).
5. **Transform / manage**: `ps_transform_and_manage_layer` with `operation`:
   `updateProperties | translate | scale | rotate | flipHorizontal | flipVertical | duplicate | delete | convertToSmartObject | rasterize`.
   `newName`, `visible`, `opacity`, `blendMode` can be combined with any operation.
6. **Selections and masks**: `ps_selection_and_masks` with `operation`:
   `rectangle | ellipse | polygon | selectAll | clear | invert | selectSubject | selectSky | removeBackground | addMaskFromSelection | deleteMask`.
   `bounds` for rectangle/ellipse, `points` for polygon, `feather` for those three.
7. **Effects**: `ps_effects_and_adjustments` with `category` + `type` + `settings`:
   - `filter`: `gaussianBlur`, `motionBlur`, `highPass`, `addNoise`, `unsharpMask`
   - `layerStyle`: `dropShadow`, `stroke`, `outerGlow` (replaces the styles already on the layer)
   - `adjustmentLayer`: `brightnessContrast`, `hueSaturation`, `vibrance`, `levels`, `curves`, `colorBalance`, `blackAndWhite`
   Anything else (Gradient Overlay, Smart Sharpen, Camera Raw, LUTs, curve points) goes through
   `ps_batch_play` with descriptors from [batchplay-cheatsheet.md](./references/batchplay-cheatsheet.md).
8. **Canvas**: `ps_modify_canvas` with `operation: crop | resizeImage | resizeCanvas | rotate | trim | flatten`.
   `resizeImage` with only `width` or only `height` keeps the aspect ratio.
9. **Verify**: call `ps_get_canvas_snapshot` (`maxDimension: 1024`) after layout or styling changes and look
   at the image before reporting the work as done.

## 4. Things that go wrong
- **batchPlay does not throw.** A failed descriptor comes back as `{ "_obj": "error", "message": ... }`.
  After `ps_batch_play`, read `errorCount` and the results.
- **Layer styles replace each other.** To combine a stroke and a shadow, send both in one `layerEffects`
  descriptor through `ps_batch_play`.
- **Modal dialogs block everything.** If a call times out, a dialog is probably open in Photoshop.
- **ExtendScript is ES3.** In `ps_execute_extendscript` use `var` and plain `for` loops. The value of the
  last expression is returned (a top-level `return` also works). `ps_execute_uxp_script` is modern JS
  with `async/await` and must `return` its result.

## 5. Filters, adjustments, Smart Objects and Actions (v1.2)
- **Non-destructive by default.** Prefer `ps_adjustment_layer` (levels, curves, brightnessContrast, hueSaturation,
  colorBalance, blackAndWhite, exposure, vibrance, photoFilter, channelMixer, colorLookup, invert, posterize,
  threshold, gradientMap, selectiveColor) over editing pixels. `clipToBelow: true` limits it to one layer.
  Exact `settings` fields: record the adjustment once with Alchemist or *Plugins > Development > Record Action Commands*.
- **Filters**: `ps_apply_filter` calls the DOM method by name with `args` in order, e.g.
  `{ filter: "applyGaussianBlur", args: [8] }`, `{ filter: "applyAddNoise", args: [4, "NoiseDistribution.GAUSSIAN", true] }`.
  For an editable Smart Filter run `ps_smart_object` `convert` first.
- **Smart Objects / mockups**: `ps_smart_object` `replaceContents` with an absolute `filePath` swaps the artwork.
- **Actions**: `ps_list_actions` then `ps_play_action` replays any recorded workflow of the user.
- **Menus**: `ps_menu_command` with a numeric `commandId` (recorded as `select menuItemClass`).
- **Many steps**: put them in `jradb_batch` (`app: "photoshop"`) → one history state, one Ctrl+Z.
