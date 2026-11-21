---
name: jrmcp-after-effects-motion
description: >-
  Specialized workflow and reference guide for controlling Adobe After Effects via MCP (ae_* tools).
  Use this skill whenever the user asks to create compositions, animate layers, build vector shape layers,
  set Bezier keyframes, write expressions, apply visual effects, or render compositions in After Effects.
---

# Adobe After Effects Motion Design Skill (`ae_*`)

## 1. Critical Rules
- **Colors are `[r, g, b]` floats from `0.0` to `1.0`** in every `ae_*` tool and in ExtendScript
  (white `[1, 1, 1]`, orange `#FF8000` = `[1, 0.5, 0]`). Never pass `0..255`.
- **Time is seconds. Layer and item indices are 1-based.**
- **Coordinates**: composition `[0, 0]` is top-left; a new layer sits at `[width/2, height/2]`.
  Shape-group contents are positioned relative to the layer's anchor point, so a shape at `[0, 0]`
  appears at the layer position (the comp center by default).
- **Targets**: tools take `compName` or `compIndex` (else the active comp) and `layerIndex` or `layerName`.
- **Property paths are arrays**, one segment per level, each a matchName, a display name or a 1-based index:
  `["Position"]`, `["ADBE Transform Group", "ADBE Scale"]`,
  `["ADBE Effect Parade", "ADBE Gaussian Blur 2", "ADBE Gaussian Blur 2-0001"]`.
  The aliases `Position`, `Scale`, `Rotation`, `Opacity`, `Anchor Point`, `Transform`, `Effects`, `Masks`,
  `Text`, `Source Text`, `Contents` always work.
- **Prefer matchNames over display names.** Display names ("Blurriness", "Glow Radius") are translated in
  non-English After Effects and then fail. Call `ae_get_property_tree` on the layer to read the exact
  matchNames, then use those. See [ae-matchnames.md](./references/ae-matchnames.md).
- **After Effects must be running.** Without the CEP panel (`Window > Extensions > Junior Rocha MCP`)
  commands go through `AfterFX.exe -r`, which needs *Settings > Scripting & Expressions > Allow Scripts to
  Write Files and Access Network* and is slower. Ask the user to open the panel for real work.

## 2. Motion Design Practice
1. **Ease your keyframes.** `ae_set_keyframes` takes
   `keyframes: [{ time, value, easing, influence }]` with
   `easing: "linear" | "hold" | "easeIn" | "easeOut" | "easeInOut" | "bezier"` and `influence` in percent.
   For a soft ease use `easing: "easeInOut", influence: 75`. Pass `clearExisting: true` to replace old keys.
2. **Expressions**: use `ae_set_expression` (`propertyPath`, `expression`); it returns `expressionError`
   so a broken expression is reported at once.
3. **Effects**: `ae_apply_effect` with `effectMatchNameOrName` (e.g. `"ADBE Gaussian Blur 2"`) and
   `properties: { "<matchName or name>": value }`.
4. **Shapes**: `ae_create_shape_layer` with `shapeType: "rectangle" | "ellipse" | "polystar" | "path"`,
   `fillColor`, `strokeColor`, `strokeWidth`, optional `trimPaths: { start, end, offset }`.
5. **Verify**: `ae_get_comp_frame_preview` with `time` (seconds) at a few moments of the animation, and
   look at the frames before reporting the work as done.

## 3. Escape hatches
- `ae_execute_extendscript` (`code`): ES3 only (`var`, plain `for` loops). It runs inside one undo group.
  The value of the last expression is returned (a top-level `return` also works).
- `ae_execute_menu_command`: prefer `commandId`; `commandName` is the menu text in the app's UI language.

## 4. Effects, presets, text animators, masks (v1.2)
1. `ae_list_effects` with words (`search: "glow"`, `category: "Blur"`) → use the returned **matchName**.
2. `ae_apply_effect` returns every parameter (name, matchName, value, min/max) and `ignoredProperties`.
   Animate a parameter with `ae_set_keyframes`, `propertyPath: ["ADBE Effect Parade", "<effect name>", "<parameter matchName>"]`.
3. Keyframe feel: `influenceIn` / `influenceOut` (0.1–100) and `speedIn` / `speedOut` per keyframe; `spatial`
   (`linear`, `autoBezier`, `continuous`) shapes the motion path; `roving` smooths middle keys. A strong
   "ease out" arrival = high `influenceIn` (75–90) on the last key.
4. `ae_list_presets` / `ae_apply_preset` apply any `.ffx` (built-in, User Presets or extra folders).
5. Text: `ae_add_text_animator` (e.g. reveal = `properties: { opacity: 0, position: [0, 40] }`,
   `selector: { basedOn: "characters", shape: "rampUp" }`, `animate: { property: "offset", from: -100, to: 100, duration: 1.2 }`).
6. `ae_add_mask` (rectangle / ellipse / path, mode, feather, expansion); `ae_modify_layer` now sets
   `blendMode`, `trackMatte` and `adjustmentLayer`.
7. Repetitive edits on many layers: `jradb_batch` with `app: "after-effects"` → a single undo group.
