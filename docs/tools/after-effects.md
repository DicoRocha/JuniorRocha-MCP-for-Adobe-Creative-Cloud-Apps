# After Effects

Compositions, layers, keyframes, easing, effects, text animators, transitions and audits.

[← All tools](README.md)

| Tool | What it does |
|---|---|
| [`ae_get_project_info`](#ae_get_project_info) | Get After Effects project metadata, file path, color depth, item counts, all compositions, and render queue summary. |
| [`ae_manage_project`](#ae_manage_project) | Create a new project, open/save an .aep project, import footage/audio/image sequences or layered PSD/AI files, create folders, purge caches, or change project settings… |
| [`ae_list_compositions`](#ae_list_compositions) | List all compositions in the active After Effects project with resolution, duration, frame rate, and layer count. |
| [`ae_create_composition`](#ae_create_composition) | Create a new composition in Adobe After Effects and optionally open it in the viewer. |
| [`ae_modify_composition`](#ae_modify_composition) | Modify composition settings (dimensions, duration, fps, background color, work area, motion blur) or precompose layers. |
| [`ae_get_comp_frame_preview`](#ae_get_comp_frame_preview) | Multimodal Visual Feedback: Render a specific frame of an After Effects composition to PNG (`saveFrameToPng`) and return it as inline base64 ImageContent. |
| [`ae_set_easing`](#ae_set_easing) | Ease keyframes that already exist: presets easyEase (33/33, F9), gentle (45), smooth (60), strong (85, expo-like), snappy (95 in / 20 out), linear, hold, or custom… |
| [`ae_manage_markers`](#ae_manage_markers) | Composition or layer markers: list, add (time, comment, duration, chapter, url, label colour 0–16) or remove (by time, or all). |
| [`ae_contact_sheet`](#ae_contact_sheet) | Contact sheet of a composition: renders frames (given times, or `count` frames spread over the work area) and lays them out in one PNG grid — see the whole animation at once… |
| [`ae_import_vector_as_shapes`](#ae_import_vector_as_shapes) | Bring Illustrator artwork into After Effects as editable shape layers: imports the .ai (or PDF/EPS) as a comp with one layer per Illustrator layer, runs Create Shapes from… |
| [`ae_audit_motion`](#ae_audit_motion) | Check a composition before rendering: expressions with errors, missing footage, linear keyframes on motion properties (position, scale, anchor, paths, text animators — opacity… |
| [`ae_camera_transition`](#ae_camera_transition) | Camera-style transition over a cut inside a comp (the fast, blurred looks of short-form video): whip (whip pan with directional blur), zoom (zoom blur in/out), spin (180° spin… |
| [`ae_paper_transition`](#ae_paper_transition) | Paper tear or burn between a layer and whatever is below it, built inside After Effects (no matte footage): the outgoing layer gets Motion Tile + Linear Wipe + Roughen Edges,… |
| [`ae_time_remap`](#ae_time_remap) | Time on a footage or pre-comp layer: freeze a frame (hold one source time for the whole layer), set time-remap keyframes for speed changes ({ time in comp seconds,… |
| [`ae_morph_shapes`](#ae_morph_shapes) | Morph one shape layer into another (logo to icon, circle to star): both outlines are resampled to the same number of points, with the same winding and aligned start, then keyed… |
| [`ae_word_captions`](#ae_word_captions) | Word-by-word animated captions in a comp (Reels/TikTok/Shorts): one text layer per block of 1–4 words; the word being spoken changes colour at its real time (text animator +… |
| [`ae_pop_words`](#ae_pop_words) | Beat-synced words in 3D (lyric video, kinetic typography on music): one 3D text layer per word with a layer marker on the word's time and a scale expression that reaches 100 %… |
| [`ae_measure_landings`](#ae_measure_landings) | Lyric-video camera gate, part 1: where each word sits on screen at its own time. |
| [`ae_audit_camera`](#ae_audit_camera) | Lyric-video camera gate, part 2: samples the active camera frame by frame (world position and view direction, parents and expressions included) and reports stretches where it… |
| [`ae_text_ring`](#ae_text_ring) | A line of text as a ring of standing letters in 3D (text on a circular path with per-character 3D). |
| [`ae_create_lower_third`](#ae_create_lower_third) | Recipe: lower third in one call — name + role in the brand fonts, a box that resizes to the text and an accent bar (expressions on sourceRectAtTime), eased entrance and exit,… |
| [`ae_create_title_card`](#ae_create_title_card) | Recipe: title card in one call — kicker in the label font and accent colour, title whose words rise and fade in (text animator by words), an accent line that draws in, brand… |
| [`ae_create_counter`](#ae_create_counter) | Recipe: animated number in one call — counts from → to with a strong ease (slider 'Valor' + Source Text expression), prefix/suffix, decimals, Brazilian separators by default… |
| [`ae_create_logo_reveal`](#ae_create_logo_reveal) | Recipe: logo reveal in one call — an accent circle grows behind, the logo (png/ai/psd) scales in with a strong ease and holds still for the last second or more; brand background. |
| [`ae_create_transition`](#ae_create_transition) | Recipe: transition kit in one call — scene A → scene B (two placeholder precomps to replace) with one move in the brand colours: wipe (accent band crosses the frame), circle… |
| [`ae_get_layers`](#ae_get_layers) | List all layers in an After Effects composition (1-based index, name, type, timing, 3D status, parent, effect count). |
| [`ae_create_layer`](#ae_create_layer) | Create a new Text, Solid, Adjustment, Null, Camera, Light, or empty Shape layer in an After Effects composition. |
| [`ae_create_shape_layer`](#ae_create_shape_layer) | Create a parametric or custom Bezier vector Shape Layer in After Effects with Fill, Stroke, and optional Trim Paths. |
| [`ae_modify_layer`](#ae_modify_layer) | Update layer transform (position, scale, rotation, opacity, anchorPoint), timing (inPoint, outPoint, startTime, stretch), parenting, 3D state, motionBlur, or duplicate/delete a… |
| [`ae_get_property_tree`](#ae_get_property_tree) | Universal Property Navigator: Recursively inspect all PropertyGroups and Properties on an After Effects layer (Transform, Effects, Masks, Vector Contents, Text Animators,… |
| [`ae_set_property`](#ae_set_property) | Set the static value of any property or deep sub-property (effect parameter, shape transform, mask feather, text property, 3D material) by its propertyPath. |
| [`ae_set_keyframes`](#ae_set_keyframes) | Add or replace multiple keyframes on any After Effects property with support for Linear, Hold, and Bezier (easeIn, easeOut, easeInOut) temporal interpolation. |
| [`ae_set_expression`](#ae_set_expression) | Apply, update, or disable an After Effects expression on any property and automatically validate `expressionError`. |
| [`ae_list_effects`](#ae_list_effects) | Search every effect installed in this After Effects (native and third-party) by name, matchName or category. |
| [`ae_apply_effect`](#ae_apply_effect) | Apply any installed effect (native or third-party) to a layer by matchName or display name and set its parameters. |
| [`ae_manage_effect`](#ae_manage_effect) | List, describe, enable/disable, rename, duplicate, reorder or remove effects already on an After Effects layer. |
| [`ae_list_presets`](#ae_list_presets) | Find After Effects animation presets (.ffx): the built-in Presets folder, every 'User Presets' folder and any extra folders. |
| [`ae_export_mogrt`](#ae_export_mogrt) | Turn a comp into a Motion Graphics template for Premiere: expose properties in Essential Graphics (text layers' Source Text by default; also colours, sliders, checkboxes) under… |
| [`ae_apply_preset`](#ae_apply_preset) | Apply an animation preset (.ffx) to one layer. |
| [`ae_add_text_animator`](#ae_add_text_animator) | Add a text animator to a text layer: animated properties (position, scale, rotation, opacity, tracking, blur, colors), a range selector (start/end/offset, based on… |
| [`ae_add_mask`](#ae_add_mask) | Add a mask to a layer: rectangle, ellipse or a custom path (layer coordinates, origin at the layer's top-left), with mode, feather, expansion, opacity and inversion. |
| [`ae_render_queue`](#ae_render_queue) | Add a composition to the After Effects Render Queue, configure templates and output path, and optionally start rendering or send to Adobe Media Encoder. |
| [`ae_execute_menu_command`](#ae_execute_menu_command) | Execute any After Effects menu command by its menu string (resolved via `app.findMenuCommandId`) or numeric command ID. |
| [`ae_execute_extendscript`](#ae_execute_extendscript) | After Effects ExtendScript escape hatch: execute arbitrary ExtendScript (.jsx) code inside After Effects wrapped in an automatic Undo Group (`app.beginUndoGroup` /… |

## `ae_get_project_info`

Get After Effects project metadata, file path, color depth, item counts, all compositions, and render queue summary.

No parameters.

## `ae_manage_project`

Create a new project, open/save an .aep project, import footage/audio/image sequences or layered PSD/AI files, create folders, purge caches, or change project settings (bitsPerChannel: 16 removes banding in soft gradients) in After Effects.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `operation` | `new` · `open` · `save` · `import` · `createFolder` · `purge` · `settings` | yes |  |
| `bitsPerChannel` | number |  | new / settings: project colour depth. |
| `filePath` | string |  | Absolute path for open, save, or import. |
| `importAs` | `footage` · `comp` · `compCroppedLayers` |  | How to import multi-layer PSD/AI files. Default: `"footage"`. |
| `sequence` | boolean |  | Import numbered images as an image sequence. Default: `false`. |
| `folderName` | string |  | Folder name when operation='createFolder'. |
| `discardChanges` | boolean |  | new/open: close the current project without saving when it has unsaved changes (otherwise PROJECT_DIRTY). |

## `ae_list_compositions`

List all compositions in the active After Effects project with resolution, duration, frame rate, and layer count.

No parameters.

## `ae_create_composition`

Create a new composition in Adobe After Effects and optionally open it in the viewer.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `name` | string |  | Name of the composition. Default: `"Main Comp"`. |
| `width` | integer |  |  Default: `1920`. |
| `height` | integer |  |  Default: `1080`. |
| `pixelAspect` | number |  |  Default: `1`. |
| `duration` | number |  | Duration in seconds. Default: `10`. |
| `frameRate` | number |  | Frames per second. Default: `30`. |
| `bgColor` | number[] |  | Normalized RGB array [r, g, b] where each channel is between 0.0 and 1.0. Default: `[0.05,0.05,0.05]`. |
| `openInViewer` | boolean |  |  Default: `true`. |

## `ae_modify_composition`

Modify composition settings (dimensions, duration, fps, background color, work area, motion blur) or precompose layers.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  | Target composition name (defaults to active composition). |
| `compIndex` | integer |  | 1-based item index in project. |
| `newName` | string |  |  |
| `width` | integer |  |  |
| `height` | integer |  |  |
| `duration` | number |  |  |
| `frameRate` | number |  |  |
| `bgColor` | number[] |  | Normalized RGB array [r, g, b] where each channel is between 0.0 and 1.0. |
| `workAreaStart` | number |  |  |
| `workAreaDuration` | number |  |  |
| `motionBlur` | boolean |  |  |
| `precomposeLayerIndices` | integer[] |  | 1-based layer indices to precompose into a nested composition. |
| `precomposeLayerNames` | string[] |  | Layer names to precompose (instead of indices). |
| `precompName` | string |  |  |
| `moveAllAttributes` | boolean |  |  Default: `true`. |

## `ae_get_comp_frame_preview`

Multimodal Visual Feedback: Render a specific frame of an After Effects composition to PNG (`saveFrameToPng`) and return it as inline base64 ImageContent.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  |  |
| `compIndex` | integer |  |  |
| `time` | number |  | Time in seconds to sample (defaults to current playhead time). |
| `outputPath` | string |  | Optional custom output path for the PNG. |
| `includeImageContent` | boolean |  |  Default: `true`. |

## `ae_set_easing`

Ease keyframes that already exist: presets easyEase (33/33, F9), gentle (45), smooth (60), strong (85, expo-like), snappy (95 in / 20 out), linear, hold, or custom influenceIn/influenceOut (0.1–100) and speed. Targets every animated property of the given layers (names or indices; default: selected layers, else all) or one propertyPath, optionally only keys in fromTime–toTime or keyIndices; side 'in'/'out' keeps the other side as it is.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  |  |
| `compIndex` | integer |  |  |
| `layerNames` | string[] |  |  |
| `layerIndices` | integer[] |  |  |
| `propertyPath` | string or number[] |  | e.g. ['Transform','Position']; default: all animated properties. |
| `preset` | `easyEase` · `gentle` · `smooth` · `strong` · `snappy` · `linear` · `hold` · `custom` |  |  Default: `"easyEase"`. |
| `influenceIn` | number |  |  |
| `influenceOut` | number |  |  |
| `speed` | number |  | Speed at the key (default 0 = comes to rest). |
| `side` | `both` · `in` · `out` |  |  Default: `"both"`. |
| `fromTime` | number |  |  |
| `toTime` | number |  |  |
| `keyIndices` | integer[] |  |  |

## `ae_manage_markers`

Composition or layer markers: list, add (time, comment, duration, chapter, url, label colour 0–16) or remove (by time, or all). Use them for beats, script blocks, cut points and handoff notes; layer markers when a layer is given.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  |  |
| `compIndex` | integer |  |  |
| `layerName` | string |  |  |
| `layerIndex` | integer |  |  |
| `operation` | `list` · `add` · `remove` |  |  Default: `"list"`. |
| `markers` | object[] |  |  |
| `times` | number[] |  | remove: markers at these times. |
| `all` | boolean |  | remove: every marker. |

## `ae_contact_sheet`

Contact sheet of a composition: renders frames (given times, or `count` frames spread over the work area) and lays them out in one PNG grid — see the whole animation at once (timing, layout, legibility) in a single look. Returns the image and the times in reading order.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  |  |
| `compIndex` | integer |  |  |
| `times` | number[] |  |  |
| `aroundSeconds` | number |  | Filmstrip of consecutive frames centred on this time (a cut, a word landing): `count` frames, `stepSeconds` apart. |
| `stepSeconds` | number |  | With aroundSeconds: time between frames (default 1/60 s). |
| `count` | integer |  |  Default: `12`. |
| `columns` | integer |  |  |
| `cellWidth` | integer |  | Width of each frame in the sheet, px (default 320). |
| `outputPath` | string |  |  |
| `includeImageContent` | boolean |  |  Default: `true`. |

## `ae_import_vector_as_shapes`

Bring Illustrator artwork into After Effects as editable shape layers: imports the .ai (or PDF/EPS) as a comp with one layer per Illustrator layer, runs Create Shapes from Vector Layer on each and removes the footage originals. Name the Illustrator layers first (one per part that will move). Then animate with Trim Paths, ae_set_keyframes, ae_set_easing.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `filePath` | string | yes | Absolute path of the .ai / .pdf / .eps. |
| `compName` | string |  |  |
| `deleteOriginals` | boolean |  |  Default: `true`. |

## `ae_audit_motion`

Check a composition before rendering: expressions with errors, missing footage, linear keyframes on motion properties (position, scale, anchor, paths, text animators — opacity is fine linear), text layers on screen for less than ~0.3 s per word + 0.5 s, and gradients in an 8-bpc project. Returns findings by severity.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  |  |
| `compIndex` | integer |  |  |
| `secondsPerWord` | number |  |  |
| `holdSeconds` | number |  |  |

## `ae_camera_transition`

Camera-style transition over a cut inside a comp (the fast, blurred looks of short-form video): whip (whip pan with directional blur), zoom (zoom blur in/out), spin (180° spin blur), shake (impact shake that decays, no keyframes on position), glitch (digital tear: horizontal jumps + square wave warp that peak on the cut) or flash (white/colour flash). Non-destructive: one adjustment layer across the cut with Motion Tile + Transform + blur, an 'Intensidade' slider to tune the strength in Effect Controls, extreme eases (90 % influence). The two clips stay untouched below.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  |  |
| `compIndex` | integer |  |  |
| `cutSeconds` | number | yes | Time of the cut between the two clips, in comp seconds. |
| `style` | `whip` · `zoom` · `spin` · `shake` · `glitch` · `flash` |  |  Default: `"whip"`. |
| `direction` | `left` · `right` · `up` · `down` · `in` · `out` |  | whip: left/right/up/down; zoom: in/out; spin: left/right. |
| `durationSeconds` | number |  | Whole move, centred on the cut (default 0.5 s; shake: starts at the cut, default 0.6 s). |
| `intensity` | number |  | Starting value of the Intensidade slider (default 100). |
| `color` | string |  | flash: '#RRGGBB' (default white). |

## `ae_paper_transition`

Paper tear or burn between a layer and whatever is below it, built inside After Effects (no matte footage): the outgoing layer gets Motion Tile + Linear Wipe + Roughen Edges, and a paper-coloured strip (tear, with shadow) or a glowing ember strip (burn) follows the edge. The frame stays intact before the transition. Tune 'MCP Borda' (Border, Scale) and the wipe angle in Effect Controls. The burn adds a charred band and a glowing ember along a straight front (not an organic fire).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  |  |
| `compIndex` | integer |  |  |
| `layerName` | string |  | The outgoing layer (on top of the next scene). |
| `layerIndex` | integer |  |  |
| `startSeconds` | number | yes |  |
| `durationSeconds` | number |  | Default 0.8 s. |
| `style` | `tear` · `burn` |  |  Default: `"tear"`. |
| `angle` | number |  | Wipe angle in degrees (default 90; 0 = vertical travel). |
| `edgeColor` | string |  | '#RRGGBB' of the paper / ember strip (default off-white / orange). |
| `roughness` | number |  | Roughen Edges border in px (default 16 tear, 30 burn). |
| `seed` | integer |  |  |
| `trimLayer` | boolean |  | Trim the outgoing layer at the end of the transition (default true). |

## `ae_time_remap`

Time on a footage or pre-comp layer: freeze a frame (hold one source time for the whole layer), set time-remap keyframes for speed changes ({ time in comp seconds, sourceSeconds }), turn time remapping off, and set stretch (200 = half speed) and frame blending (frameMix or pixelMotion smooth slow motion). Shape, text and solid layers cannot be time-remapped.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  |  |
| `compIndex` | integer |  |  |
| `layerName` | string |  |  |
| `layerIndex` | integer |  |  |
| `operation` | `freeze` · `keyframes` · `disable` · `settings` |  |  Default: `"freeze"`. |
| `sourceSeconds` | number |  | freeze: the frame to hold, in the layer's own time. |
| `keyframes` | object[] |  |  |
| `extendTo` | number |  | keyframes: move the layer's out point to this comp time (slow motion needs a longer layer). |
| `stretch` | number |  | Percent: 100 normal, 200 half speed, 50 double speed. |
| `frameBlending` | `none` · `frameMix` · `pixelMotion` |  |  |

## `ae_morph_shapes`

Morph one shape layer into another (logo to icon, circle to star): both outlines are resampled to the same number of points, with the same winding and aligned start, then keyed on the first layer's path together with the fill colour; the first layer ends and the second starts at the end of the morph. Works with paths, rectangles and ellipses (not polystars); only the first path of each layer is morphed, and parented layers are refused. Text: Create Shapes from Text first. Check a frame in the middle with ae_get_comp_frame_preview.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  |  |
| `compIndex` | integer |  |  |
| `fromLayerName` | string |  |  |
| `fromLayerIndex` | integer |  |  |
| `toLayerName` | string |  |  |
| `toLayerIndex` | integer |  |  |
| `startSeconds` | number | yes |  |
| `durationSeconds` | number |  | Default 0.6 s. |
| `points` | integer |  | Outline points (default 160; more = sharper corners). |
| `morphColor` | boolean |  | Key the fill colour too (default true). |
| `hideTarget` | boolean |  | End the first layer and start the second at the end of the morph (default true). |

## `ae_word_captions`

Word-by-word animated captions in a comp (Reels/TikTok/Shorts): one text layer per block of 1–4 words; the word being spoken changes colour at its real time (text animator + expression selector), words not yet said are dimmed, each block pops in, optional pill behind the text (sized with sourceRectAtTime, centred on the cap height) and the block never exceeds the safe width. Give wordsPath (<name>.words.json from media_transcribe with wordTimestamps) or words; styles: 'centro' (default, clean, shadow), 'pilula' (brand pill behind), 'impacto' (bigger, thick outline, strong pop), 'leitura' (no colour change, words light up as read).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  |  |
| `compIndex` | integer |  |  |
| `wordsPath` | string |  | JSON with { words: [{ word, start, end }] } (times in seconds of the comp). |
| `words` | object[] |  |  |
| `style` | `centro` · `pilula` · `impacto` · `leitura` |  |  Default: `"centro"`. |
| `font` | string |  | PostScript name of the brand's heavy font (e.g. 'Satoshi-Black'). |
| `fontSize` | number |  |  |
| `baseColor` | string |  | '#RRGGBB' (default white). |
| `activeColor` | string |  | Colour of the spoken word (brand accent; default '#FFC107'). |
| `pillColor` | string |  | Pill colour for style 'pilula' (brand colour). |
| `upperCase` | boolean |  |  Default: `true`. |
| `maxWords` | integer |  |  Default: `3`. |
| `maxChars` | integer |  |  Default: `18`. |
| `offsetSeconds` | number |  | Shift all times (the clip starts later in the comp). |
| `y` | number |  | Baseline y in px (default 72 % of the comp height; keep clear of faces and of the platform UI). |
| `singleLayer` | boolean |  | One text layer for the whole video (Source Text picks the block by time): the style is edited in one place. Default: one layer per block. |
| `replace` | object |  | Fix words the engine misheard: { 'beta.': 'Beta.' } (case-insensitive match on the word). |

## `ae_pop_words`

Beat-synced words in 3D (lyric video, kinetic typography on music): one 3D text layer per word with a layer marker on the word's time and a scale expression that reaches 100 % exactly ON the marker (damped overshoot after it), plus a camera that travels from word to word so that every landing sits at a different place and size of the frame (inside the safe zone). Give wordsPath (<name>.words.json from media_transcribe with wordTimestamps, after the person checked the text) or words. Then check with ae_measure_landings and ae_audit_camera.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  |  |
| `compIndex` | integer |  |  |
| `wordsPath` | string |  | JSON with { words: [{ word, start, end }] } (seconds of the comp). |
| `words` | object[] |  |  |
| `offsetSeconds` | number |  | Shift all times (the song starts later in the comp). |
| `font` | string |  | PostScript name (default Arial-BoldMT). |
| `fonts` | string[] |  | PostScript names cycled word by word. |
| `fontSize` | number |  | Base size in px (default 16 % of the comp width). |
| `sizePattern` | number[] |  | Multipliers cycled word by word (default 1, 0.62, 1.3, 0.8, 1.12, 0.55): scale contrast between neighbours. |
| `colors` | string[] |  | '#RRGGBB' cycled word by word (default white). |
| `upperCase` | boolean |  |  Default: `true`. |
| `camera` | boolean |  | Create the travelling camera (false: words land directly on their screen targets, no camera). Default: `true`. |
| `stepZ` | number |  | Depth between consecutive words in px (default 900). |
| `minGap` | number |  | Words closer than this (seconds) share a camera stop and stack as lines of one block (default 0.4; 0 = one camera move per word, only for slow lyrics). |
| `maxWordsPerStop` | integer |  | Most words in one stop (default 5); a longer run is cut at its largest pause. |
| `holdStops` | integer |  | A word fades out when this many later stops have started (default 1; 0 = stays, the camera flies past it). |
| `travel` | number |  | Seconds the camera takes between two stops (default 0.45): it holds on a block and leaves late. |
| `lead` | number |  | Seconds of slam before the landing (default 0.08). |
| `overshoot` | number |  | Overshoot after the landing (default 0.14). |
| `rotationSettle` | number |  | Degrees of rotation that settle after the landing (default 4; alternates sign). |
| `drift` | number |  | Slow camera drift in px so a hold still breathes (default 10; 0 = off). |
| `namePrefix` | string |  | Layer name prefix (default 'Palavra '). |

## `ae_measure_landings`

Lyric-video camera gate, part 1: where each word sits on screen at its own time. Reads the projected centre and ink size of every word layer (layers named with the prefix, time = first layer marker) through the active camera, without rendering, and reports the spread per block of 10 consecutive words (floors on a 1080x1920 frame: 150 px in x, 250 px in y; 120 px in x when a block holds a wide word), consecutive words on the same spot and size, the number of framings and words outside the safe zone. pass=false lists what to move.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  |  |
| `compIndex` | integer |  |  |
| `namePrefix` | string |  | Layers whose name starts with this (default 'Palavra '). |
| `layerNames` | string[] |  | Exact layer names instead of the prefix. |
| `blockSize` | integer |  |  Default: `10`. |
| `includeRows` | boolean |  | Return the table of every word (id, frame, cx, cy, inkW, inkH). Default: `false`. |

## `ae_audit_camera`

Lyric-video camera gate, part 2: samples the active camera frame by frame (world position and view direction, parents and expressions included) and reports stretches where it stands still for 0.25 s or more, and jumps that are not declared cuts. A motion piece with a 3D camera should return pass=true before it is rendered.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  |  |
| `compIndex` | integer |  |  |
| `from` | number |  |  |
| `to` | number |  |  |
| `stepFrames` | integer |  |  Default: `1`. |
| `minStaticSeconds` | number |  |  Default: `0.25`. |
| `cuts` | number[] |  | Times of the declared hidden cuts (a jump there is expected). |

## `ae_text_ring`

A line of text as a ring of standing letters in 3D (text on a circular path with per-character 3D). With `times` (one per word) the ring spins so that each word is in front at its time, arriving exactly on it; otherwise spinDegreesPerSecond gives a constant spin. Returns the angle of every word. First run: check a frame and calibrate standAngle / frontOffsetDegrees / direction.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  |  |
| `compIndex` | integer |  |  |
| `text` | string | yes | The whole line; words are split on spaces. |
| `times` | number[] |  | Time of each word, in order (seconds of the comp). |
| `spinDegreesPerSecond` | number |  |  |
| `radius` | number |  | px (default 60 % of the comp width). |
| `arcDegrees` | number |  | Arc the line fills when fit is on. Default: `300`. |
| `fit` | boolean |  | Resize the font so the line fills arcDegrees. Default: `true`. |
| `font` | string |  |  |
| `fontSize` | number |  |  |
| `color` | string |  | '#RRGGBB' (default white). |
| `upperCase` | boolean |  |  Default: `true`. |
| `center` | number[] |  | World position of the ring centre [x, y, z]. |
| `standAngle` | number |  | Per-character X rotation that stands the letters up (default -90). |
| `frontOffsetDegrees` | number |  | Added to every spin angle: which point of the ring faces the camera (default 180, measured live for a camera on -z). |
| `direction` | `cw` · `ccw` |  |  Default: `"cw"`. |
| `name` | string |  |  |

## `ae_create_lower_third`

Recipe: lower third in one call — name + role in the brand fonts, a box that resizes to the text and an accent bar (expressions on sourceRectAtTime), eased entrance and exit, transparent comp. Then audited (ae_audit_motion); with mogrtPath, exported as .mogrt with Nome/Funcao fields for pr_insert_mogrt.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `kitPath` | string |  | 00_briefing/kit-de-marca.json (cores por uso, tipos titulo/corpo/rotulo). |
| `colors` | object |  | '#RRGGBB' per role; overrides the kit. |
| `fonts` | object |  | PostScript names (ps_list_fonts). |
| `format` | `feed4x5` · `square1x1` · `story9x16` · `reelsCover` · `link191` · `youtubeThumb` · `landscape16x9` |  | Canvas from the format table (default 1920×1080). |
| `width` | integer |  |  |
| `height` | integer |  |  |
| `duration` | number |  |  |
| `frameRate` | number |  |  |
| `compName` | string |  |  |
| `mogrtPath` | string |  | Also export a .mogrt with the text fields exposed (save the project first). |
| `allowLocalFonts` | boolean |  | Export the .mogrt even with fonts not from Adobe Fonts: After Effects then asks for an OK click. |
| `preview` | boolean |  |  Default: `true`. |
| `name` | string | yes | e.g. 'Junior Rocha'. |
| `role` | string |  |  |
| `scale` | number |  |  |

## `ae_create_title_card`

Recipe: title card in one call — kicker in the label font and accent colour, title whose words rise and fade in (text animator by words), an accent line that draws in, brand background (background: false for transparent). Audited; optional .mogrt.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `kitPath` | string |  | 00_briefing/kit-de-marca.json (cores por uso, tipos titulo/corpo/rotulo). |
| `colors` | object |  | '#RRGGBB' per role; overrides the kit. |
| `fonts` | object |  | PostScript names (ps_list_fonts). |
| `format` | `feed4x5` · `square1x1` · `story9x16` · `reelsCover` · `link191` · `youtubeThumb` · `landscape16x9` |  | Canvas from the format table (default 1920×1080). |
| `width` | integer |  |  |
| `height` | integer |  |  |
| `duration` | number |  |  |
| `frameRate` | number |  |  |
| `compName` | string |  |  |
| `mogrtPath` | string |  | Also export a .mogrt with the text fields exposed (save the project first). |
| `allowLocalFonts` | boolean |  | Export the .mogrt even with fonts not from Adobe Fonts: After Effects then asks for an OK click. |
| `preview` | boolean |  |  Default: `true`. |
| `title` | string | yes |  |
| `kicker` | string |  |  |
| `titleSize` | number |  | Title size at 1080 px (default 110). |
| `background` | boolean |  |  |

## `ae_create_counter`

Recipe: animated number in one call — counts from → to with a strong ease (slider 'Valor' + Source Text expression), prefix/suffix, decimals, Brazilian separators by default (1.234,5), label under it, small scale pop. Audited; optional .mogrt with Valor and Legenda.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `kitPath` | string |  | 00_briefing/kit-de-marca.json (cores por uso, tipos titulo/corpo/rotulo). |
| `colors` | object |  | '#RRGGBB' per role; overrides the kit. |
| `fonts` | object |  | PostScript names (ps_list_fonts). |
| `format` | `feed4x5` · `square1x1` · `story9x16` · `reelsCover` · `link191` · `youtubeThumb` · `landscape16x9` |  | Canvas from the format table (default 1920×1080). |
| `width` | integer |  |  |
| `height` | integer |  |  |
| `duration` | number |  |  |
| `frameRate` | number |  |  |
| `compName` | string |  |  |
| `mogrtPath` | string |  | Also export a .mogrt with the text fields exposed (save the project first). |
| `allowLocalFonts` | boolean |  | Export the .mogrt even with fonts not from Adobe Fonts: After Effects then asks for an OK click. |
| `preview` | boolean |  |  Default: `true`. |
| `to` | number | yes |  |
| `from` | number |  |  |
| `decimals` | integer |  |  |
| `prefix` | string |  |  |
| `suffix` | string |  |  |
| `thousands` | string |  | Thousands separator (default '.'). |
| `decimal` | string |  | Decimal separator (default ','). |
| `label` | string |  |  |
| `countSeconds` | number |  |  |
| `numberSize` | number |  |  |
| `background` | boolean |  |  |

## `ae_create_logo_reveal`

Recipe: logo reveal in one call — an accent circle grows behind, the logo (png/ai/psd) scales in with a strong ease and holds still for the last second or more; brand background. For a stroke-drawn reveal of a vector logo use ae_import_vector_as_shapes + Trim Paths instead. Audited.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `kitPath` | string |  | 00_briefing/kit-de-marca.json (cores por uso, tipos titulo/corpo/rotulo). |
| `colors` | object |  | '#RRGGBB' per role; overrides the kit. |
| `fonts` | object |  | PostScript names (ps_list_fonts). |
| `format` | `feed4x5` · `square1x1` · `story9x16` · `reelsCover` · `link191` · `youtubeThumb` · `landscape16x9` |  | Canvas from the format table (default 1920×1080). |
| `width` | integer |  |  |
| `height` | integer |  |  |
| `duration` | number |  |  |
| `frameRate` | number |  |  |
| `compName` | string |  |  |
| `mogrtPath` | string |  | Also export a .mogrt with the text fields exposed (save the project first). |
| `allowLocalFonts` | boolean |  | Export the .mogrt even with fonts not from Adobe Fonts: After Effects then asks for an OK click. |
| `preview` | boolean |  |  Default: `true`. |
| `logoPath` | string | yes |  |
| `logoWidthPct` | number |  | Logo width as % of the comp (default 40). |
| `keepCircle` | boolean |  |  |
| `background` | boolean |  |  |

## `ae_create_transition`

Recipe: transition kit in one call — scene A → scene B (two placeholder precomps to replace) with one move in the brand colours: wipe (accent band crosses the frame), circle (accent circle covers and uncovers), push (A out, B in), zoom (A zooms and blurs out, B settles in) or fade. Strong eases, motion blur, markers at the start and end of the move. Audited. Use between two clips in Premiere or as a template.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `kitPath` | string |  | 00_briefing/kit-de-marca.json (cores por uso, tipos titulo/corpo/rotulo). |
| `colors` | object |  | '#RRGGBB' per role; overrides the kit. |
| `fonts` | object |  | PostScript names (ps_list_fonts). |
| `format` | `feed4x5` · `square1x1` · `story9x16` · `reelsCover` · `link191` · `youtubeThumb` · `landscape16x9` |  | Canvas from the format table (default 1920×1080). |
| `width` | integer |  |  |
| `height` | integer |  |  |
| `duration` | number |  |  |
| `frameRate` | number |  |  |
| `compName` | string |  |  |
| `mogrtPath` | string |  | Also export a .mogrt with the text fields exposed (save the project first). |
| `allowLocalFonts` | boolean |  | Export the .mogrt even with fonts not from Adobe Fonts: After Effects then asks for an OK click. |
| `preview` | boolean |  |  Default: `true`. |
| `style` | `wipe` · `circle` · `push` · `zoom` · `fade` |  | Default wipe. |
| `transitionSeconds` | number |  | Length of the move (default 0.8 s). |
| `angle` | number |  | wipe: band angle in degrees (default 12). |

## `ae_get_layers`

List all layers in an After Effects composition (1-based index, name, type, timing, 3D status, parent, effect count).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  |  |
| `compIndex` | integer |  |  |

## `ae_create_layer`

Create a new Text, Solid, Adjustment, Null, Camera, Light, or empty Shape layer in an After Effects composition.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  |  |
| `compIndex` | integer |  |  |
| `layerType` | `text` · `solid` · `adjustment` · `null` · `camera` · `light` · `shape` |  |  Default: `"text"`. |
| `name` | string |  |  |
| `text` | string |  | Text string when layerType='text'. |
| `boxSize` | number[] |  | Optional [width, height] for box text. |
| `fontSize` | number |  |  Default: `72`. |
| `font` | string |  | PostScript font name. |
| `fillColor` | number[] |  | Normalized RGB array [r, g, b] where each channel is between 0.0 and 1.0. |
| `tracking` | number |  |  |
| `justification` | `left` · `center` · `right` |  | Text alignment (After Effects defaults to left). |
| `leading` | number |  | Line spacing in px (turns auto leading off). |
| `color` | number[] |  | Solid color [r,g,b] in 0..1 when layerType='solid'. |
| `width` | integer |  |  |
| `height` | integer |  |  |
| `duration` | number |  |  |
| `position` | number[] |  | [x, y] or [x, y, z] position. |
| `inPoint` | number |  |  |
| `outPoint` | number |  |  |
| `threeDLayer` | boolean |  |  |

## `ae_create_shape_layer`

Create a parametric or custom Bezier vector Shape Layer in After Effects with Fill, Stroke, and optional Trim Paths.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  |  |
| `compIndex` | integer |  |  |
| `name` | string |  |  Default: `"Shape Layer 1"`. |
| `groupName` | string |  |  Default: `"Shape Group 1"`. |
| `shapeType` | `rectangle` · `ellipse` · `polystar` · `path` |  |  Default: `"rectangle"`. |
| `size` | number[] |  |  Default: `[400,400]`. |
| `roundness` | number |  |  Default: `0`. |
| `points` | integer |  | Star/Polygon points. |
| `outerRadius` | number |  |  |
| `innerRadius` | number |  |  |
| `vertices` | number[][] |  | Bezier vertices [[x,y], ...] when shapeType='path'. |
| `inTangents` | number[][] |  |  |
| `outTangents` | number[][] |  |  |
| `closed` | boolean |  |  Default: `true`. |
| `fillColor` | number[] |  | Normalized RGB array [r, g, b] where each channel is between 0.0 and 1.0. |
| `fillOpacity` | number |  |  |
| `strokeColor` | number[] |  | Normalized RGB array [r, g, b] where each channel is between 0.0 and 1.0. |
| `strokeWidth` | number |  |  |
| `trimPaths` | object |  |  |
| `position` | number[] |  |  |

## `ae_modify_layer`

Update layer transform (position, scale, rotation, opacity, anchorPoint), timing (inPoint, outPoint, startTime, stretch), parenting, 3D state, motionBlur, or duplicate/delete a layer in After Effects.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  |  |
| `compIndex` | integer |  |  |
| `layerIndex` | integer |  | 1-based layer index. |
| `layerName` | string |  | Layer name (if layerIndex omitted). |
| `operation` | `update` · `duplicate` · `delete` |  |  Default: `"update"`. |
| `newName` | string |  |  |
| `enabled` | boolean |  |  |
| `solo` | boolean |  |  |
| `locked` | boolean |  |  |
| `threeDLayer` | boolean |  |  |
| `motionBlur` | boolean |  |  |
| `inPoint` | number |  |  |
| `outPoint` | number |  |  |
| `startTime` | number |  |  |
| `stretch` | number |  |  |
| `parentLayerIndex` | integer |  | 1-based parent layer index, or 0 to unparent. |
| `position` | number[] |  |  |
| `scale` | number[] |  |  |
| `rotation` | number |  |  |
| `opacity` | number |  |  |
| `anchorPoint` | number[] |  |  |
| `blendMode` | string |  | Blending mode in camelCase: normal, multiply, screen, overlay, softLight, hardLight, add, colorDodge, colorBurn, darken, lighten, difference, exclusion, hue, saturation, color, luminosity, linearLight, vividLight, pinLight, hardMix, linearBurn, darkerColor, lighterColor, subtract, divide... |
| `adjustmentLayer` | boolean |  |  |
| `trackMatte` | object |  | Use another layer as track matte (AE 2023+ any layer; older versions use the layer directly above). |

## `ae_get_property_tree`

Universal Property Navigator: Recursively inspect all PropertyGroups and Properties on an After Effects layer (Transform, Effects, Masks, Vector Contents, Text Animators, Camera/Light Options) returning exact matchNames and values.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  |  |
| `compIndex` | integer |  |  |
| `layerIndex` | integer |  |  |
| `layerName` | string |  |  |
| `rootPath` | string or integer[] |  | Optional starting property path (e.g. ['ADBE Effect Parade']). |
| `maxDepth` | integer |  |  Default: `3`. |

## `ae_set_property`

Set the static value of any property or deep sub-property (effect parameter, shape transform, mask feather, text property, 3D material) by its propertyPath.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  |  |
| `compIndex` | integer |  |  |
| `layerIndex` | integer |  |  |
| `layerName` | string |  |  |
| `propertyPath` | string or integer[] | yes | Path of matchNames, display names, or 1-based indices (e.g. ['ADBE Transform Group', 'ADBE Opacity'] or ['Position']). |
| `value` | any | yes | Value to set (number, [x,y], [r,g,b], boolean, etc.). |

## `ae_set_keyframes`

Add or replace multiple keyframes on any After Effects property with support for Linear, Hold, and Bezier (easeIn, easeOut, easeInOut) temporal interpolation.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  |  |
| `compIndex` | integer |  |  |
| `layerIndex` | integer |  |  |
| `layerName` | string |  |  |
| `propertyPath` | string or integer[] | yes | Property path (e.g. ['ADBE Transform Group', 'ADBE Position'] or ['Scale']). |
| `clearExisting` | boolean |  | Remove existing keyframes before adding. Default: `false`. |
| `keyframes` | object[] | yes |  |

## `ae_set_expression`

Apply, update, or disable an After Effects expression on any property and automatically validate `expressionError`.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  |  |
| `compIndex` | integer |  |  |
| `layerIndex` | integer |  |  |
| `layerName` | string |  |  |
| `propertyPath` | string or integer[] | yes |  |
| `expression` | string | yes | JavaScript expression (e.g. 'wiggle(3, 25)'). Pass empty string to remove. |
| `enabled` | boolean |  |  Default: `true`. |

## `ae_list_effects`

Search every effect installed in this After Effects (native and third-party) by name, matchName or category. Returns matchNames to use with ae_apply_effect. Display names follow the app's language; matchNames do not.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `search` | string |  | Words to look for, e.g. 'blur', 'glow', 'Sapphire'. Accents and case are ignored. |
| `category` | string |  | Filter by category, e.g. 'Blur & Sharpen', 'Distort', 'Generate'. |
| `includeInternal` | boolean |  | Include hidden effects that have no category. Default: `false`. |
| `limit` | integer |  |  Default: `200`. |
| `refresh` | boolean |  | Re-read the list from After Effects (after installing plugins). Default: `false`. |

## `ae_apply_effect`

Apply any installed effect (native or third-party) to a layer by matchName or display name and set its parameters. Returns every parameter of the new effect (name, matchName, value, range) and lists parameters it could not set. Animate parameters afterwards with ae_set_keyframes, propertyPath ['ADBE Effect Parade', '<effect name>', '<parameter>'].

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  | Composition name (defaults to the active composition). |
| `compIndex` | integer |  | 1-based project item index of the composition. |
| `layerIndex` | integer |  | 1-based layer index. |
| `layerName` | string |  | Layer name (when layerIndex is omitted). |
| `effectMatchNameOrName` | string | yes | Effect matchName (recommended, e.g. 'ADBE Gaussian Blur 2', 'ADBE Glo2') or display name. Find them with ae_list_effects. |
| `effectCustomName` | string |  | Name for this effect instance in Effect Controls. |
| `properties` | object |  | Parameter name or matchName → value, e.g. { 'Blurriness': 35 } or { 'ADBE Gaussian Blur 2-0001': 35 }. |

## `ae_manage_effect`

List, describe, enable/disable, rename, duplicate, reorder or remove effects already on an After Effects layer.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  | Composition name (defaults to the active composition). |
| `compIndex` | integer |  | 1-based project item index of the composition. |
| `layerIndex` | integer |  | 1-based layer index. |
| `layerName` | string |  | Layer name (when layerIndex is omitted). |
| `operation` | `list` · `describe` · `enable` · `disable` · `rename` · `duplicate` · `move` · `remove` |  |  Default: `"list"`. |
| `effectIndex` | integer |  | 1-based position in Effect Controls. |
| `effectName` | string |  | Effect instance name or matchName (when effectIndex is omitted). |
| `newName` | string |  | For rename / duplicate. |
| `newIndex` | integer |  | For move: new 1-based position. |
| `includeParameters` | boolean |  | For list: include every parameter value. Default: `false`. |

## `ae_list_presets`

Find After Effects animation presets (.ffx): the built-in Presets folder, every 'User Presets' folder and any extra folders.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `search` | string |  | Words to look for in the preset name or category, e.g. 'typewriter', 'fade'. |
| `folders` | string[] |  | Extra absolute folders to scan for .ffx files. |
| `limit` | integer |  |  Default: `200`. |

## `ae_export_mogrt`

Turn a comp into a Motion Graphics template for Premiere: expose properties in Essential Graphics (text layers' Source Text by default; also colours, sliders, checkboxes) under friendly names, and export the .mogrt. Save the project first. Place it in Premiere with pr_insert_mogrt and fill it by those names.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  |  |
| `compIndex` | integer |  |  |
| `outputPath` | string | yes | Absolute path of the .mogrt to write. |
| `templateName` | string |  |  |
| `allowLocalFonts` | boolean |  | Export even with fonts not from Adobe Fonts (After Effects asks for an OK click). |
| `properties` | object[] | yes |  |

## `ae_apply_preset`

Apply an animation preset (.ffx) to one layer. Use the full path from ae_list_presets (or an exact preset name). Presets key from the current time: pass time (seconds) to start the animation there. Returns the effects, text animators and keyframed properties the preset added.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  | Composition name (defaults to the active composition). |
| `compIndex` | integer |  | 1-based project item index of the composition. |
| `layerIndex` | integer |  | 1-based layer index. |
| `layerName` | string |  | Layer name (when layerIndex is omitted). |
| `time` | number |  | Start time in seconds (moves the time indicator first). |
| `presetPath` | string |  | Absolute path to the .ffx file. |
| `presetName` | string |  | Exact preset name, searched in the preset folders when presetPath is omitted. |
| `folders` | string[] |  | Extra folders to search for presetName. |

## `ae_add_text_animator`

Add a text animator to a text layer: animated properties (position, scale, rotation, opacity, tracking, blur, colors), a range selector (start/end/offset, based on characters/words/lines, shape, ease high/low, random order) and an optional keyframed reveal of the selector. Typical reveal: properties {opacity: 0, position: [0, 40]}, animate offset from 0 to 100.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  | Composition name (defaults to the active composition). |
| `compIndex` | integer |  | 1-based project item index of the composition. |
| `layerIndex` | integer |  | 1-based layer index. |
| `layerName` | string |  | Layer name (when layerIndex is omitted). |
| `name` | string |  | Animator name. |
| `properties` | object | yes | Values the selected characters move to (the animator's target state). |
| `selector` | object |  |  |
| `animate` | object |  | Keyframes the selector so the effect sweeps across the text. |

## `ae_add_mask`

Add a mask to a layer: rectangle, ellipse or a custom path (layer coordinates, origin at the layer's top-left), with mode, feather, expansion, opacity and inversion.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  | Composition name (defaults to the active composition). |
| `compIndex` | integer |  | 1-based project item index of the composition. |
| `layerIndex` | integer |  | 1-based layer index. |
| `layerName` | string |  | Layer name (when layerIndex is omitted). |
| `shape` | `rectangle` · `ellipse` · `path` |  |  Default: `"rectangle"`. |
| `rect` | number[] |  | [left, top, width, height] in layer pixels; defaults to the whole layer. |
| `vertices` | number[][] |  | For shape 'path': list of [x, y] points. |
| `inTangents` | number[][] |  |  |
| `outTangents` | number[][] |  |  |
| `closed` | boolean |  |  Default: `true`. |
| `mode` | `none` · `add` · `subtract` · `intersect` · `lighten` · `darken` · `difference` |  |  Default: `"add"`. |
| `feather` | number or number[] |  |  |
| `expansion` | number |  |  |
| `opacity` | number |  |  |
| `inverted` | boolean |  |  |
| `name` | string |  |  |

## `ae_render_queue`

Add a composition to the After Effects Render Queue, configure templates and output path, and optionally start rendering or send to Adobe Media Encoder.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `compName` | string |  |  |
| `compIndex` | integer |  |  |
| `outputPath` | string | yes | Absolute path for rendered output file. |
| `renderSettingsTemplate` | string |  |  |
| `outputModuleTemplate` | string |  |  |
| `queueInAME` | boolean |  | Queue in Adobe Media Encoder instead of blocking AE UI. Default: `false`. |
| `startRenderImmediately` | boolean |  |  Default: `false`. |
| `overwrite` | boolean |  | An existing file at the output path is replaced (default). false: refuse with OUTPUT_EXISTS. Either way After Effects never stops on its 'Overwrite?' dialog. Default: `true`. |

## `ae_execute_menu_command`

Execute any After Effects menu command by its menu string (resolved via `app.findMenuCommandId`) or numeric command ID.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `commandName` | string |  | Exact menu command title (e.g. 'Easy Ease', 'Time-Reverse Keyframes', 'Purge All Memory and Disk Cache...'). |
| `commandId` | integer |  | Numeric command ID if already known. |

## `ae_execute_extendscript`

After Effects ExtendScript escape hatch: execute arbitrary ExtendScript (.jsx) code inside After Effects wrapped in an automatic Undo Group (`app.beginUndoGroup` / `app.endUndoGroup`), with dialogs suppressed, and JSON serializer. Do not write app.beginUndoGroup/endUndoGroup yourself (the MCP already groups the script; if you do, they are tracked and closed for you, never left unbalanced). Keep scripts short (one comp per call). Do not call app.project.save() here: save with ae_manage_project (operation 'save') in its own call — a script that edited several comps and then saved froze After Effects on 13/11/2026 while Premiere held the project by Dynamic Link.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `code` | string | yes | ExtendScript (ES3) code to evaluate in After Effects. Has full access to `app`, `app.project`, `CompItem`, `RenderQueue`, etc. |
| `undoGroupName` | string |  |  Default: `"MCP Custom ExtendScript"`. |
