# Photoshop

Documents, layers, masks, smart objects, adjustments, artboards, recipes and audits.

[← All tools](README.md)

| Tool | What it does |
|---|---|
| [`ps_list_documents`](#ps_list_documents) | List all open documents in Adobe Photoshop with dimensions, resolution, color mode, and active state. |
| [`ps_create_document`](#ps_create_document) | Create a new document in Adobe Photoshop. |
| [`ps_open_document`](#ps_open_document) | Open an existing image or PSD/PSB document in Adobe Photoshop. |
| [`ps_save_document`](#ps_save_document) | Save or export the active Adobe Photoshop document (.psd, .png, .jpg). |
| [`ps_modify_canvas`](#ps_modify_canvas) | Crop, resize image, resize canvas, rotate, trim transparent pixels, or flatten the active Photoshop document. |
| [`ps_get_canvas_snapshot`](#ps_get_canvas_snapshot) | Multimodal Visual Feedback: Render the active Photoshop document (downscaled to maxDimension) and return it as an inline image for visual inspection. |
| [`ps_get_layer_tree`](#ps_get_layer_tree) | Retrieve the complete hierarchy of layers and groups in the active Photoshop document (IDs, names, types, bounds, opacity, blend modes, visibility). |
| [`ps_luminosity_masks`](#ps_luminosity_masks) | Create luminosity masks as alpha channels, no brush: Luzes 1..N (brightness of the composite, each step narrower), Sombras 1..N (the inverse) and Medios (neither). |
| [`ps_recipe_zone_dodge_burn`](#ps_recipe_zone_dodge_burn) | Dodge & burn by zones without a brush: Curves layers masked by luminosity masks (lift the shadows on Sombras 2, hold the highlights on Luzes 2, optional midtone contrast on… |
| [`ps_recipe_frequency_separation`](#ps_recipe_frequency_separation) | Light frequency separation for skin, no brush: Baixa frequencia (blur) + Alta frequencia (high pass, Linear Light) rebuild the photo exactly; Suavizar pele (more blur, masked… |
| [`ps_recipe_look`](#ps_recipe_look) | Apply a reference look as editable adjustment layers in one group above everything (the photo is not touched): esportivo-dramatico, pb-papel-antigo, pb-vintage. |
| [`ps_recipe_film_grain`](#ps_recipe_film_grain) | Film grain on top of the document: a 50 % grey layer in Overlay with monochrome Gaussian noise, slightly blurred. |
| [`ps_organize_layers`](#ps_organize_layers) | Organise a Photoshop document in groups by meaning: text on a shape becomes a label group, an icon with its text (and the lines under it) an item group, repeated items/labels… |
| [`ps_create_layer`](#ps_create_layer) | Create a new pixel layer, group (folder), solid color fill layer, or text layer in Photoshop. |
| [`ps_edit_text_layer`](#ps_edit_text_layer) | Modify text contents, font, size, color, tracking, leading, or alignment on an existing text layer in Photoshop. |
| [`ps_transform_and_manage_layer`](#ps_transform_and_manage_layer) | Transform (translate, scale, rotate, flip) or manage (rename, duplicate, delete, convert to Smart Object, rasterize, set opacity/blendMode/visibility) a layer in Photoshop. |
| [`ps_selection_and_masks`](#ps_selection_and_masks) | Create or modify pixel selections (rectangle, ellipse, polygon, selectAll, selectSubject, selectSky, invert, clear), remove the background, or add/delete a layer mask from the… |
| [`ps_effects_and_adjustments`](#ps_effects_and_adjustments) | Apply a built-in filter (gaussianBlur, motionBlur, highPass, addNoise, unsharpMask), layer style (dropShadow, innerShadow, stroke, outerGlow, innerGlow, bevelEmboss, satin,… |
| [`ps_apply_filter`](#ps_apply_filter) | Apply any of the Photoshop DOM filters to a layer (works on the UXP panel and on ExtendScript/COM). |
| [`ps_adjustment_layer`](#ps_adjustment_layer) | Create any non-destructive adjustment layer: brightnessContrast, levels, curves, exposure, vibrance, hueSaturation, colorBalance, blackAndWhite, photoFilter, channelMixer,… |
| [`ps_guides`](#ps_guides) | Guides of the active Photoshop document: list them, add single guides, lay out a column/row grid with margins and gutters (the usual layout grid), or clear them all. |
| [`ps_camera_raw_filter`](#ps_camera_raw_filter) | Apply the Camera Raw filter to a layer with the same controls as the Lightroom develop tools: temperature, tint, exposure, contrast, highlights, shadows, whites, blacks,… |
| [`ps_smart_object`](#ps_smart_object) | Smart Object operations on a layer: convert to Smart Object, open its contents, replace or relink its contents with a file (mockups), convert back to layers, or rasterize. |
| [`ps_menu_command`](#ps_menu_command) | Run any Photoshop menu command by its numeric command ID (record the ID with Alchemist or Record Action Commands, where it appears as 'select menuItemClass'). |
| [`ps_batch_variants`](#ps_batch_variants) | Ads and posts from a spreadsheet: in an open template PSD, layers are named after the data columns — text layers get the text, Smart Objects get the file in the cell (photo,… |
| [`ps_artboards`](#ps_artboards) | Artboards: list them (name, rect, background), create several at once (name, width, height, optional x/y — placed side by side by default — and backgroundColor), or export each… |
| [`ps_export_web`](#ps_export_web) | Export the document for web and social: JPG, PNG or WebP, converted to sRGB 8-bit, metadata stripped, resized to fit maxWidth/maxHeight or by scale, with a file-size budget… |
| [`ps_recipe_social_set`](#ps_recipe_social_set) | Recipe: key art → every social format in one call. |
| [`ps_audit_document`](#ps_audit_document) | Check a Photoshop piece before delivery: canvas vs format, RGB/sRGB/8-bit, text outside the format's safe zone (story bars, reels buttons, thumbnail duration badge), text… |
| [`ps_list_fonts`](#ps_list_fonts) | List installed fonts with the PostScript names Photoshop text tools expect (search by family, style or name, e.g. |
| [`ps_place_file`](#ps_place_file) | Place an image, PDF, AI or PSD file as a Smart Object layer (embedded, or linked), optionally fitted into a box (x/y = top-left in px; fit contain/cover/width/height) and renamed. |
| [`ps_list_actions`](#ps_list_actions) | List every Action set and Action loaded in Photoshop's Actions panel (including the user's own .atn sets). |
| [`ps_play_action`](#ps_play_action) | Play an Action from the Actions panel by set and action name (as listed by ps_list_actions). |
| [`ps_batch_play`](#ps_batch_play) | Photoshop escape hatch: run raw actionJSON descriptors (batchPlay format). |
| [`ps_execute_uxp_script`](#ps_execute_uxp_script) | Photoshop UXP escape hatch: execute arbitrary async JavaScript inside Photoshop's UXP environment with `app`, `core`, `action`, `batchPlay`, `uxp`, `constants` and… |
| [`ps_execute_extendscript`](#ps_execute_extendscript) | Photoshop ExtendScript escape hatch: execute arbitrary .jsx (ES3) code in Photoshop. |
| [`ps_recolor_object`](#ps_recolor_object) | Recolour an object that already has colour (shirt, product, wall) the controllable way: one masked group with three separate adjustments — hue (solid fill in Hue blend mode),… |
| [`ps_blend_if`](#ps_blend_if) | Blend If (Layer Style > Blending Options) on a layer: split the underlying-layer black/white sliders so shadows and texture of what is below show through — e.g. |
| [`ps_center_text_in_shape`](#ps_center_text_in_shape) | Centres a text layer inside a shape layer (button, pill, tag, card) by the CAP HEIGHT of the text, which is how the eye reads it: the ink box of a line with descenders or… |
| [`ps_place_logo`](#ps_place_logo) | Places the brand logo (PNG/SVG/AI/PSD file from the kit) as a Smart Object in a corner of the document or of one artboard, sized as a fraction of the width and kept away from… |
| [`ps_create_shape`](#ps_create_shape) | Live shape layer: rounded rectangle (buttons, badges, cards), rectangle or ellipse, with an editable fill colour. |
| [`ps_recipe_remove_background`](#ps_recipe_remove_background) | Recipe: cut out the subject of a photo in one call. |
| [`ps_recipe_pop_out`](#ps_recipe_pop_out) | Recipe: 'out of bounds' / pop-out portrait in one call (also asked for as: person coming out of a circle, breaking the frame, 3D pop-out). |
| [`ps_recipe_product_shot`](#ps_recipe_product_shot) | Recipe: product photo → finished product shot in one call. |

## `ps_list_documents`

List all open documents in Adobe Photoshop with dimensions, resolution, color mode, and active state.

No parameters.

## `ps_create_document`

Create a new document in Adobe Photoshop.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `name` | string |  | Document title. Default: `"Untitled-MCP"`. |
| `width` | number |  | Width in pixels. Default: `1920`. |
| `height` | number |  | Height in pixels. Default: `1080`. |
| `resolution` | number |  | Resolution in PPI (default 72). Default: `72`. |
| `mode` | `RGBColorMode` · `CMYKColorMode` · `grayscaleMode` · `labColorMode` |  |  Default: `"RGBColorMode"`. |
| `fill` | `white` · `transparent` · `backgroundColor` |  |  Default: `"white"`. |

## `ps_open_document`

Open an existing image or PSD/PSB document in Adobe Photoshop.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `filePath` | string | yes | Absolute path to the file (.psd, .psb, .png, .jpg, .webp, .tiff, .pdf). |

## `ps_save_document`

Save or export the active Adobe Photoshop document (.psd, .png, .jpg).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `filePath` | string |  | Destination file path. Omit to save in-place. |
| `format` | `psd` · `png` · `jpg` |  |  Default: `"psd"`. |
| `quality` | number |  | JPEG quality (1-12). Default: `10`. |
| `documentName` | string |  | Open document to act on (brought to the front first). Default: the active document. |

## `ps_modify_canvas`

Crop, resize image, resize canvas, rotate, trim transparent pixels, or flatten the active Photoshop document.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `operation` | `crop` · `resizeImage` · `resizeCanvas` · `rotate` · `trim` · `flatten` | yes | Canvas operation. |
| `width` | number |  | Target width in pixels (for resizeImage / resizeCanvas). |
| `height` | number |  | Target height in pixels (for resizeImage / resizeCanvas). |
| `bounds` | object |  | Crop rectangle in pixels. |
| `angle` | number |  | Rotation angle in degrees. |
| `documentName` | string |  | Open document to act on (brought to the front first). Default: the active document. |

## `ps_get_canvas_snapshot`

Multimodal Visual Feedback: Render the active Photoshop document (downscaled to maxDimension) and return it as an inline image for visual inspection. Pass outputPath to also save a full PNG copy on disk.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `outputPath` | string |  | Optional file path to save the PNG snapshot. |
| `maxDimension` | integer |  | Max width/height for preview scaling. Default: `1024`. |
| `includeImageContent` | boolean |  | Return inline base64 image in MCP response. Default: `true`. |
| `documentName` | string |  | Open document to act on (brought to the front first). Default: the active document. |

## `ps_get_layer_tree`

Retrieve the complete hierarchy of layers and groups in the active Photoshop document (IDs, names, types, bounds, opacity, blend modes, visibility).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `maxDepth` | integer |  |  Default: `5`. |
| `documentName` | string |  | Open document to act on (brought to the front first). Default: the active document. |

## `ps_luminosity_masks`

Create luminosity masks as alpha channels, no brush: Luzes 1..N (brightness of the composite, each step narrower), Sombras 1..N (the inverse) and Medios (neither). Load one as a selection before an adjustment layer to touch only that tonal range. Replaces channels with the same names.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `documentName` | string |  |  |
| `steps` | integer |  |  Default: `3`. |
| `midtones` | boolean |  |  Default: `true`. |

## `ps_recipe_zone_dodge_burn`

Dodge & burn by zones without a brush: Curves layers masked by luminosity masks (lift the shadows on Sombras 2, hold the highlights on Luzes 2, optional midtone contrast on Medios) in one group. strength 0-100 sets the curve; lower the group opacity to taste. Creates the masks when missing.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `documentName` | string |  |  |
| `strength` | number |  |  Default: `50`. |
| `liftShadows` | boolean |  |  Default: `true`. |
| `holdHighlights` | boolean |  |  Default: `true`. |
| `midContrast` | boolean |  |  Default: `false`. |
| `shadowsMask` | string |  | Channel for the shadow lift (default Sombras 2). |
| `highlightsMask` | string |  | Channel for the highlight hold (default Luzes 2). |
| `groupName` | string |  |  |

## `ps_recipe_frequency_separation`

Light frequency separation for skin, no brush: Baixa frequencia (blur) + Alta frequencia (high pass, Linear Light) rebuild the photo exactly; Suavizar pele (more blur, masked to skin tones, 25-40 % opacity) evens colour and tone and keeps the texture. All in one group above the base layer. Radius defaults to the long side / 600.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `documentName` | string |  |  |
| `layerId` | integer |  |  |
| `layerName` | string |  |  |
| `radius` | number |  |  |
| `smoothOpacity` | number |  |  Default: `30`. |
| `skinMask` | boolean |  | Mask Suavizar pele with Select > Color Range > Skin Tones. Default: `true`. |
| `groupName` | string |  |  |

## `ps_recipe_look`

Apply a reference look as editable adjustment layers in one group above everything (the photo is not touched): esportivo-dramatico, pb-papel-antigo, pb-vintage. The group opacity is the intensity (default 70 %). Same looks as lr_apply_look and pr_color.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `documentName` | string |  |  |
| `look` | `esportivo-dramatico` · `pb-papel-antigo` · `pb-vintage` | yes |  |
| `intensity` | number |  |  Default: `0.7`. |

## `ps_recipe_film_grain`

Film grain on top of the document: a 50 % grey layer in Overlay with monochrome Gaussian noise, slightly blurred. amount 2-20 (8 = subtle), size = blur radius (0.4-1.5), opacity 30-80. Works on any Photoshop version (the 27.4 grain adjustment is ps_adjustment_layer type grain).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `documentName` | string |  |  |
| `amount` | number |  |  Default: `8`. |
| `size` | number |  |  Default: `0.6`. |
| `opacity` | number |  |  Default: `60`. |
| `name` | string |  |  |

## `ps_organize_layers`

Organise a Photoshop document in groups by meaning: text on a shape becomes a label group, an icon with its text (and the lines under it) an item group, repeated items/labels in a column or row one list group holding them. Lone objects, the background and adjustment layers stay as they are; a group that would change the stacking is skipped. apply: false (default) only reports the plan; apply: true creates the groups (one history step each; work on a copy of the user's file).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `documentName` | string |  |  |
| `apply` | boolean |  |  Default: `false`. |
| `language` | `pt` · `en` |  | Language of the group names. Default: `"pt"`. |

## `ps_create_layer`

Create a new pixel layer, group (folder), solid color fill layer, or text layer in Photoshop. 'position' places the text insertion point in document pixels.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `layerType` | `pixel` · `group` · `text` · `solidColor` |  |  Default: `"pixel"`. |
| `name` | string |  | Layer name. |
| `text` | string |  | Text content when layerType='text'. |
| `fontSize` | number |  | Font size in pt. Default: `48`. |
| `font` | string |  | PostScript font name (e.g. 'ArialMT'). |
| `position` | number[] |  | [x, y] coordinates in pixels. |
| `artboard` | string |  | Text layers in a document with artboards: name of the artboard that receives the layer (default: the artboard that contains 'position', else the first). |
| `color` | string or object |  | RGB color as hex string ('#RRGGBB') or { r, g, b } object (0-255). |
| `opacity` | number |  |  Default: `100`. |
| `blendMode` | string |  |  Default: `"normal"`. |
| `documentName` | string |  | Open document to act on (brought to the front first). Default: the active document. |

## `ps_edit_text_layer`

Modify text contents, font, size, color, tracking, leading, or alignment on an existing text layer in Photoshop.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `layerId` | integer |  | Target layer ID. |
| `layerName` | string |  | Target layer name. |
| `text` | string |  | New text string. |
| `fontSize` | number |  |  |
| `font` | string |  | PostScript font name. |
| `color` | string or object |  | RGB color as hex string ('#RRGGBB') or { r, g, b } object (0-255). |
| `tracking` | number |  |  |
| `leading` | number |  |  |
| `alignment` | `left` · `center` · `right` · `justify` |  |  |
| `documentName` | string |  | Open document to act on (brought to the front first). Default: the active document. |

## `ps_transform_and_manage_layer`

Transform (translate, scale, rotate, flip) or manage (rename, duplicate, delete, convert to Smart Object, rasterize, set opacity/blendMode/visibility) a layer in Photoshop. Targets layerId/layerName, or the active layer when neither is given; a named layer that does not exist is an error. Reordering and merging are not built in: use ps_batch_play.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `operation` | `updateProperties` · `translate` · `scale` · `rotate` · `flipHorizontal` · `flipVertical` · `duplicate` · `delete` · `convertToSmartObject` · `rasterize` |  |  Default: `"updateProperties"`. |
| `layerId` | integer |  |  |
| `layerName` | string |  |  |
| `newName` | string |  |  |
| `visible` | boolean |  |  |
| `opacity` | number |  |  |
| `blendMode` | string |  |  |
| `deltaX` | number |  |  |
| `deltaY` | number |  |  |
| `scaleX` | number |  | Horizontal scale percentage (e.g. 150 for 150%). |
| `scaleY` | number |  | Vertical scale percentage. |
| `angle` | number |  | Rotation angle in degrees. |
| `documentName` | string |  | Open document to act on (brought to the front first). Default: the active document. |

## `ps_selection_and_masks`

Create or modify pixel selections (rectangle, ellipse, polygon, selectAll, selectSubject, selectSky, invert, clear), remove the background, or add/delete a layer mask from the current selection. 'feather' applies to rectangle, ellipse and polygon. Refine the current selection with expand, contract, smooth, feather, border (amount in px), grow, similar (tolerance) or colorRange (highlights, midtones, shadows, a colour family, skin tones); keep it with saveSelection and bring it back with loadSelection.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `operation` | `rectangle` · `ellipse` · `polygon` · `selectAll` · `clear` · `invert` · `selectSubject` · `selectSky` · `removeBackground` · `addMaskFromSelection` · `deleteMask` · `expand` · `contract` · `smooth` · `feather` · `border` · `grow` · `similar` · `colorRange` · `saveSelection` · `loadSelection` | yes |  |
| `amount` | number |  | expand / contract / smooth / feather / border: pixels. |
| `tolerance` | number |  | grow / similar: tolerance (default 32). |
| `range` | `highlights` · `midtones` · `shadows` · `reds` · `yellows` · `greens` · `cyans` · `blues` · `magentas` · `skinTones` |  | colorRange: what to select. |
| `name` | string |  | saveSelection / loadSelection: name of the saved selection (an alpha channel). |
| `invert` | boolean |  | loadSelection: load it inverted. |
| `bounds` | object |  |  |
| `points` | number[][] |  | Polygon vertices [[x,y], ...]. |
| `feather` | number |  |  Default: `0`. |
| `documentName` | string |  | Open document to act on (brought to the front first). Default: the active document. |

## `ps_effects_and_adjustments`

Apply a built-in filter (gaussianBlur, motionBlur, highPass, addNoise, unsharpMask), layer style (dropShadow, innerShadow, stroke, outerGlow, innerGlow, bevelEmboss, satin, colorOverlay, gradientOverlay) or adjustment layer (brightnessContrast, hueSaturation, vibrance, levels, curves, colorBalance, blackAndWhite). Layer styles work on both panels (CEP and UXP); adjustment layers here need the UXP panel (ps_adjustment_layer works everywhere). Applying a layer style replaces the styles already on the layer; levels and curves are created with neutral defaults. Anything else (Smart Sharpen, LUT, ...) goes through ps_batch_play.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `category` | `filter` · `layerStyle` · `adjustmentLayer` | yes |  |
| `type` | string | yes | filter: gaussianBlur \| motionBlur \| highPass \| addNoise \| unsharpMask. layerStyle: dropShadow \| innerShadow \| stroke \| outerGlow \| innerGlow \| bevelEmboss \| satin \| colorOverlay \| gradientOverlay. adjustmentLayer: brightnessContrast \| hueSaturation \| vibrance \| levels \| curves \| colorBalance \| blackAndWhite. |
| `layerId` | integer |  |  |
| `layerName` | string |  | Target layer or group (folder) name. A layer style on a group affects everything inside it. |
| `replaceExisting` | boolean |  | layerStyle: by default the style is added to the ones already on the layer (call once per style to stack several). true removes the other styles first. |
| `settings` | object |  | Parameters. gaussianBlur/highPass {radius}; motionBlur {angle,distance}; addNoise {amount,distribution:'gaussian'\|'uniform',monochromatic}; unsharpMask {amount,radius,threshold}; dropShadow {color,opacity,angle,distance,spread,size,blendMode}; stroke {color,size,position:'outside'\|'inside'\|'center',opacity}; outerGlow {color,opacity,spread,size}; colorOverlay {color,opacity,blendMode}; gradientOverlay {from,to,fromOpacity,toOpacity,angle,style:'linear'\|'radial',scale,reverse,opacity,blendMode}; brightnessContrast {brightness,contrast}; hueSaturation {hue,saturation,lightness,colorize}; vibrance {vibrance,saturation}; colorBalance {shadows,midtones,highlights: [cyanRed,magentaGreen,yellowBlue]}; blackAndWhite {red,yellow,green,cyan,blue,magenta}. Default: `{}`. |
| `documentName` | string |  | Open document to act on (brought to the front first). Default: the active document. |

## `ps_apply_filter`

Apply any of the Photoshop DOM filters to a layer (works on the UXP panel and on ExtendScript/COM). `args` follow the method's parameter order, in pixels / percent / degrees; enum arguments are strings like 'NoiseDistribution.GAUSSIAN'. Common signatures: applyGaussianBlur(radius) · applyMotionBlur(angle, distance) · applyAddNoise(amount, distribution, monochromatic) · applyUnSharpMask(amount, radius, threshold) · applyHighPass(radius) · applySmartBlur(radius, threshold, quality, mode) · applyLensBlur(...) · applyTwirl(angle) · applyWave(...) · applyClouds() · applyDustAndScratches(radius, threshold) · applyMedianNoise(radius). For a non-destructive Smart Filter, convert the layer with ps_smart_object first.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `layerId` | integer |  |  |
| `layerName` | string |  |  |
| `filter` | `applyAddNoise` · `applyAverage` · `applyBlur` · `applyBlurMore` · `applyClouds` · `applyCustomFilter` · `applyDeInterlace` · `applyDespeckle` · `applyDifferenceClouds` · `applyDiffuseGlow` · `applyDisplace` · `applyDustAndScratches` · `applyGaussianBlur` · `applyGlassEffect` · `applyHighPass` · `applyLensBlur` · `applyLensFlare` · `applyMaximum` · `applyMedianNoise` · `applyMinimum` · `applyMotionBlur` · `applyNTSC` · `applyOceanRipple` · `applyOffset` · `applyPinch` · `applyPolarCoordinates` · `applyRipple` · `applySharpen` · `applySharpenEdges` · `applySharpenMore` · `applyShear` · `applySmartBlur` · `applySpherize` · `applyTwirl` · `applyUnSharpMask` · `applyWave` · `applyZigZag` | yes | Layer method name. |
| `args` | any[] |  | Arguments in method order. Default: `[]`. |
| `documentName` | string |  | Open document to act on (brought to the front first). Default: the active document. |

## `ps_adjustment_layer`

Create any non-destructive adjustment layer: brightnessContrast, levels, curves, exposure, vibrance, hueSaturation, colorBalance, blackAndWhite, photoFilter, channelMixer, colorLookup, invert, posterize, threshold, gradientMap, selectiveColor, clarity, grain. Optional `settings` are actionJSON fields merged into the adjustment (record the exact fields with Alchemist or Plugins > Development > Record Action Commands). Can clip to the layer below. Returns the new layer's id and name.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `type` | `brightnessContrast` · `levels` · `curves` · `exposure` · `vibrance` · `hueSaturation` · `colorBalance` · `blackAndWhite` · `photoFilter` · `channelMixer` · `colorLookup` · `invert` · `posterize` · `threshold` · `gradientMap` · `selectiveColor` · `clarity` · `grain` | yes |  |
| `settings` | object |  | actionJSON fields, e.g. { brightness: 20, center: 10 } for brightnessContrast; { clarity: 30 } for clarity; { grainAmount: 40, grainSize: 30, grainRoughness: 60 } for grain (clarity and grain need Photoshop 27.4+). |
| `layerId` | integer |  | Create it above this layer (default: above the active layer). |
| `layerName` | string |  |  |
| `name` | string |  |  |
| `clipToBelow` | boolean |  | Clip to the layer below (affects only that layer). Default: `false`. |
| `opacity` | number |  |  |
| `blendMode` | string |  | actionJSON blend mode, e.g. normal, multiply, screen, overlay, softLight, luminosity. |
| `documentName` | string |  | Open document to act on (brought to the front first). Default: the active document. |

## `ps_guides`

Guides of the active Photoshop document: list them, add single guides, lay out a column/row grid with margins and gutters (the usual layout grid), or clear them all. Positions are pixels from the top-left.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `operation` | `list` · `add` · `layout` · `clear` |  |  Default: `"list"`. |
| `guides` | object[] |  | add: the guides to create. |
| `margin` | number |  | layout: margin on the four sides (px). |
| `columns` | integer |  | layout: number of columns. |
| `rows` | integer |  | layout: number of rows. |
| `gutter` | number |  | layout: space between columns and between rows (px). |
| `replace` | boolean |  | layout: remove the existing guides first. |
| `documentName` | string |  |  |

## `ps_camera_raw_filter`

Apply the Camera Raw filter to a layer with the same controls as the Lightroom develop tools: temperature, tint, exposure, contrast, highlights, shadows, whites, blacks, texture, clarity, dehaze, vibrance, saturation, sharpening, luminanceNoise, colorNoise, vignette, grain. Convert the layer to a Smart Object first (ps_smart_object) to keep it as an editable Smart Filter; on a pixel layer the change is permanent. No dialog is shown.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `settings` | object | yes | e.g. { exposure: 0.4, contrast: 15, highlights: -30, shadows: 25, clarity: 10, vibrance: 12 }. Exposure is in stops (-5..5); most others -100..100. |
| `layerId` | integer |  |  |
| `layerName` | string |  |  |
| `documentName` | string |  |  |

## `ps_smart_object`

Smart Object operations on a layer: convert to Smart Object, open its contents, replace or relink its contents with a file (mockups), convert back to layers, or rasterize. Returns the resulting active layer.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `operation` | `convert` · `editContents` · `replaceContents` · `relink` · `convertToLayers` · `rasterize` | yes |  |
| `layerId` | integer |  |  |
| `layerName` | string |  |  |
| `filePath` | string |  | Absolute path for replaceContents / relink. |
| `documentName` | string |  | Open document to act on (brought to the front first). Default: the active document. |

## `ps_menu_command`

Run any Photoshop menu command by its numeric command ID (record the ID with Alchemist or Record Action Commands, where it appears as 'select menuItemClass'). On the UXP panel it first checks that the command is available and returns its title.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `commandId` | integer | yes |  |
| `documentName` | string |  | Open document to act on (brought to the front first). Default: the active document. |

## `ps_batch_variants`

Ads and posts from a spreadsheet: in an open template PSD, layers are named after the data columns — text layers get the text, Smart Objects get the file in the cell (photo, logo), a cell 'hide'/'show' toggles a layer. Each record is exported (PNG/JPG/PSD copy) to outputFolder as fileNamePattern ({{column}}, {{#}} = row number), and the document returns to its original state. For several formats, keep one template per format.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `documentName` | string |  | Open template document (default: the active one). |
| `csvPath` | string |  |  |
| `jsonPath` | string |  |  |
| `records` | object[] |  |  |
| `outputFolder` | string | yes |  |
| `fileNamePattern` | string |  |  Default: `"{{#}}"`. |
| `format` | `png` · `jpg` · `psd` |  |  Default: `"png"`. |
| `quality` | integer |  |  |
| `fileFolder` | string |  | Relative file paths in the data are resolved against this folder. |

## `ps_artboards`

Artboards: list them (name, rect, background), create several at once (name, width, height, optional x/y — placed side by side by default — and backgroundColor), or export each one to its own file named after the artboard (png/jpg/webp, scale for @2x, sRGB, maxKB) — one PSD with feed 4:5, story 9:16 and square delivered in one call. Exports work on duplicates; the document is not changed.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `documentName` | string |  |  |
| `operation` | `list` · `create` · `export` · `quickExport` |  | quickExport = File > Export > Quick Export as PNG (one file per artboard, named after it) — preferred for a PSD with artboards; export = per-artboard crop with naming pattern, formats and size budget. Default: `"list"`. |
| `artboards` | object[] |  | create: artboards in pixels. |
| `gap` | number |  | create: space between artboards placed automatically (default 100 px). |
| `names` | string[] |  | export: only these artboards (default all). |
| `outputFolder` | string |  |  |
| `fileNamePattern` | string |  | export: {{name}} artboard, {{#}} order, {{document}}. Default '{{name}}'. |
| `format` | `png` · `jpg` · `webp` |  |  |
| `quality` | integer |  | JPG/WebP quality 1–100 (default 82). |
| `maxKB` | number |  | JPG/WebP: lower the quality step by step until the file fits (down to minQuality). |
| `minQuality` | integer |  | Floor for maxKB (default 45). |
| `lossless` | boolean |  | WebP lossless. |
| `transparent` | boolean |  | PNG: keep transparency (default true). |
| `srgb` | boolean |  | Convert to sRGB and 8 bits first (default true). |
| `scale` | number |  | Resize to this % (e.g. 200 for @2x, 50 for half). |
| `maxWidth` | integer |  |  |
| `maxHeight` | integer |  |  |

## `ps_export_web`

Export the document for web and social: JPG, PNG or WebP, converted to sRGB 8-bit, metadata stripped, resized to fit maxWidth/maxHeight or by scale, with a file-size budget (maxKB lowers the quality step by step). sizes exports several widths at once (e.g. 1920, 1280, 640 with suffixes). Works on a duplicate; the document is not changed.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `documentName` | string |  |  |
| `filePath` | string | yes | Output path; the extension may be left out. |
| `format` | `jpg` · `png` · `webp` |  |  Default: `"jpg"`. |
| `sizes` | object[] |  |  |
| `quality` | integer |  | JPG/WebP quality 1–100 (default 82). |
| `maxKB` | number |  | JPG/WebP: lower the quality step by step until the file fits (down to minQuality). |
| `minQuality` | integer |  | Floor for maxKB (default 45). |
| `lossless` | boolean |  | WebP lossless. |
| `transparent` | boolean |  | PNG: keep transparency (default true). |
| `srgb` | boolean |  | Convert to sRGB and 8 bits first (default true). |
| `scale` | number |  | Resize to this % (e.g. 200 for @2x, 50 for half). |
| `maxWidth` | integer |  |  |
| `maxHeight` | integer |  |  |

## `ps_recipe_social_set`

Recipe: key art → every social format in one call. Creates a new document (the key art is untouched) with one artboard per format (default feed 4:5, story 9:16, square 1:1, link 1.91:1). Layers that fill the canvas or are named Fundo/Background/Foto/Photo cover each artboard; titles, logo and CTA keep their edge or centre, scale with the format and are pulled inside its safe zone. Each artboard is audited (safe zone, contrast, size); with outputFolder, exported one file per artboard. Recompose by hand where the audit or the look asks for it.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `documentName` | string |  | Key art document (default: active). |
| `formats` | `feed4x5` · `square1x1` · `story9x16` · `reelsCover` · `link191` · `youtubeThumb` · `landscape16x9`[] |  |  |
| `overlayScale` | number |  | Extra scale for titles/logo (default 1). |
| `focus` | object |  | Focal point in the key art (0–1). Default: upper third of a layer named Motiv/sujeito/produto, else centre. |
| `outputFolder` | string |  |  |
| `exportFormat` | `png` · `jpg` · `webp` |  | Social exports are PNG by default (user rule). Default: `"png"`. |
| `quality` | integer |  |  |
| `organize` | boolean |  | Group related layers by meaning in each artboard (ps_organize_layers) before exporting. Default: `true`. |

## `ps_audit_document`

Check a Photoshop piece before delivery: canvas vs format, RGB/sRGB/8-bit, text outside the format's safe zone (story bars, reels buttons, thumbnail duration badge), text contrast measured against the real background under each text layer (WCAG 4.5:1, 3:1 for large text), text too small on a phone, layers with default names, empty and hidden layers. Returns findings by severity. The format is guessed from the aspect unless given.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `documentName` | string |  |  |
| `format` | `feed4x5` · `square1x1` · `story9x16` · `reelsCover` · `link191` · `youtubeThumb` · `landscape16x9` |  |  |
| `minContrast` | number |  |  |
| `sampleBackground` | boolean |  |  Default: `true`. |
| `maxTextLayers` | integer |  |  Default: `12`. |

## `ps_list_fonts`

List installed fonts with the PostScript names Photoshop text tools expect (search by family, style or name, e.g. 'cormorant', 'dm sans medium').

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `search` | string |  |  |
| `limit` | integer |  |  Default: `200`. |

## `ps_place_file`

Place an image, PDF, AI or PSD file as a Smart Object layer (embedded, or linked), optionally fitted into a box (x/y = top-left in px; fit contain/cover/width/height) and renamed. Bounds are those of the visible pixels. Swap its contents later with ps_smart_object replaceContents.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `filePath` | string | yes | Absolute path. |
| `name` | string |  |  |
| `x` | number |  |  |
| `y` | number |  |  |
| `width` | number |  |  |
| `height` | number |  |  |
| `fit` | `contain` · `cover` · `width` · `height` · `none` |  |  |
| `linked` | boolean |  |  Default: `false`. |
| `documentName` | string |  | Open document to act on (brought to the front first). Default: the active document. |

## `ps_list_actions`

List every Action set and Action loaded in Photoshop's Actions panel (including the user's own .atn sets).

No parameters.

## `ps_play_action`

Play an Action from the Actions panel by set and action name (as listed by ps_list_actions).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `setName` | string | yes |  |
| `actionName` | string | yes |  |
| `documentName` | string |  | Open document to act on (brought to the front first). Default: the active document. |

## `ps_batch_play`

Photoshop escape hatch: run raw actionJSON descriptors (batchPlay format). Reaches anything Photoshop can record as an action (filters, adjustments, styles, smart objects, menu commands). Runs on the UXP panel, and on ExtendScript (CEP / COM) through a built-in actionJSON → ActionDescriptor converter. File paths may be plain absolute paths in {_path}. Check 'errorCount': failures come back as { _obj: 'error' } entries.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `descriptors` | object[] | yes | Array of batchPlay ActionDescriptor objects (each having _obj, _target, etc.). |
| `options` | object |  |  Default: `{"synchronousExecution":false}`. |
| `commandName` | string |  |  Default: `"MCP BatchPlay"`. |
| `documentName` | string |  | Open document to act on (brought to the front first). Default: the active document. |

## `ps_execute_uxp_script`

Photoshop UXP escape hatch: execute arbitrary async JavaScript inside Photoshop's UXP environment with `app`, `core`, `action`, `batchPlay`, `uxp`, `constants` and `executionContext` in scope, inside an executeAsModal block. Requires the Photoshop UXP panel.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `code` | string | yes | JavaScript async body to execute. You can use `app`, `core`, `action`, `uxp`, and `return` any JSON-serializable value. |
| `commandName` | string |  |  Default: `"MCP UXP Script"`. |

## `ps_execute_extendscript`

Photoshop ExtendScript escape hatch: execute arbitrary .jsx (ES3) code in Photoshop. Runs through the CEP panel or, with no panel at all, through Windows COM DoJavaScript (the UXP panel cannot run ExtendScript, so the command is routed past it automatically).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `code` | string | yes | ExtendScript (ES3) code to evaluate in Photoshop. The last evaluated expression is returned. |

## `ps_recolor_object`

Recolour an object that already has colour (shirt, product, wall) the controllable way: one masked group with three separate adjustments — hue (solid fill in Hue blend mode), saturation (Hue/Saturation) and luminosity (Curves on RGB). Avoids the Color blend mode, which over-saturates. Give a mask PNG (white = object) or select the object first.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `documentName` | string |  |  |
| `color` | string | yes | Target colour '#RRGGBB' (only its hue is used). |
| `saturation` | integer |  | Hue/Saturation saturation, e.g. -33 for red fabric to brand purple. |
| `curve` | number[][] |  | RGB curve points [[in,out],…], e.g. [[0,0],[125,105],[255,231]] to darken. |
| `maskPath` | string |  | PNG with the object in white (same size as the document). |
| `feather` | number |  | Mask feather in px (2 is a good start; dilate the mask 2–3 px first to avoid a fringe). |
| `groupName` | string |  |  |

## `ps_blend_if`

Blend If (Layer Style > Blending Options) on a layer: split the underlying-layer black/white sliders so shadows and texture of what is below show through — e.g. a white logo on fabric: opacity 90, underlyingBlack [15, 75]. Not readable through layer 'get'; set it here.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `documentName` | string |  |  |
| `layerName` | string | yes |  |
| `underlyingBlack` | integer[] |  |  |
| `underlyingWhite` | integer[] |  |  |
| `thisBlack` | integer[] |  |  |
| `thisWhite` | integer[] |  |  |
| `opacity` | number |  |  |

## `ps_center_text_in_shape`

Centres a text layer inside a shape layer (button, pill, tag, card) by the CAP HEIGHT of the text, which is how the eye reads it: the ink box of a line with descenders or accents sits off-centre. Multi-line point text is centred from the first cap top to the last baseline; paragraph text falls back to the ink box. Returns the space left on each side; offsetY nudges it optically.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `documentName` | string |  |  |
| `textLayerName` | string |  |  |
| `textLayerId` | integer |  |  |
| `shapeLayerName` | string |  |  |
| `shapeLayerId` | integer |  |  |
| `mode` | `capHeight` · `ink` |  |  Default: `"capHeight"`. |
| `horizontal` | boolean |  |  Default: `true`. |
| `vertical` | boolean |  |  Default: `true`. |
| `offsetX` | number |  | Extra px to the right (optical adjustment). |
| `offsetY` | number |  | Extra px downwards (optical adjustment). |

## `ps_place_logo`

Places the brand logo (PNG/SVG/AI/PSD file from the kit) as a Smart Object in a corner of the document or of one artboard, sized as a fraction of the width and kept away from the edges by the house margin (default 18 % wide, margin 6 % of the short side).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `documentName` | string |  |  |
| `filePath` | string | yes | Logo file (use the version for the background: light logo on dark art and the reverse). |
| `artboard` | string |  | Artboard name (default: the whole document). |
| `corner` | `top-left` · `top-center` · `top-right` · `middle-left` · `middle-center` · `middle-right` · `bottom-left` · `bottom-center` · `bottom-right` |  |  Default: `"bottom-right"`. |
| `widthFraction` | number |  | Logo width as a fraction of the area width (default 0.18). |
| `width` | number |  | Logo width in px (wins over widthFraction). |
| `maxHeightFraction` | number |  |  |
| `marginFraction` | number |  | Margin as a fraction of the short side (default 0.06). |
| `margin` | number |  | Margin in px (wins over marginFraction). |
| `opacity` | number |  |  |
| `name` | string |  |  |

## `ps_create_shape`

Live shape layer: rounded rectangle (buttons, badges, cards), rectangle or ellipse, with an editable fill colour. Position and size in pixels (top-left x, y). The corner radius stays editable in Properties; radius = height / 2 makes a pill button.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `documentName` | string |  |  |
| `shape` | `rounded` · `rectangle` · `ellipse` |  | Default rounded. |
| `x` | number | yes |  |
| `y` | number | yes |  |
| `width` | number | yes |  |
| `height` | number | yes |  |
| `radius` | number |  | Corner radius in px (rounded); capped at half the smaller side. |
| `color` | string |  | '#RRGGBB' (default black). |
| `opacity` | number |  |  |
| `name` | string |  |  |

## `ps_recipe_remove_background`

Recipe: cut out the subject of a photo in one call. Works on a duplicate of the whole document: one layer turned into a Smart Object, Photoshop's Remove Background (or Select Subject) applied as an editable layer mask, optional solid background colour and crop to the subject with padding, PNG with transparency by default. Returns the subject box and coverage with warnings (nothing removed, tiny subject) and a preview. Hair and glass edges still need Select and Mask by hand.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `filePath` | string |  | Image file to open (closed again unchanged). Default: documentName or the active document. |
| `documentName` | string |  |  |
| `method` | `removeBackground` · `selectSubject` |  | Default removeBackground (falls back to selectSubject). |
| `smartObject` | boolean |  | Convert to Smart Object first (default true). |
| `background` | string |  | '#RRGGBB' fill layer under the subject; default none (transparent). |
| `cropToSubject` | boolean |  | Trim to the subject (less empty transparent area: easier to edit after placing in Illustrator or InDesign). Leave off when the full frame must line up with the original photo. |
| `closeAfter` | boolean |  | With outputPath: close the working copy after writing the file. |
| `padding` | number |  | Pixels around the subject when cropping (default 0). |
| `outputPath` | string |  | Image file to write (extension optional). PNG by default. |
| `format` | `png` · `jpg` · `webp` |  |  Default: `"png"`. |
| `quality` | integer |  |  |
| `psdPath` | string |  | Also save the layered result as a PSD copy. |

## `ps_recipe_pop_out`

Recipe: 'out of bounds' / pop-out portrait in one call (also asked for as: person coming out of a circle, breaking the frame, 3D pop-out). Works on a duplicate of the document, or in the document itself on a named layer (inPlace / layerName) when the photo is part of a layout in progress. Cuts the subject out, puts a shape behind it (circle by default), clips the subject to the shape so the shape crops the body, then adds an unclipped copy of the subject whose mask hides everything below a cut line: the head and shoulders stick out of the shape. Layers, in one group: Subject top, Subject (clipped), Shape — all editable; move the Shape or repaint the masks to adjust. By default the shape is 1.5× the subject's width, centred on it, with its top 22 % of its height below the top of the subject, and the cut line at the middle of the shape. If an arm or object leaves the shape below the cut line it is cropped by the shape: lower cutAt or widen the shape. Returns the geometry and a preview.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `filePath` | string |  | Image file to open (closed again unchanged). Default: documentName or the active document. |
| `documentName` | string |  |  |
| `inPlace` | boolean |  | Build it in the open document itself, on the active layer or the one named, keeping its place in the stack (the photo inside a layout in progress). Default: work on a duplicate. |
| `layerName` | string |  | Photo layer to use (implies inPlace). |
| `layerId` | integer |  |  |
| `cutout` | `auto` · `yes` · `no` |  | auto: keep a layer mask that is already there, else remove the background; no: take the layer as it is (already transparent). |
| `keepBackground` | boolean |  | Show the original photo, background included, inside the shape (the top copy stays cut out). |
| `method` | `removeBackground` · `selectSubject` |  | Cut-out method. Default removeBackground (falls back to selectSubject). |
| `shape` | `circle` · `ellipse` · `rectangle` · `roundedRectangle` |  | Default circle. |
| `shapeColor` | string |  | '#RRGGBB' fill of the shape. |
| `shapeBounds` | object |  | Exact box of the shape in px. Default: derived from the subject (shapeScale, overflow). |
| `shapeScale` | number |  | Shape width as a multiple of the subject's width (default 1.5). |
| `shapeAspect` | number |  | Height / width for ellipse and rectangles (default 1). Ignored for circle. |
| `radius` | number |  | Corner radius in px for roundedRectangle. |
| `overflow` | number |  | How far the subject sticks out above the shape, as a share of the shape's height (default 0.22). |
| `cutAt` | number |  | Cut line of the top copy, 0 = top of the shape, 1 = bottom (default 0.5). Above it the subject may leave the shape; below it the shape crops it. |
| `background` | string |  | '#RRGGBB' fill layer under everything; default none (transparent). |
| `groupName` | string |  |  |
| `outputPath` | string |  | Image file to write (extension optional). PNG by default. |
| `format` | `png` · `jpg` · `webp` |  |  Default: `"png"`. |
| `quality` | integer |  |  |
| `psdPath` | string |  | Also save the layered result as a PSD copy. |

## `ps_recipe_product_shot`

Recipe: product photo → finished product shot in one call. Cuts the product out (skipped when the file already has transparency), opens a new document in the format (default square 1:1) with a radial-gradient or solid background from the brand kit, fits the product as a Smart Object inside the safe area (resting on the lower part by default) and adds a soft contact shadow. Layers: Produto, Sombra, Fundo — all editable. PNG by default.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `filePath` | string |  | Image file to open (closed again unchanged). Default: documentName or the active document. |
| `documentName` | string |  |  |
| `format` | `feed4x5` · `square1x1` · `story9x16` · `reelsCover` · `link191` · `youtubeThumb` · `landscape16x9` |  | Canvas format (default square1x1). |
| `width` | integer |  | Custom canvas width in px (with height). |
| `height` | integer |  |  |
| `kitPath` | string |  | kit-de-marca.json: the surface colour becomes the background. |
| `background` | string |  | '#RRGGBB' background (overrides the kit). |
| `backgroundStyle` | `solid` · `gradient` |  | Default gradient (lighter centre). |
| `cutout` | `auto` · `yes` · `no` |  | auto: cut out unless the image already has transparency. |
| `method` | `removeBackground` · `selectSubject` |  |  |
| `fill` | number |  | Share of the safe area the product may take (default 0.72). |
| `anchor` | `floor` · `center` |  | floor: product rests on the lower part (default); center. |
| `shadow` | `contact` · `none` |  |  |
| `shadowOpacity` | number |  |  |
| `documentTitle` | string |  |  |
| `outputPath` | string |  | Image file to write (extension optional). PNG by default. |
| `exportFormat` | `png` · `jpg` · `webp` |  |  Default: `"png"`. |
| `quality` | integer |  |  |
| `psdPath` | string |  | Also save the layered result as a PSD copy. |
