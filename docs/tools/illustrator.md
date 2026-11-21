# Illustrator

Shapes, paths, pathfinder, gradients, live effects, swatches, artboards and export.

[← All tools](README.md)

| Tool | What it does |
|---|---|
| [`ai_get_document_info`](#ai_get_document_info) | Retrieve active Adobe Illustrator document metadata, dimensions, color space, artboards, layers, and page item counts. |
| [`ai_manage_document`](#ai_manage_document) | Create, open, save, save-as, or close an Adobe Illustrator document (.ai, .svg, .eps, .pdf). |
| [`ai_manage_artboards`](#ai_manage_artboards) | Add, activate, or remove artboards in the active Illustrator document. |
| [`ai_manage_layers`](#ai_manage_layers) | Add, rename, toggle visibility/lock, or delete layers in the active Illustrator document. |
| [`ai_create_shape`](#ai_create_shape) | Create vector primitive shapes (rectangle, rounded rectangle, ellipse, polygon, star) in Illustrator with fill and stroke styling. |
| [`ai_create_bezier_path`](#ai_create_bezier_path) | Draw custom precision vector paths and Bezier curves in Illustrator by specifying anchor points and left/right control handles. |
| [`ai_create_text`](#ai_create_text) | Create a typography TextFrame in Illustrator, configure font/size/color, and optionally convert text to vector outlines (`createOutlines`). |
| [`ai_text_on_path`](#ai_text_on_path) | Text on a circular arc for seals, badges and stamps: 'text' runs over the top of the circle (outside), 'bottomText' under it, upright, in the same ring; both centred and… |
| [`ai_get_artboard_preview`](#ai_get_artboard_preview) | Multimodal Visual Feedback: Export the active Illustrator artboard as a PNG24 preview and return it as inline base64 ImageContent so the AI can visually inspect the vector artwork. |
| [`ai_batch_variants`](#ai_batch_variants) | Variations from a spreadsheet (Illustrator's answer to data-driven graphics): in an open template, page items are named after the data columns — text frames get the text,… |
| [`ai_export_assets`](#ai_export_assets) | Export one Illustrator artboard to SVG, PNG24, or JPEG (scale in % for PNG/JPEG, e.g. |
| [`ai_center_text_in_shape`](#ai_center_text_in_shape) | Centres a text frame inside a shape (button, pill, tag) by the CAP HEIGHT of the text, which is how the eye reads it: the bounding box of a line with descenders or accents sits… |
| [`ai_export_artboards`](#ai_export_artboards) | Export for Screens (File > Export > Export for Screens): every artboard, or a range, in ONE call — one file per artboard, named after the artboard. |
| [`ai_find_objects`](#ai_find_objects) | Find existing objects in the active Illustrator document by name, type or layer. |
| [`ai_modify_objects`](#ai_modify_objects) | Edit existing Illustrator objects (by uuid, name, layer or current selection): move to an artboard position, move by an offset, resize, scale, rotate, fill/stroke colour and… |
| [`ai_apply_live_effect`](#ai_apply_live_effect) | Apply a non-destructive Illustrator Live Effect (Effect menu) to objects: dropShadow (offsetX=7, offsetY=7 (pt), blur=5, opacity=0.75 (0-1), color='#000000',… |
| [`ai_graphic_style`](#ai_graphic_style) | List the document's Graphic Styles, or apply / merge one onto objects. |
| [`ai_swatches`](#ai_swatches) | List the document's swatches (with RGB/CMYK values) or add a new RGB swatch. |
| [`ai_apply_gradient`](#ai_apply_gradient) | Create a linear or radial gradient (2+ colour stops) and fill objects with it. |
| [`ai_align_distribute`](#ai_align_distribute) | Align objects (left, centerH, right, top, centerV, bottom) to their combined bounds, the artboard or the first (key) object, and/or distribute them evenly — by centres, or with… |
| [`ai_mask`](#ai_mask) | Clipping masks: 'clip' turns the top object of the set into the mask shape and clips the objects below it (the result is a clipped group); 'releaseClip' undoes it. |
| [`ai_stroke`](#ai_stroke) | Stroke settings of paths (groups and compound paths are entered): dashed line (dashes: [dash, gap, ...] in points), caps, joins, miter limit, width and colour. |
| [`ai_image_trace`](#ai_image_trace) | Image Trace: turn a placed or embedded image (or an image file, placed for you) into vector paths. |
| [`ai_text_styles`](#ai_text_styles) | Paragraph and character styles of the document: list, create, update (attributes and/or newName), apply to text objects, or remove. |
| [`ai_pathfinder`](#ai_pathfinder) | Combine shapes with Pathfinder: unite, minusFront, intersect, exclude, divide, trim, merge, crop, outline, minusBack. |
| [`ai_execute_menu_or_action`](#ai_execute_menu_or_action) | Execute any Illustrator menu command string (`app.executeMenuCommand`, e.g. |
| [`ai_send_cpp_script_message`](#ai_send_cpp_script_message) | Native C++ SDK Bridge (`AIScriptMessageSuite` from Adobe Illustrator 2026 SDK): Send a message selector and JSON/string payload via `app.sendScriptMessage(pluginName, selector,… |
| [`ai_execute_extendscript`](#ai_execute_extendscript) | Illustrator ExtendScript escape hatch: execute arbitrary .jsx ExtendScript code in Adobe Illustrator (works via CEP WebSocket or zero-plugin Windows COM DoJavaScript). |
| [`ai_recipe_logo_package`](#ai_recipe_logo_package) | Recipe: logo delivery package from the OPEN Illustrator document (approved logo on one artboard; an artboard named 'simbolo'/'icone'/'symbol' is used for the square marks). |
| [`ai_recipe_pop_out`](#ai_recipe_pop_out) | Recipe: 'out of bounds' / pop-out portrait built with clipping masks in the OPEN Illustrator document (also asked for as: person coming out of a circle, breaking the frame). |

## `ai_get_document_info`

Retrieve active Adobe Illustrator document metadata, dimensions, color space, artboards, layers, and page item counts.

No parameters.

## `ai_manage_document`

Create, open, save, save-as, or close an Adobe Illustrator document (.ai, .svg, .eps, .pdf).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `operation` | `create` · `open` · `save` · `close` |  |  Default: `"create"`. |
| `title` | string |  |  Default: `"Untitled-MCP"`. |
| `width` | number |  | Width in points/pixels. Default: `1920`. |
| `height` | number |  | Height in points/pixels. Default: `1080`. |
| `colorSpace` | `RGB` · `CMYK` |  |  Default: `"RGB"`. |
| `numArtboards` | integer |  |  Default: `1`. |
| `filePath` | string |  | File path for open or save. |
| `saveChanges` | boolean |  | Save changes when operation='close'. Default: `false`. |

## `ai_manage_artboards`

Add, activate, or remove artboards in the active Illustrator document.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `operation` | `add` · `setActive` · `remove` |  |  Default: `"add"`. |
| `name` | string |  |  |
| `index` | integer |  | 0-based artboard index. |
| `rect` | number[] |  | Illustrator artboard rectangle [left, top, right, bottom] where top > bottom (e.g. [0, 1080, 1920, 0]). |

## `ai_manage_layers`

Add, rename, toggle visibility/lock, or delete layers in the active Illustrator document.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `operation` | `add` · `update` · `delete` |  |  Default: `"add"`. |
| `layerIndex` | integer |  |  |
| `layerName` | string |  |  |
| `name` | string |  | Name when adding a layer. |
| `newName` | string |  |  |
| `visible` | boolean |  |  |
| `locked` | boolean |  |  |

## `ai_create_shape`

Create vector primitive shapes (rectangle, rounded rectangle, ellipse, polygon, star) in Illustrator with fill and stroke styling.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `shapeType` | `rectangle` · `ellipse` · `polygon` · `star` |  |  Default: `"rectangle"`. |
| `name` | string |  |  |
| `top` | number |  | Top Y coordinate (Illustrator artboard coordinates). Default: `700`. |
| `left` | number |  | Left X coordinate. Default: `100`. |
| `width` | number |  |  Default: `300`. |
| `height` | number |  |  Default: `300`. |
| `cornerRadius` | number |  |  |
| `radius` | number |  | Polygon radius. |
| `sides` | integer |  |  Default: `6`. |
| `outerRadius` | number |  |  |
| `innerRadius` | number |  |  |
| `points` | integer |  |  Default: `5`. |
| `fillColor` | string or object |  | RGB color as hex string ('#RRGGBB') or { r, g, b } (0-255). |
| `filled` | boolean |  |  Default: `true`. |
| `strokeColor` | any |  | RGB color as hex string ('#RRGGBB') or { r, g, b } (0-255). |
| `strokeWidth` | number |  |  |
| `stroked` | boolean |  |  |
| `opacity` | number |  |  Default: `100`. |

## `ai_create_bezier_path`

Draw custom precision vector paths and Bezier curves in Illustrator by specifying anchor points and left/right control handles.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `name` | string |  |  |
| `closed` | boolean |  |  Default: `true`. |
| `points` | object[] | yes |  |
| `fillColor` | string or object |  | RGB color as hex string ('#RRGGBB') or { r, g, b } (0-255). |
| `strokeColor` | any |  | RGB color as hex string ('#RRGGBB') or { r, g, b } (0-255). |
| `strokeWidth` | number |  |  |

## `ai_create_text`

Create a typography TextFrame in Illustrator, configure font/size/color, and optionally convert text to vector outlines (`createOutlines`).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `contents` | string | yes | Text string to render. |
| `position` | number[] |  | [x, y] coordinate. Default: `[100,600]`. |
| `name` | string |  |  |
| `fontSize` | number |  |  Default: `48`. |
| `fontName` | string |  | PostScript font name (e.g. 'ArialMT'). |
| `fillColor` | string or object |  | RGB color as hex string ('#RRGGBB') or { r, g, b } (0-255). |
| `createOutlines` | boolean |  | Convert text frame into editable vector paths. Default: `false`. |

## `ai_text_on_path`

Text on a circular arc for seals, badges and stamps: 'text' runs over the top of the circle (outside), 'bottomText' under it, upright, in the same ring; both centred and editable on their paths. Default centre: the active artboard; coordinates as in ai_create_text. Optional outlines.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `text` | string |  |  |
| `bottomText` | string |  |  |
| `center` | number[] |  | [x, y]; default: centre of the active artboard. |
| `radius` | number |  | Baseline radius of the top text (default 35 % of the artboard). |
| `arcDegrees` | number |  | Arc span each text may use (default 160). |
| `fontSize` | number |  |  |
| `fontName` | string |  | PostScript name. |
| `fillColor` | string or object |  | RGB color as hex string ('#RRGGBB') or { r, g, b } (0-255). |
| `tracking` | number |  | Letter spacing in 1/1000 em (seals usually 50–200). |
| `name` | string |  | Prefix for the item names (default 'Selo'). |
| `createOutlines` | boolean |  |  |

## `ai_get_artboard_preview`

Multimodal Visual Feedback: Export the active Illustrator artboard as a PNG24 preview and return it as inline base64 ImageContent so the AI can visually inspect the vector artwork.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `outputPath` | string |  |  |
| `artboardIndex` | integer |  | 0-based artboard to preview (default: the active artboard). |
| `scale` | number |  | Export scale percentage (default 100%). Default: `100`. |
| `transparency` | boolean |  |  Default: `true`. |
| `includeImageContent` | boolean |  |  Default: `true`. |

## `ai_batch_variants`

Variations from a spreadsheet (Illustrator's answer to data-driven graphics): in an open template, page items are named after the data columns — text frames get the text, placed images are relinked to the file in the cell (fitted into the original frame), a '#RRGGBB' cell recolours a path, 'hide'/'show' toggles an item. Each record exports one artboard (png/jpg/svg) named by fileNamePattern ({{column}}, {{#}}); the document returns to its original state. Badges, price tags, name cards, icon sets, social tiles.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `csvPath` | string |  |  |
| `jsonPath` | string |  |  |
| `records` | object[] |  |  |
| `outputFolder` | string | yes |  |
| `fileNamePattern` | string |  |  Default: `"{{#}}"`. |
| `format` | `png` · `jpg` · `svg` |  |  Default: `"png"`. |
| `artboardIndex` | integer |  |  |
| `scale` | number |  | PNG/JPG scale in %. |
| `transparency` | boolean |  |  |
| `fileFolder` | string |  | Relative image paths in the data are resolved against this folder. |

## `ai_export_assets`

Export one Illustrator artboard to SVG, PNG24, or JPEG (scale in % for PNG/JPEG, e.g. 400 for icons used in Photoshop). The open document keeps its own path (SVG goes through Export for Screens); missing folders are created.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `filePath` | string | yes | Destination file path. |
| `format` | `svg` · `png` · `jpg` |  |  Default: `"svg"`. |
| `transparency` | boolean |  |  Default: `true`. |
| `artboardIndex` | integer |  | 0-based artboard (default: active artboard). |
| `scale` | number |  | PNG/JPEG: export scale in % (default 100). |

## `ai_center_text_in_shape`

Centres a text frame inside a shape (button, pill, tag) by the CAP HEIGHT of the text, which is how the eye reads it: the bounding box of a line with descenders or accents sits off-centre. The text stays live (measured on temporary outlined copies). Returns the space left on each side in points; offsetY nudges it optically.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `textName` | string |  |  |
| `textUuid` | string |  |  |
| `shapeName` | string |  |  |
| `shapeUuid` | string |  |  |
| `mode` | `capHeight` · `ink` |  |  Default: `"capHeight"`. |
| `horizontal` | boolean |  |  Default: `true`. |
| `vertical` | boolean |  |  Default: `true`. |
| `offsetX` | number |  | Extra points to the right. |
| `offsetY` | number |  | Extra points downwards. |

## `ai_export_artboards`

Export for Screens (File > Export > Export for Screens): every artboard, or a range, in ONE call — one file per artboard, named after the artboard. Use it for carousels, format sets and brand manuals instead of exporting artboard by artboard. PNG (default, with scale), JPG, SVG or PDF.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `outputFolder` | string | yes | Absolute destination folder (created if missing). |
| `format` | `png` · `jpg` · `svg` · `pdf` |  |  Default: `"png"`. |
| `artboards` | string |  | Range in Illustrator's notation, 1-based: '1-7', '2,4,6'. Default: all. |
| `scale` | number |  | PNG/JPG scale in % (100 = artboard size in px at 72 ppi; 200 for @2x). |
| `transparency` | boolean |  | PNG: keep transparency (false = white background). Default: `true`. |
| `prefix` | string |  | Text added before each file name. |

## `ai_find_objects`

Find existing objects in the active Illustrator document by name, type or layer. Returns uuid (stable id for other ai_ tools), name, type, layer and position/size in artboard coordinates (x/y from the artboard's top-left, y down, points).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `name` | string |  | Exact object name. |
| `nameContains` | string |  |  |
| `typename` | `PathItem` · `CompoundPathItem` · `GroupItem` · `TextFrame` · `PlacedItem` · `RasterItem` · `SymbolItem` · `MeshItem` · `PluginItem` · `GraphItem` · `LegacyTextItem` · `NonNativeItem` |  |  |
| `layerName` | string |  |  |
| `topLevelOnly` | boolean |  | Skip objects nested inside groups. Default: `true`. |
| `artboardIndex` | integer |  |  |
| `limit` | integer |  |  Default: `200`. |

## `ai_modify_objects`

Edit existing Illustrator objects (by uuid, name, layer or current selection): move to an artboard position, move by an offset, resize, scale, rotate, fill/stroke colour and width (paths, compound paths, text, groups), opacity, blend mode, hide/lock, rename, change stacking order, move to another layer, or delete. Returns the objects afterwards (readback).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `uuids` | string[] |  | Object uuids from ai_find_objects (most reliable). |
| `itemNames` | string[] |  | Object names. |
| `layerName` | string |  | Every top-level object in this layer. |
| `useSelection` | boolean |  | Use the current selection when nothing else is given. Default: `true`. |
| `artboardIndex` | integer |  | Artboard for coordinates (default: active artboard). |
| `position` | object |  | Top-left corner from the artboard's top-left (y down), points. |
| `moveBy` | object |  | Relative move; y positive = down. |
| `size` | object |  |  |
| `scale` | number or number[] |  | Percent, or [x%, y%]. |
| `rotate` | number |  | Degrees, counter-clockwise. |
| `fillColor` | string |  | Hex '#RRGGBB'. |
| `strokeColor` | string |  | Hex '#RRGGBB'. |
| `strokeWidth` | number |  | Points; 0 removes the stroke. |
| `opacity` | number |  |  |
| `blendMode` | string |  | normal, multiply, screen, overlay, softLight, hardLight, colorDodge, colorBurn, darken, lighten, difference, exclusion, hue, saturation, color, luminosity. |
| `hidden` | boolean |  |  |
| `locked` | boolean |  |  |
| `name` | string |  | New name (only when one object is targeted). |
| `zOrder` | `bringToFront` · `bringForward` · `sendBackward` · `sendToBack` |  |  |
| `moveToLayer` | string |  |  |
| `remove` | boolean |  | Delete the targeted objects. |

## `ai_apply_live_effect`

Apply a non-destructive Illustrator Live Effect (Effect menu) to objects: dropShadow (offsetX=7, offsetY=7 (pt), blur=5, opacity=0.75 (0-1), color='#000000', blendMode='multiply'); outerGlow (blur=5, opacity=0.75, color='#FFFFFF', blendMode='screen'); innerGlow (blur=5, opacity=0.75, color='#FFFFFF', glowFrom='center'|'edge', blendMode='screen'); gaussianBlur (radius=10); feather (radius=10); offsetPath (offset=10 (pt, negative shrinks), joinType='round'|'bevel'|'miter', miterLimit=4); roundCorners (radius=10); roughen (amount=5, absolute=false, detail=10 (per inch), smooth=0 (0 corners … 1 smooth)); zigZag (amount=10, absolute=true, ridges=4, smooth=0); puckerBloat (value=50 (-200 pucker … 200 bloat)); twist (angle=10); transform (scaleX=100, scaleY=100, moveX=0, moveY=0, rotate=0, copies=0, pinPoint='center', reflectX, reflectY, scaleStrokes, randomize); warp (style=arc|arcLower|arcUpper|arch|bulge|shellLower|shellUpper|flag|wave|fish|rise|fishEye|inflate|squeeze|twist, amount=50 (%), vertical=false, distortH=0, distortV=0); scribble (angle=30, pathOverlap=0, pathOverlapVariation=5, strokeWidth=3, curviness=5 (%), curvinessVariation=1 (%), spacing=5, spacingVariation=0.5); rasterize (dpi=72, colorModel='rgb'|'cmyk'|'grayscale'|'bitmap', transparent=true, padding=0, antialias='none'|'art'|'type', clipMask=false); outlineStroke ((none)). Or pass rawXml for any other effect. expandAppearance=true bakes it into paths.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `uuids` | string[] |  | Object uuids from ai_find_objects (most reliable). |
| `itemNames` | string[] |  | Object names. |
| `layerName` | string |  | Every top-level object in this layer. |
| `useSelection` | boolean |  | Use the current selection when nothing else is given. Default: `true`. |
| `artboardIndex` | integer |  | Artboard for coordinates (default: active artboard). |
| `effect` | `dropShadow` · `outerGlow` · `innerGlow` · `gaussianBlur` · `feather` · `offsetPath` · `roundCorners` · `roughen` · `zigZag` · `puckerBloat` · `twist` · `transform` · `warp` · `scribble` · `rasterize` · `outlineStroke` |  |  |
| `options` | object |  | Effect options listed above. Default: `{}`. |
| `rawXml` | string |  | Full <LiveEffect ...> XML (overrides effect/options). |
| `expandAppearance` | boolean |  |  Default: `false`. |

## `ai_graphic_style`

List the document's Graphic Styles, or apply / merge one onto objects. Graphic Styles carry complete appearances (multiple fills, strokes and effects) created in Illustrator's Graphic Styles panel.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `uuids` | string[] |  | Object uuids from ai_find_objects (most reliable). |
| `itemNames` | string[] |  | Object names. |
| `layerName` | string |  | Every top-level object in this layer. |
| `useSelection` | boolean |  | Use the current selection when nothing else is given. Default: `true`. |
| `artboardIndex` | integer |  | Artboard for coordinates (default: active artboard). |
| `operation` | `list` · `apply` · `merge` |  |  Default: `"list"`. |
| `styleName` | string |  |  |

## `ai_swatches`

List the document's swatches (with RGB/CMYK values) or add a new RGB swatch.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `operation` | `list` · `add` |  |  Default: `"list"`. |
| `name` | string |  |  |
| `color` | string |  | Hex '#RRGGBB' for add. |

## `ai_apply_gradient`

Create a linear or radial gradient (2+ colour stops) and fill objects with it.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `uuids` | string[] |  | Object uuids from ai_find_objects (most reliable). |
| `itemNames` | string[] |  | Object names. |
| `layerName` | string |  | Every top-level object in this layer. |
| `useSelection` | boolean |  | Use the current selection when nothing else is given. Default: `true`. |
| `artboardIndex` | integer |  | Artboard for coordinates (default: active artboard). |
| `type` | `linear` · `radial` |  |  Default: `"linear"`. |
| `stops` | object[] | yes |  |
| `angle` | number |  | Linear gradient angle in degrees. |
| `name` | string |  |  |

## `ai_align_distribute`

Align objects (left, centerH, right, top, centerV, bottom) to their combined bounds, the artboard or the first (key) object, and/or distribute them evenly — by centres, or with a fixed gap in points between edges.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `uuids` | string[] |  | Object uuids from ai_find_objects (most reliable). |
| `itemNames` | string[] |  | Object names. |
| `layerName` | string |  | Every top-level object in this layer. |
| `useSelection` | boolean |  | Use the current selection when nothing else is given. Default: `true`. |
| `artboardIndex` | integer |  | Artboard for coordinates (default: active artboard). |
| `align` | `left` · `centerH` · `right` · `top` · `centerV` · `bottom` |  |  |
| `relativeTo` | `selection` · `artboard` · `keyObject` |  |  Default: `"selection"`. |
| `distribute` | `horizontal` · `vertical` |  |  |
| `gap` | number |  | Fixed spacing between objects when distributing, in points. |
| `useVisibleBounds` | boolean |  | Include stroke width in the bounds. Default: `false`. |

## `ai_mask`

Clipping masks: 'clip' turns the top object of the set into the mask shape and clips the objects below it (the result is a clipped group); 'releaseClip' undoes it. Opacity masks ('opacity', 'releaseOpacity') are not exposed to scripts in Illustrator and answer NOT_AVAILABLE.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `uuids` | string[] |  | Object uuids from ai_find_objects (most reliable). |
| `itemNames` | string[] |  | Object names. |
| `layerName` | string |  | Every top-level object in this layer. |
| `useSelection` | boolean |  | Use the current selection when nothing else is given. Default: `true`. |
| `artboardIndex` | integer |  | Artboard for coordinates (default: active artboard). |
| `operation` | `clip` · `releaseClip` · `opacity` · `releaseOpacity` |  |  Default: `"clip"`. |
| `name` | string |  | Name for the resulting group. |

## `ai_stroke`

Stroke settings of paths (groups and compound paths are entered): dashed line (dashes: [dash, gap, ...] in points), caps, joins, miter limit, width and colour. dashes: [] makes the stroke solid again. Arrowheads are not exposed to scripts.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `uuids` | string[] |  | Object uuids from ai_find_objects (most reliable). |
| `itemNames` | string[] |  | Object names. |
| `layerName` | string |  | Every top-level object in this layer. |
| `useSelection` | boolean |  | Use the current selection when nothing else is given. Default: `true`. |
| `artboardIndex` | integer |  | Artboard for coordinates (default: active artboard). |
| `width` | number |  |  |
| `color` | string or object |  | RGB color as hex string ('#RRGGBB') or { r, g, b } (0-255). |
| `dashes` | number[] |  | Dash pattern in points, e.g. [12, 6]; [] = solid. |
| `dashOffset` | number |  |  |
| `cap` | `butt` · `round` · `projecting` |  |  |
| `join` | `miter` · `round` · `bevel` |  |  |
| `miterLimit` | number |  |  |

## `ai_image_trace`

Image Trace: turn a placed or embedded image (or an image file, placed for you) into vector paths. Pick one of the installed presets by name (listPresets: true returns them; the names follow the app's language), then the result is expanded into paths unless expand is false. A photo traced in high fidelity can produce thousands of paths.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `uuids` | string[] |  | Object uuids from ai_find_objects (most reliable). |
| `itemNames` | string[] |  | Object names. |
| `layerName` | string |  | Every top-level object in this layer. |
| `useSelection` | boolean |  | Use the current selection when nothing else is given. Default: `true`. |
| `artboardIndex` | integer |  | Artboard for coordinates (default: active artboard). |
| `filePath` | string |  | Image file to place and trace (instead of naming an object). |
| `preset` | string |  | Tracing preset name, exactly as listed. |
| `ignoreWhite` | boolean |  |  |
| `maxColors` | integer |  |  |
| `threshold` | integer |  | Black-and-white threshold. |
| `expand` | boolean |  |  Default: `true`. |
| `listPresets` | boolean |  |  |
| `name` | string |  |  |

## `ai_text_styles`

Paragraph and character styles of the document: list, create, update (attributes and/or newName), apply to text objects, or remove. Attributes: font (PostScript name), size, leading, tracking, color, allCaps; paragraph styles also take justification (left, center, right, justify), spaceBefore, spaceAfter, firstLineIndent, hyphenation.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `uuids` | string[] |  | Object uuids from ai_find_objects (most reliable). |
| `itemNames` | string[] |  | Object names. |
| `layerName` | string |  | Every top-level object in this layer. |
| `useSelection` | boolean |  | Use the current selection when nothing else is given. Default: `true`. |
| `artboardIndex` | integer |  | Artboard for coordinates (default: active artboard). |
| `kind` | `paragraph` · `character` |  |  Default: `"paragraph"`. |
| `operation` | `list` · `create` · `update` · `apply` · `remove` |  |  Default: `"list"`. |
| `name` | string |  | Style name (not needed for list). |
| `newName` | string |  | update: rename the style. |
| `attributes` | object |  |  |
| `clearOverrides` | boolean |  | apply: remove local formatting so the style shows as defined. Default: `true`. |

## `ai_pathfinder`

Combine shapes with Pathfinder: unite, minusFront, intersect, exclude, divide, trim, merge, crop, outline, minusBack. Expanded into real paths by default (expand=false keeps a live compound shape).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `uuids` | string[] |  | Object uuids from ai_find_objects (most reliable). |
| `itemNames` | string[] |  | Object names. |
| `layerName` | string |  | Every top-level object in this layer. |
| `useSelection` | boolean |  | Use the current selection when nothing else is given. Default: `true`. |
| `artboardIndex` | integer |  | Artboard for coordinates (default: active artboard). |
| `operation` | `unite` · `minusFront` · `intersect` · `exclude` · `divide` · `trim` · `merge` · `crop` · `outline` · `minusBack` | yes |  |
| `expand` | boolean |  |  Default: `true`. |
| `name` | string |  | Name for the resulting object. |

## `ai_execute_menu_or_action`

Execute any Illustrator menu command string (`app.executeMenuCommand`, e.g. 'Live Pathfinder Add', 'expandStyle', 'group', 'ungroup') or recorded Action (`app.doScript`).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `menuCommand` | string |  | Menu command string for app.executeMenuCommand(). |
| `actionName` | string |  | Action name for app.doScript(). |
| `actionSet` | string |  | Action set name for app.doScript(). |

## `ai_send_cpp_script_message`

Native C++ SDK Bridge (`AIScriptMessageSuite` from Adobe Illustrator 2026 SDK): Send a message selector and JSON/string payload via `app.sendScriptMessage(pluginName, selector, payload)` to an in-process C++ .aip plugin.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `pluginName` | string |  | Target C++ plugin name registered in Illustrator. Default: `"ScriptMessage"`. |
| `selector` | string |  | Message selector string. Default: `"Send Text"`. |
| `payload` | string or object | yes | Input string or JSON object (`inParam`) sent to C++ plugin. |

## `ai_execute_extendscript`

Illustrator ExtendScript escape hatch: execute arbitrary .jsx ExtendScript code in Adobe Illustrator (works via CEP WebSocket or zero-plugin Windows COM DoJavaScript).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `code` | string | yes | ExtendScript (ES3) code to evaluate in Illustrator. |

## `ai_recipe_logo_package`

Recipe: logo delivery package from the OPEN Illustrator document (approved logo on one artboard; an artboard named 'simbolo'/'icone'/'symbol' is used for the square marks). Saves a COPY as <outDir>/fonte/<base>.ai (the original is not changed) and builds artboards: cor, negativa (white), mono-preto (black 100 %), avatar and favicon (mark on a solid brand colour) and a one-page usage sheet (versions on light/dark, clear space, minimum size, colours HEX/CMYK). Exports svg/ and png/ (512, 1024, 2048 px, transparent) per version, web/ (favicon 32, 180, 512 and avatar 1080) and pdf/ (all artboards, vector). Returns a contact sheet of every version on light and dark grounds. Raster images or special objects inside the logo are reported (they cannot be recoloured).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `outDir` | string | yes | Package folder, e.g. <job>/06_entrega/marca. |
| `name` | string |  | Base file name, e.g. 'levatio' (slugged; default: document name). |
| `artboardIndex` | integer |  | Artboard of the approved full-colour logo. Default: `0`. |
| `symbolArtboardIndex` | integer |  |  |
| `kitPath` | string |  |  |
| `colors` | object |  |  |
| `fonts` | object |  |  |
| `squareBackground` | string |  | '#RRGGBB' behind avatar/favicon (default: kit destaque if dark enough, else fundo). |
| `squareArt` | `negativa` · `mono-preto` · `cor` |  | Mark version on the square background (default: by contrast). |
| `pngSizes` | integer[] |  |  Default: `[512,1024,2048]`. |
| `clearSpace` | number |  | Clear space as a share of the logo height. Default: `0.25`. |
| `minWidthMm` | number |  |  Default: `25`. |
| `minWidthPx` | integer |  |  Default: `120`. |
| `usageSheet` | boolean |  |  Default: `true`. |
| `pdf` | boolean |  |  Default: `true`. |

## `ai_recipe_pop_out`

Recipe: 'out of bounds' / pop-out portrait built with clipping masks in the OPEN Illustrator document (also asked for as: person coming out of a circle, breaking the frame). Illustrator's own Remove Background has no script access, so Photoshop cuts the photo out first and saves a transparent PNG (trimmed to the subject, which is easier to edit afterwards); the PNG is then placed in Illustrator and the masks are made there. Result, in one group: 'Subject top' (clip group: a rectangle tight on the part above the cut line + the cut-out) and 'Subject' (clip group whose clipping path is the shape itself, with fill and optional stroke set after masking). keepBackground: the original photo with its background fills the shape; then the cut-out is not trimmed so both images line up. Pass a ready transparent PNG with cutout 'no', or imageName for an image already in the document (it must already have no background). Returns the geometry and a preview.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `filePath` | string |  | Photo (or ready cut-out) to place. Without it: imageName, the selected image, or the only image in the document. |
| `imageName` | string |  | Name of an image already in the document (already without background). |
| `cutout` | `auto` · `yes` · `no` |  | auto: Photoshop removes the background unless the file is a PNG/PSD/WebP/TIFF with transparency expected; yes: always; no: place the file as it is. |
| `method` | `removeBackground` · `selectSubject` |  |  |
| `cutoutPath` | string |  | Where Photoshop writes the transparent PNG (default: <photo>_cutout.png next to the photo). |
| `keepBackground` | boolean |  | Show the original photo, background included, inside the shape. |
| `shape` | `circle` · `ellipse` · `rectangle` · `roundedRectangle` |  | Default circle. |
| `shapeColor` | string |  | '#RRGGBB' fill of the shape (default #C8783C). |
| `strokeColor` | string |  | '#RRGGBB' outline of the shape. |
| `strokeWidth` | number |  | Outline width in pt. |
| `shapeBounds` | object |  | Exact box of the shape in pt from the artboard's top-left. |
| `shapeScale` | number |  | Shape width as a multiple of the subject's width (default 1.5). |
| `shapeAspect` | number |  |  |
| `radius` | number |  |  |
| `overflow` | number |  | How far the subject sticks out above the shape, as a share of the shape's height (default 0.22). |
| `cutAt` | number |  | Cut line of the top copy: 0 = top of the shape, 1 = bottom (default 0.5). |
| `placeHeight` | number |  | Height of the placed image in pt (default 90 % of the artboard). |
| `centerX` | number |  | Horizontal centre of the placed image, pt from the artboard's left (default: centred). |
| `top` | number |  | Top of the placed image, pt from the artboard's top (default: centred). |
| `embed` | boolean |  | Embed the image (default true); false keeps it linked. |
| `groupName` | string |  |  |
