# Premiere Pro

Projects, sequences, clips, effects, transitions, captions, markers and export.

[← All tools](README.md)

| Tool | What it does |
|---|---|
| [`pr_get_project_info`](#pr_get_project_info) | Retrieve Adobe Premiere Pro active project metadata, sequences list, and bin/clip hierarchy. |
| [`pr_manage_project`](#pr_manage_project) | Create a new project (operation 'new' + filePath .prproj), open, save, save-as, or create bins in Adobe Premiere Pro. |
| [`pr_import_media`](#pr_import_media) | Import video, audio, graphics, or image sequences into the active Premiere Pro project. |
| [`pr_get_sequence_state`](#pr_get_sequence_state) | Get the complete state of the active Premiere Pro sequence: frame size, playhead position, all video tracks (V1..Vn), audio tracks (A1..An), and clips with start/end/duration. |
| [`pr_organize_project`](#pr_organize_project) | Organise a Premiere project: items at the root go into bins by type (01 Sequencias, 02 Video, 03 Audio, 04 Graficos, 05 Imagens; created when missing, existing bins untouched). |
| [`pr_duplicate_sequence`](#pr_duplicate_sequence) | Duplicate a sequence (default: the active one) to work on a copy and leave the user's edit untouched; renames it, optionally moves it to a bin (created if missing) and makes it… |
| [`pr_create_sequence`](#pr_create_sequence) | Create a new sequence in Premiere Pro without opening the New Sequence dialog: from an imported clip (its format), or from a sequence preset file (default: HD 1080p 29.97 fps;… |
| [`pr_place_clip_on_timeline`](#pr_place_clip_on_timeline) | Insert (ripple) or overwrite a project clip onto a video/audio track in the active Premiere Pro sequence at a specified time in seconds. |
| [`pr_modify_timeline_clip`](#pr_modify_timeline_clip) | Enable/disable, remove (with or without ripple), or modify intrinsic/effect component properties (Motion Position, Scale, Rotation, Opacity, Volume, etc.) of a clip on the… |
| [`pr_manage_markers`](#pr_manage_markers) | List or add timeline markers on the active Premiere Pro sequence. |
| [`pr_list_effects`](#pr_list_effects) | Search the video effects, audio effects, video transitions or audio transitions installed in Premiere Pro (native and third-party). |
| [`pr_apply_transition`](#pr_apply_transition) | Apply a video or audio transition (e.g. |
| [`pr_apply_effect`](#pr_apply_effect) | Apply any installed video/audio effect to one clip, several clips or all clips of a track, optionally setting parameters and keyframes. |
| [`pr_list_clip_effects`](#pr_list_clip_effects) | Readback: every effect (component) on a clip — Motion, Opacity, Volume and applied effects — with parameter names and current values. |
| [`pr_set_effect_params`](#pr_set_effect_params) | Set parameters and keyframes of an effect already on a clip (including Motion: Position/Scale/Rotation, Opacity, Lumetri). |
| [`pr_set_volume`](#pr_set_volume) | Set the volume of audio clips in decibels (converted to Premiere's internal level). |
| [`pr_export_frame_or_sequence`](#pr_export_frame_or_sequence) | Export the current Program Monitor frame as a PNG (returning base64 ImageContent for visual inspection) or render the full sequence to disk. |
| [`pr_import_captions`](#pr_import_captions) | Import an SRT (or SCC/XML) as a caption track of the active sequence, starting at startSeconds. |
| [`pr_caption_tracks`](#pr_caption_tracks) | Native caption tracks of the active sequence, through the Premiere UXP panel (ExtendScript cannot see them): list tracks and their blocks (start/end), mute/unmute (hide/show)… |
| [`pr_native_transcript`](#pr_native_transcript) | Premiere's own speech-to-text (Text panel), through the Premiere UXP panel: list the languages and which are installed, start the transcription of a clip of the Project panel,… |
| [`pr_scene_edit_detection`](#pr_scene_edit_detection) | Scene Edit Detection on the clips of one video track of the active sequence, through the Premiere UXP panel: find the cuts inside an already edited video and mark them, cut the… |
| [`pr_clip_speed`](#pr_clip_speed) | Speed of a video clip on the timeline: percent (100 normal, 50 half speed, 200 double), reverse, and how the in-between frames are made (frameSampling, frameBlending, opticalFlow). |
| [`pr_sequence_points`](#pr_sequence_points) | In/out points, work area and tracks of the active sequence: read them (get), set the sequence in and out points (setInOut), set or enable the work area (workArea), or add… |
| [`pr_label_items`](#pr_label_items) | Colour labels of items in the Project panel (0-15, in the order of Premiere's label preferences), to mark takes, B-roll, music and so on. |
| [`pr_color`](#pr_color) | Colour-correct a clip with Lumetri Color using the same control names as the Lightroom and Camera Raw tools: temperature, tint, exposure, contrast, highlights, shadows, whites,… |
| [`pr_expect_project`](#pr_expect_project) | Safety lock: name the Premiere project this work belongs to. |
| [`pr_apply_cut_plan`](#pr_apply_cut_plan) | Edit out pauses: place only the kept ranges (source seconds) of one project clip back to back on a video track, audio included, starting at timeSeconds. |
| [`pr_audio_keyframes`](#pr_audio_keyframes) | Set Volume keyframes (sequence seconds, dB) on audio clips: fades, rides, ducking. |
| [`pr_duck_music`](#pr_duck_music) | Lower a music bed under speech: from speech ranges (sequence seconds — the kept pieces of the voice clips, or media_analyze_audio speech) builds volume keyframes (baseDb →… |
| [`pr_insert_mogrt`](#pr_insert_mogrt) | Place a Motion Graphics template (.mogrt — titles, lower thirds, animated captions exported with ae_export_mogrt) on a video track and fill its parameters by display name (text… |
| [`pr_edit_timeline`](#pr_edit_timeline) | Edit the active sequence like an editor: razor (cut every track, or listed tracks, at one or more times), extract (ripple delete a time range on every unlocked track — the gap… |
| [`pr_auto_reframe`](#pr_auto_reframe) | Auto Reframe: make a new sequence in another aspect ratio (9:16, 4:5, 1:1, 16:9) that follows the action in the picture — one edit becomes reels, feed and YouTube versions. |
| [`pr_captions_as_mogrt`](#pr_captions_as_mogrt) | Styled captions: put one Motion Graphics template clip per caption cue (from an SRT, or cues) on a video track, with the cue text in the template's text field — font, box,… |
| [`pr_audit_timeline`](#pr_audit_timeline) | Check the active sequence before export: gaps on V1/A1 (black or silence), gap at start/end, offline media, disabled clips, muted tracks with clips, speed changes, frame size… |
| [`pr_execute_uxp_script`](#pr_execute_uxp_script) | Premiere Pro UXP escape hatch: execute arbitrary async JavaScript in Premiere Pro's UXP environment with `ppro` (the premierepro module), `project` (the active project) and… |
| [`pr_execute_extendscript`](#pr_execute_extendscript) | Premiere Pro ExtendScript + QE DOM escape hatch: execute arbitrary .jsx ExtendScript in Premiere Pro with `app.project` and `qe.project` (`app.enableQE()`) enabled. |
| [`pr_assemble_reel`](#pr_assemble_reel) | Recipe: talking-head reel in one call. |

## `pr_get_project_info`

Retrieve Adobe Premiere Pro active project metadata, sequences list, and bin/clip hierarchy.

No parameters.

## `pr_manage_project`

Create a new project (operation 'new' + filePath .prproj), open, save, save-as, or create bins in Adobe Premiere Pro. Missing folders are created.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `operation` | `new` · `open` · `save` · `createBin` | yes |  |
| `filePath` | string |  | File path for new, open or save-as. |
| `binName` | string |  | Bin name when operation='createBin'. |
| `closePrevious` | boolean |  | new: save and close the projects already open so the new one is the active project (default true). |

## `pr_import_media`

Import video, audio, graphics, or image sequences into the active Premiere Pro project. An After Effects project (.aep) is imported through Dynamic Link: the comps named in aeCompNames, or all of them.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `filePaths` | string[] | yes | Array of absolute file paths to import. |
| `aeCompNames` | string[] |  | For .aep files: comps to bring in by Dynamic Link (default: every comp). |
| `targetBinName` | string |  | Optional destination bin name. |
| `importAsNumberedStills` | boolean |  |  Default: `false`. |

## `pr_get_sequence_state`

Get the complete state of the active Premiere Pro sequence: frame size, playhead position, all video tracks (V1..Vn), audio tracks (A1..An), and clips with start/end/duration.

No parameters.

## `pr_organize_project`

Organise a Premiere project: items at the root go into bins by type (01 Sequencias, 02 Video, 03 Audio, 04 Graficos, 05 Imagens; created when missing, existing bins untouched). Also lists the tracks of the active sequence with their clip counts, to check the rule V1 main video, V2 cover, V3 graphics; A1 voice, A2 music, A3 effects. apply: false (default) only reports.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `apply` | boolean |  |  Default: `false`. |

## `pr_duplicate_sequence`

Duplicate a sequence (default: the active one) to work on a copy and leave the user's edit untouched; renames it, optionally moves it to a bin (created if missing) and makes it active. Effects, Color Mode and nests come along.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `sequenceName` | string |  | Sequence to copy (default: active). |
| `newName` | string |  | Name of the copy (default: Premiere's 'Copy' name). |
| `targetBinName` | string |  |  |
| `activate` | boolean |  |  Default: `true`. |

## `pr_create_sequence`

Create a new sequence in Premiere Pro without opening the New Sequence dialog: from an imported clip (its format), or from a sequence preset file (default: HD 1080p 29.97 fps; change the size afterwards with the sequence settings).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `name` | string |  |  Default: `"Main Sequence"`. |
| `presetPath` | string |  | A .sqpreset file. Default: the app's HD 1080p 29.97 fps preset. |
| `fromClipName` | string |  | Create sequence matching the settings of this project clip. |
| `empty` | boolean |  | With fromClipName: keep the clip's format but remove the clip from the new timeline. |

## `pr_place_clip_on_timeline`

Insert (ripple) or overwrite a project clip onto a video/audio track in the active Premiere Pro sequence at a specified time in seconds.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `clipNameOrPath` | string | yes | Name or media path of the imported ProjectItem. |
| `mode` | `overwrite` · `insert` |  |  Default: `"overwrite"`. |
| `videoTrackIndex` | integer |  | 0-based video track index (0 = V1). Default: `0`. |
| `timeSeconds` | number |  | Timeline position in seconds. Default: `0`. |

## `pr_modify_timeline_clip`

Enable/disable, remove (with or without ripple), or modify intrinsic/effect component properties (Motion Position, Scale, Rotation, Opacity, Volume, etc.) of a clip on the timeline.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `trackType` | `video` · `audio` |  |  Default: `"video"`. |
| `trackIndex` | integer |  | 0-based track index. Default: `0`. |
| `clipIndex` | integer |  | 0-based clip index on the track. Default: `0`. |
| `disabled` | boolean |  |  |
| `remove` | boolean |  |  Default: `false`. |
| `ripple` | boolean |  |  Default: `false`. |
| `alignToVideo` | boolean |  |  Default: `true`. |
| `componentName` | string |  | Component displayName or matchName (e.g. 'Motion', 'Opacity', 'Volume'). |
| `componentProperties` | object |  | Map of property displayName to value (e.g. { 'Scale': 120, 'Rotation': 15 }). |

## `pr_manage_markers`

List or add timeline markers on the active Premiere Pro sequence.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `operation` | `list` · `add` |  |  Default: `"list"`. |
| `timeSeconds` | number |  |  Default: `0`. |
| `durationSeconds` | number |  |  |
| `name` | string |  |  |
| `comments` | string |  |  |

## `pr_list_effects`

Search the video effects, audio effects, video transitions or audio transitions installed in Premiere Pro (native and third-party). Names follow Premiere's interface language and are what pr_apply_effect / pr_apply_transition expect.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `kind` | `videoEffects` · `audioEffects` · `videoTransitions` · `audioTransitions` |  |  Default: `"videoEffects"`. |
| `search` | string |  | Words to look for; accents and case are ignored. |
| `limit` | integer |  |  Default: `300`. |
| `refresh` | boolean |  |  Default: `false`. |

## `pr_apply_transition`

Apply a video or audio transition (e.g. Cross Dissolve, Dip to Black, Constant Power) to one clip edge or to EVERY cut between adjacent clips of a track in the active sequence. Clip indices are 0-based and ignore gaps.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `trackType` | `video` · `audio` |  |  Default: `"video"`. |
| `trackIndex` | integer |  | 0-based track index (V1 = 0, A1 = 0). Default: `0`. |
| `clipIndex` | integer |  | 0-based clip index on the track, gaps not counted. Default: `0`. |
| `transitionName` | string | yes | Transition name as listed by pr_list_effects (kind videoTransitions/audioTransitions). |
| `allCuts` | boolean |  | Apply at every cut where two clips touch on this track. Default: `false`. |
| `position` | `start` · `end` · `both` |  | Clip edge when allCuts is false. Default: `"end"`. |
| `durationSeconds` | number |  | Transition length; default = Premiere's default duration. |

## `pr_apply_effect`

Apply any installed video/audio effect to one clip, several clips or all clips of a track, optionally setting parameters and keyframes. Returns the new effect's parameters with their current values (readback).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `trackType` | `video` · `audio` |  |  Default: `"video"`. |
| `trackIndex` | integer |  | 0-based track index (V1 = 0, A1 = 0). Default: `0`. |
| `clipIndex` | integer |  | 0-based clip index on the track, gaps not counted. Default: `0`. |
| `clipIndices` | integer[] |  | Several clips at once. |
| `allClips` | boolean |  | Every clip on the track. Default: `false`. |
| `effectName` | string | yes | Effect name as listed by pr_list_effects. |
| `parameters` | object |  | Parameter display name → value. |
| `keyframes` | object[] |  |  |

## `pr_list_clip_effects`

Readback: every effect (component) on a clip — Motion, Opacity, Volume and applied effects — with parameter names and current values.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `trackType` | `video` · `audio` |  |  Default: `"video"`. |
| `trackIndex` | integer |  | 0-based track index (V1 = 0, A1 = 0). Default: `0`. |
| `clipIndex` | integer |  | 0-based clip index on the track, gaps not counted. Default: `0`. |

## `pr_set_effect_params`

Set parameters and keyframes of an effect already on a clip (including Motion: Position/Scale/Rotation, Opacity, Lumetri). Find component and parameter names with pr_list_clip_effects.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `trackType` | `video` · `audio` |  |  Default: `"video"`. |
| `trackIndex` | integer |  | 0-based track index (V1 = 0, A1 = 0). Default: `0`. |
| `clipIndex` | integer |  | 0-based clip index on the track, gaps not counted. Default: `0`. |
| `clipIndices` | integer[] |  |  |
| `allClips` | boolean |  |  Default: `false`. |
| `componentName` | string |  | Component display name or matchName, e.g. 'Motion', 'Opacity', 'Gaussian Blur'. |
| `componentIndex` | integer |  | 0-based component index (alternative to componentName). |
| `parameters` | object |  | Parameter display name → static value. |
| `keyframes` | object[] |  |  |

## `pr_set_volume`

Set the volume of audio clips in decibels (converted to Premiere's internal level). 0 dB = unchanged, -6 dB ≈ half loudness.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `trackIndex` | integer |  | 0-based audio track index. Default: `0`. |
| `clipIndex` | integer |  |  Default: `0`. |
| `clipIndices` | integer[] |  |  |
| `allClips` | boolean |  |  Default: `false`. |
| `db` | number | yes | Gain in dB. |

## `pr_export_frame_or_sequence`

Export the current Program Monitor frame as a PNG (returning base64 ImageContent for visual inspection) or render the full sequence to disk.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `mode` | `frame` · `sequence` |  |  Default: `"frame"`. |
| `timeSeconds` | number |  | frame: move the playhead to this time first (default: current playhead). |
| `outputPath` | string |  | Absolute path for the exported frame PNG or rendered media. |
| `presetPath` | string |  | Path to .epr Adobe Media Encoder preset when mode='sequence'. |
| `queueInAME` | boolean |  | sequence: render in Adobe Media Encoder in the background (returns at once with a jobId; check the file afterwards). Recommended for anything over ~30 s. |
| `includeImageContent` | boolean |  |  Default: `true`. |

## `pr_import_captions`

Import an SRT (or SCC/XML) as a caption track of the active sequence, starting at startSeconds. Build the SRT with media_transcribe / media_build_captions (glossary, line length, re-timed to the cut). Styling is done with a caption style in Premiere (not scriptable); for styled, animated captions use pr_captions_as_mogrt. Needs the CEP panel (creation) and, to confirm the result, the UXP panel.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `filePath` | string | yes | Absolute path to the .srt. |
| `startSeconds` | number |  |  Default: `0`. |
| `format` | `subtitle` · `cea608` · `cea708` · `teletext` · `ebu` · `op42` · `op47` |  |  Default: `"subtitle"`. |

## `pr_caption_tracks`

Native caption tracks of the active sequence, through the Premiere UXP panel (ExtendScript cannot see them): list tracks and their blocks (start/end), mute/unmute (hide/show) or rename a track. Block text and style are not exposed to scripts; for styled captions use pr_captions_as_mogrt.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `operation` | `list` · `mute` · `unmute` · `rename` |  |  Default: `"list"`. |
| `trackIndex` | integer |  |  Default: `0`. |
| `name` | string |  | rename: the new track name. |
| `maxBlocks` | integer |  |  Default: `500`. |

## `pr_native_transcript`

Premiere's own speech-to-text (Text panel), through the Premiere UXP panel: list the languages and which are installed, start the transcription of a clip of the Project panel, check whether a clip has a transcript, or read it back as lines (and per-word times). The transcript stays in the project, so the editor can use it for text-based editing and captions. No cloud credits: it runs on the machine with the installed language pack.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `operation` | `languages` · `status` · `transcribe` · `export` |  |  Default: `"status"`. |
| `clipName` | string |  | Clip name in the Project panel (not needed for 'languages'). |
| `language` | string |  | transcribe: language code from 'languages', e.g. 'pt-pt', 'en-us'. |
| `includeWords` | boolean |  | export: also return every word with start and duration (seconds). |
| `maxSegments` | integer |  |  Default: `200`. |
| `maxWords` | integer |  |  Default: `2000`. |
| `outputPath` | string |  | export/transcribe: also write the full transcript JSON to this file. |

## `pr_scene_edit_detection`

Scene Edit Detection on the clips of one video track of the active sequence, through the Premiere UXP panel: find the cuts inside an already edited video and mark them, cut the clip at each one, or create subclips. Use it to break a finished video back into shots before re-editing. 'cuts' changes the timeline; 'markers' does not.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `apply` | `markers` · `cuts` · `subclips` |  |  Default: `"markers"`. |
| `sensitivity` | `low` · `medium` · `high` |  |  Default: `"medium"`. |
| `videoTrackIndex` | integer |  |  Default: `0`. |
| `clipIndex` | integer |  | One clip of the track (0-based). Default: every clip of the track. |

## `pr_clip_speed`

Speed of a video clip on the timeline: percent (100 normal, 50 half speed, 200 double), reverse, and how the in-between frames are made (frameSampling, frameBlending, opticalFlow). The clip keeps the same content, so its length changes with the speed (200 % = half as long) and by default the clips after it ripple.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `trackIndex` | integer |  |  Default: `0`. |
| `clipIndex` | integer |  |  |
| `atSeconds` | number |  | Pick the clip under this time instead of by index. |
| `speedPercent` | number |  |  |
| `reverse` | boolean |  |  |
| `ripple` | boolean |  |  Default: `true`. |
| `keepDuration` | boolean |  | Keep the clip's length on the timeline and let the content change instead (default false). |
| `frameInterpolation` | `frameSampling` · `frameBlending` · `opticalFlow` |  |  |

## `pr_sequence_points`

In/out points, work area and tracks of the active sequence: read them (get), set the sequence in and out points (setInOut), set or enable the work area (workArea), or add video/audio tracks (addTracks). Times are seconds.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `operation` | `get` · `setInOut` · `workArea` · `addTracks` |  |  Default: `"get"`. |
| `inSeconds` | number |  |  |
| `outSeconds` | number |  |  |
| `enabled` | boolean |  | workArea: show and use the work area bar. |
| `video` | integer |  | addTracks: how many video tracks. |
| `audio` | integer |  | addTracks: how many audio tracks. |

## `pr_label_items`

Colour labels of items in the Project panel (0-15, in the order of Premiere's label preferences), to mark takes, B-roll, music and so on.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `clipNames` | string[] | yes |  |
| `label` | integer | yes |  |

## `pr_color`

Colour-correct a clip with Lumetri Color using the same control names as the Lightroom and Camera Raw tools: temperature, tint, exposure, contrast, highlights, shadows, whites, blacks, saturation, vibrance, sharpen, fadedFilm. Adds the effect if the clip does not have it and returns the values read back. Effect names follow Premiere's language; in another language use pr_apply_effect with the listed name. Named looks: natural-limpo, cinematico-contido, quente-editorial, frio-tecnologico, pb-contraste, esportivo-dramatico, pb-papel-antigo, pb-vintage (after the correction, intensity 0.5-0.8). A look the user made by hand stays: use his, not one of these.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `trackIndex` | integer |  |  Default: `0`. |
| `clipIndex` | integer |  |  |
| `atSeconds` | number |  |  |
| `settings` | object |  | e.g. { exposure: 0.3, contrast: 12, saturation: 110, temperature: 8 } |
| `look` | `natural-limpo` · `cinematico-contido` · `quente-editorial` · `frio-tecnologico` · `pb-contraste` · `esportivo-dramatico` · `pb-papel-antigo` · `pb-vintage` |  | Named look applied at `intensity`; settings override its values. |
| `intensity` | number |  |  Default: `0.7`. |

## `pr_expect_project`

Safety lock: name the Premiere project this work belongs to. From then on every Premiere command is refused (PROJECT_MISMATCH, nothing changed) when another project is the active one - several projects can be open and the active one changes when the person clicks. Call it before the first write of a job; clear: true removes it.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `name` | string |  | Project file name, e.g. 'campanha.prproj'. |
| `clear` | boolean |  |  |

## `pr_apply_cut_plan`

Edit out pauses: place only the kept ranges (source seconds) of one project clip back to back on a video track, audio included, starting at timeSeconds. Get the ranges from media_analyze_audio (cutPlan.keep) and re-time the captions with media_build_captions keep=…. Returns where each piece landed.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `clipNameOrPath` | string | yes |  |
| `keep` | object[] | yes |  |
| `timeSeconds` | number |  |  Default: `0`. |
| `videoTrackIndex` | integer |  |  Default: `0`. |
| `punchIn` | object |  | Hide jump cuts in a talking head: every Nth piece a little closer. |
| `audioFadeFrames` | integer |  | Constant Power crossfade of this many frames on every audio cut (2-3 for speech: no clicks); 0 = none. Default: `2`. |
| `audioTrackIndex` | integer |  | Audio track of the pieces (default: same index as the video track). |

## `pr_audio_keyframes`

Set Volume keyframes (sequence seconds, dB) on audio clips: fades, rides, ducking. Replaces the clip's existing volume keyframes unless clearExisting is false.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `trackIndex` | integer |  |  Default: `0`. |
| `clipIndex` | integer |  |  |
| `clipIndices` | integer[] |  |  |
| `allClips` | boolean |  |  |
| `keys` | object[] | yes |  |
| `clearExisting` | boolean |  |  Default: `true`. |

## `pr_duck_music`

Lower a music bed under speech: from speech ranges (sequence seconds — the kept pieces of the voice clips, or media_analyze_audio speech) builds volume keyframes (baseDb → baseDb − duckDb with attack/release) on every clip of the music track, plus optional fade in/out.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `trackIndex` | integer | yes | Audio track with the music (0 = A1). |
| `speech` | object[] | yes |  |
| `baseDb` | number |  | Music level without speech. Default: `-6`. |
| `duckDb` | number |  | How far it goes down under speech. Default: `14`. |
| `attack` | number |  |  Default: `0.25`. |
| `release` | number |  |  Default: `0.5`. |
| `fadeIn` | number |  |  Default: `0.6`. |
| `fadeOut` | number |  |  Default: `1.5`. |
| `startSeconds` | number |  | Where the music starts on the timeline. Default: `0`. |
| `endSeconds` | number |  | Where the music must be silent (end of the video). |

## `pr_insert_mogrt`

Place a Motion Graphics template (.mogrt — titles, lower thirds, animated captions exported with ae_export_mogrt) on a video track and fill its parameters by display name (text fields take plain text). Returns the template's parameter names. Missing tracks are added.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `filePath` | string | yes | Absolute path to the .mogrt. |
| `timeSeconds` | number |  |  Default: `0`. |
| `durationSeconds` | number |  |  |
| `videoTrackIndex` | integer |  |  Default: `1`. |
| `audioTrackIndex` | integer |  |  Default: `0`. |
| `values` | object |  | Parameter display name → value, e.g. {'Titel': 'Photoshop Beta'}. |

## `pr_edit_timeline`

Edit the active sequence like an editor: razor (cut every track, or listed tracks, at one or more times), extract (ripple delete a time range on every unlocked track — the gap closes), slip (change which part of the source plays, clip stays put), trim (new start/end edges; the picture stays in sync) and move (by offset or to a time). slip/trim/move act on the clip and its linked audio/video (linked: false for one item). Target a clip by trackType + trackIndex + clipIndex, or atSeconds on that track. Times snap to frames; the reply reports where edits landed. pr_get_sequence_state shows clip indices.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `operation` | `razor` · `extract` · `slip` · `trim` · `move` | yes |  |
| `timeSeconds` | number |  | razor: where to cut. |
| `times` | number[] |  | razor: several cuts at once. |
| `tracks` | object[] |  | razor: only these tracks (default: all tracks). |
| `startSeconds` | number |  | extract: range start · trim: new clip start. |
| `endSeconds` | number |  | extract: range end · trim: new clip end. |
| `trackType` | `video` · `audio` |  |  Default: `"video"`. |
| `trackIndex` | integer |  |  Default: `0`. |
| `clipIndex` | integer |  |  |
| `atSeconds` | number |  | Target the clip under this time on the track. |
| `offsetSeconds` | number |  | slip: source offset (+ shows later material) · move: shift on the timeline. |
| `toSeconds` | number |  | move: new start time. |
| `linked` | boolean |  |  Default: `true`. |
| `keepPlayhead` | boolean |  |  Default: `true`. |

## `pr_auto_reframe`

Auto Reframe: make a new sequence in another aspect ratio (9:16, 4:5, 1:1, 16:9) that follows the action in the picture — one edit becomes reels, feed and YouTube versions. The new sequence opens; check titles and safe areas afterwards (they are reframed with the picture).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `aspect` | string |  | '9:16', '4:5', '1:1', '16:9'. |
| `numerator` | integer |  |  |
| `denominator` | integer |  |  |
| `motion` | `slower` · `default` · `faster` |  | How quickly the frame follows the action. |
| `newName` | string |  |  |
| `sequenceName` | string |  | Source sequence (default: the active one). |
| `useNestedSequences` | boolean |  |  |
| `open` | boolean |  |  Default: `true`. |

## `pr_captions_as_mogrt`

Styled captions: put one Motion Graphics template clip per caption cue (from an SRT, or cues) on a video track, with the cue text in the template's text field — font, box, colour and animation come from the .mogrt (e.g. one made with ae_export_mogrt). Premiere's native caption track cannot be styled by script; use this when the look matters. Build the SRT with media_build_captions (maxLines 1–2, maxChars 16–32). Without filePath it uses the built-in caption template (vertical or horizontal by the sequence, scaled to its height; fields: Texto, Cor do texto, Cor da caixa, Tamanho, Opacidade da caixa, Altura, Entrada animada - set them with extraValues).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `filePath` | string |  | The caption .mogrt (default: the built-in template). |
| `srtPath` | string |  |  |
| `cues` | object[] |  |  |
| `textParam` | string |  | Display name of the text parameter (default: the template's first text field). |
| `extraValues` | object |  | Same values on every clip (e.g. a colour). |
| `offsetSeconds` | number |  | Shift every cue (cue times are relative to the sequence start). |
| `videoTrackIndex` | integer |  |  Default: `2`. |
| `audioTrackIndex` | integer |  |  Default: `0`. |
| `maxCues` | integer |  |  Default: `400`. |

## `pr_audit_timeline`

Check the active sequence before export: gaps on V1/A1 (black or silence), gap at start/end, offline media, disabled clips, muted tracks with clips, speed changes, frame size vs format; with renderPath, also loudness (target −14 LUFS ±1.5, peak ≤ −1 dB) and render duration. Returns findings by severity.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `format` | `feed3x4` · `feed4x5` · `square1x1` · `story9x16` · `reelsCover` · `link191` · `youtubeThumb` · `landscape16x9` |  |  |
| `renderPath` | string |  | Rendered file to measure loudness (needs ffmpeg). |
| `targetLufs` | number |  | Default −14 (social/YouTube); −16 for podcasts and long talks. |
| `gapTracks` | object[] |  | Tracks that must not have gaps (default V1 and A1). |

## `pr_execute_uxp_script`

Premiere Pro UXP escape hatch: execute arbitrary async JavaScript in Premiere Pro's UXP environment with `ppro` (the premierepro module), `project` (the active project) and `uxp` in scope; `return` the result. Requires the Premiere UXP panel.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `code` | string | yes | Async JavaScript body to execute in Premiere UXP. |
| `transactionName` | string |  |  Default: `"MCP Premiere UXP Action"`. |

## `pr_execute_extendscript`

Premiere Pro ExtendScript + QE DOM escape hatch: execute arbitrary .jsx ExtendScript in Premiere Pro with `app.project` and `qe.project` (`app.enableQE()`) enabled.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `code` | string | yes | ExtendScript (ES3) code to evaluate in Premiere Pro. |
| `enableQE` | boolean |  |  Default: `true`. |

## `pr_assemble_reel`

Recipe: talking-head reel in one call. Imports the clips (in order) into a bin, creates the sequence from the first clip, removes the pauses of each clip (silence detection → cut plan, audio and video together), transcribes and builds captions re-timed to the cuts (styled .mogrt per cue, or Premiere's caption track), lays a music bed on A2 trimmed to the edit and ducked under the speech, audits the timeline and can queue the export in Media Encoder. Everything stays editable. Transcription needs the optional speech packages (SETUP.bat).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `clips` | string[] | yes | Absolute paths of the talking clips, in order. |
| `sequenceName` | string |  |  Default: `"Reel"`. |
| `binName` | string |  |  Default: `"Reel MCP"`. |
| `cutPauses` | boolean |  |  Default: `true`. |
| `minSilence` | number |  | Pauses at least this long are cut (s). Default: `0.45`. |
| `padding` | number |  | Breath kept around speech (s). Default: `0.1`. |
| `captions` | `mogrt` · `native` · `none` |  | Default: mogrt when captionsMogrt is given, else native. |
| `captionsMogrt` | string |  | Caption .mogrt (e.g. exported with ae_export_mogrt). |
| `captionsTrack` | integer |  | Video track for .mogrt captions (0 = V1). Default: `2`. |
| `language` | string |  | ISO code of the speech (pt, de, en). Empty = detect. |
| `model` | `tiny` · `base` · `small` · `medium` |  |  |
| `glossary` | object |  | Wrong → right, e.g. {'chat de apt': 'ChatGPT'}. |
| `terms` | string[] |  | Names/brands spelled right; close-sounding runs of words are fixed (e.g. ['Levatio']). |
| `maxChars` | integer |  |  Default: `26`. |
| `maxLines` | integer |  |  Default: `2`. |
| `uppercase` | boolean |  |  |
| `srtPath` | string |  | Where to write the SRT (default: next to the first clip). |
| `musicPath` | string |  |  |
| `musicBaseDb` | number |  |  Default: `-8`. |
| `musicDuckDb` | number |  |  Default: `14`. |
| `format` | `feed3x4` · `feed4x5` · `square1x1` · `story9x16` · `reelsCover` · `link191` · `youtubeThumb` · `landscape16x9` |  |  Default: `"story9x16"`. |
| `exportPath` | string |  | Queue the export in Media Encoder to this file (H.264). |
| `presetPath` | string |  |  |
