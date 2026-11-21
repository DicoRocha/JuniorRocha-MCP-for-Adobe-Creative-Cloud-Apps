---
name: jrmcp-illustrator-vector
description: >-
  Specialized workflow and mathematical reference guide for controlling Adobe Illustrator via MCP (ai_* tools).
  Use this skill whenever the user asks to create vector illustrations, icons, logos, artboards, Bezier curves,
  typography, Pathfinder operations, SVG/PNG exports, or C++ SDK script messages in Adobe Illustrator.
---

# Adobe Illustrator Vector & Bezier Skill (`ai_*`)

## 1. CRITICAL: read the artboard rectangle before drawing
Illustrator scripting uses points with **Y growing upward**, and where the artboard sits in that space
depends on how the document was made:

| Document | Typical `artboardRect` `[left, top, right, bottom]` | Y inside the artboard |
|---|---|---|
| Created by a script (`ai_manage_document`, `operation: "create"`) | `[0, H, W, 0]` | positive, `H` at the top |
| Created or opened by the user in the app | `[0, 0, W, -H]` | negative, `0` at the top |

So never assume a sign. Call `ai_get_document_info` (or read `artboardRect` in the answer of
`ai_manage_document` create) and convert screen coordinates (origin top-left, Y down) with:

- **`aiX = abLeft + screenX`**
- **`aiY = abTop - screenY`**

This formula is correct in both cases. In `ai_create_shape`, `left = abLeft + screenX` and
`top = abTop - screenY` (the shape's top edge); `width` and `height` are always positive.

## 2. Tools
- **Document**: `ai_manage_document` (`operation: "create" | "open" | "save" | "close"`, `width`, `height`,
  `colorSpace`, `filePath`). Artboards: `ai_manage_artboards`. Layers: `ai_manage_layers`
  (`operation: "add" | "update" | "delete"`); new art goes to the active layer.
- **Shapes**: `ai_create_shape` with `shapeType: "rectangle" | "ellipse" | "polygon" | "star"`.
- **Bezier paths**: `ai_create_bezier_path` with `points: [{ anchor, leftDirection, rightDirection, pointType }]`.
  `leftDirection` is the incoming handle and `rightDirection` the outgoing one; both default to `anchor`
  (a corner). For a smooth point the two handles must be collinear through `anchor`.
  Circle and arc formulas (kappa `0.5522847498`) are in [bezier-and-menus.md](./references/bezier-and-menus.md).
- **Text**: `ai_create_text` (`contents`, `position: [x, y]`, `fontName`, `fontSize`, `fillColor`, `createOutlines`).
- **Colors**: `"#RRGGBB"` or `{ r, g, b }` with `0..255`.
- **Menu commands and actions**: `ai_execute_menu_or_action` with `menuCommand`, or `actionName` + `actionSet`.
- **Export**: `ai_export_assets` (`filePath`, `format: "svg" | "png" | "jpg"`).
- **Escape hatch**: `ai_execute_extendscript` (`code`): ES3 only. The value of the last expression is
  returned (a top-level `return` also works).

## 3. Verify
After drawing, call `ai_get_artboard_preview` and look at the image. If something is missing or
upside-down, re-read `artboardRect` and check the sign of your Y values.
Illustrator runs through the CEP panel or, with no panel, through Windows COM; a modal dialog in the app
blocks both.

## 4. Editing existing art, effects, styles (v1.2)
- `ai_find_objects` returns `uuid`, name, type, layer and `x/y/width/height` in **artboard coordinates
  (top-left origin, y down)**. Target later calls with `uuids` — names can repeat.
- `ai_modify_objects`: position, moveBy, size, scale, rotate, fill/stroke (works on groups, compound paths
  and text), opacity, blend mode, z-order, layer, hide/lock, delete. Returns the objects afterwards.
- `ai_apply_live_effect`: dropShadow, outerGlow, innerGlow, gaussianBlur, feather, offsetPath, roundCorners,
  roughen, zigZag, puckerBloat, twist, transform (repeat copies), warp, scribble, rasterize, outlineStroke —
  stays editable in the Appearance panel unless `expandAppearance: true`.
- `ai_apply_gradient` (linear/radial, 2+ stops), `ai_swatches`, `ai_graphic_style` (apply a complete look).
- `ai_align_distribute` (to selection, artboard or key object; even spacing or fixed `gap`) and
  `ai_pathfinder` (unite, minusFront, intersect, exclude, divide, trim, merge, crop, outline, minusBack).
