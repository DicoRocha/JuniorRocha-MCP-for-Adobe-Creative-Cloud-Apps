---
name: jrmcp-premiere-editor
description: >-
  Specialized workflow and reference guide for controlling Adobe Premiere Pro via MCP (pr_* tools).
  Use this skill whenever the user asks to edit video timelines, import media into bins, place clips,
  adjust Motion/Opacity/Volume, apply video/audio effects and transitions, manage markers, or export frames/sequences.
---

# Adobe Premiere Pro Video Editor Skill (`pr_*`)

## 1. Critical Rules
- **A panel must be open.** Premiere has no panel-less fallback. Almost every `pr_*` tool runs through the
  CEP panel (`Window > Extensions > Junior Rocha MCP`). The UXP panel (`Plugins > Junior Rocha MCP`)
  only serves `pr_get_project_info`, `pr_import_media` and `pr_execute_uxp_script`; the router sends the rest
  to CEP automatically. If a call answers `ACTION_NOT_SUPPORTED` or `BRIDGE_NOT_CONNECTED`, ask the user to
  open the CEP panel.
- **Time**: `pr_*` tools take **seconds**. Raw ExtendScript uses **ticks** (`1 s = 254016000000` ticks, as strings).
- **Indices are 0-based**: `videoTrackIndex: 0` is V1, `trackIndex: 0` / `clipIndex: 0` is the first clip.
- **Effect and transition names are the UI names in the app's language.** The lists in
  [premiere-qe-effects.md](./references/premiere-qe-effects.md) are the English names; in a translated
  Premiere read the real names first (see that file).

## 2. Standard Editing Workflow
1. **Project**: `pr_get_project_info` returns sequences and the bin tree (`name`, `nodeId`, `mediaPath`).
2. **Bins and import**: create a bin with `pr_manage_project` (`operation: "createBin"`, `binName`), then
   `pr_import_media` with `filePaths` and `targetBinName` (a bin **name**, not a path; it must already exist).
3. **Sequence**: `pr_create_sequence` with `name` and `fromClipName` (matches the clip's settings).
   Without `fromClipName` Premiere opens its New Sequence dialog and waits for the user.
4. **Inspect**: `pr_get_sequence_state` before placing or changing clips.
5. **Place**: `pr_place_clip_on_timeline` with `clipNameOrPath`, `videoTrackIndex`, `timeSeconds`,
   `mode: "overwrite" | "insert"`.
6. **Adjust**: `pr_modify_timeline_clip` with `trackType`, `trackIndex`, `clipIndex` and either
   `disabled`, `remove` (+ `ripple`), or `componentName` + `componentProperties`, e.g.
   `componentName: "Motion", componentProperties: { "Scale": 120, "Rotation": 15 }`.
7. **Effects / transitions**: `pr_apply_effect_or_transition` with `trackType`, `trackIndex`, `clipIndex`
   and **either** `effectName` **or** `transitionName` (+ `atStart`).
8. **Markers**: `pr_manage_markers` (`operation: "list" | "add"`, `timeSeconds`, `name`, `comments`).
9. **Verify**: `pr_export_frame_or_sequence` with `mode: "frame"` returns the Program Monitor frame at the
   playhead; look at it before reporting the work as done.

## 3. Escape hatches
- `pr_execute_extendscript` (`code`): ES3 only; `qe` is enabled by default. The value of the last
  expression is returned (a top-level `return` also works).
- `pr_execute_uxp_script` (`code`): modern async JS with `ppro`, `project` and `uxp` in scope; needs the
  UXP panel and must `return` its result.

## 4. Effects and transitions (v1.2)
- Names follow Premiere's language: start with `pr_list_effects` (`kind`: videoEffects, audioEffects,
  videoTransitions, audioTransitions; `search` ignores accents and case).
- Transition at every cut of a track: `pr_apply_transition` with `transitionName`, `allCuts: true`,
  `durationSeconds`. One edge: `clipIndex` + `position: "start" | "end" | "both"`.
- `pr_apply_effect` (one clip, `clipIndices` or `allClips`) can set `parameters` and `keyframes` at once and
  returns the new component's parameters.
- `pr_list_clip_effects` → exact component and parameter names (Motion, Opacity, Volume, Lumetri…) →
  `pr_set_effect_params` for values and keyframes (seconds in sequence time).
- `pr_set_volume` takes **dB** (0 dB = unchanged); it converts to Premiere's internal level.
- Clip indices are 0-based and ignore gaps.
