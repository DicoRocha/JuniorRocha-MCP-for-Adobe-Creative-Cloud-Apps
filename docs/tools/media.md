# Media and text

Analysis of audio and video files outside the apps (beats, silence, transcription) and text helpers.

[← All tools](README.md)

| Tool | What it does |
|---|---|
| [`media_transcribe`](#media_transcribe) | Transcribe speech in a video or audio file locally (Whisper via sherpa-onnx, CPU, no cloud; the model downloads once from GitHub). |
| [`media_normalize_loudness`](#media_normalize_loudness) | Normalise the loudness of a video or audio file in two passes (EBU R128 loudnorm): default -14 LUFS and -1.5 dBTP for Instagram/Reels. |
| [`media_zone_report`](#media_zone_report) | Zone System report of a photo or a video frame (CIE L*: zone 0 = black … X = white): percent per zone, clipped shadows/highlights, mean L*, key (low/mid/high), colour cast of… |
| [`media_job_status`](#media_job_status) | Status and result of a media job (media_transcribe, media_analyze_audio on long files). |
| [`media_build_captions`](#media_build_captions) | Turn a transcript (file from media_transcribe, or segments) into caption cues and an SRT: glossary fixes, line length, lines per cue, minimum time on screen, optional upper case. |
| [`text_balance_lines`](#text_balance_lines) | Break a title or short support text into balanced lines: no single word alone on the last line, lines of similar width, no line ending in a connector (de, o, em, the, of…). |
| [`media_analyze_audio`](#media_analyze_audio) | Analyse the audio of a file (WAV read directly, others through ffmpeg): loudness (peak, RMS, gated level, noise floor), silences and speech ranges, a cut plan that removes… |

## `media_transcribe`

Transcribe speech in a video or audio file locally (Whisper via sherpa-onnx, CPU, no cloud; the model downloads once from GitHub). Writes <name>.transcript.json and <name>.srt next to the file (or in outputDir) and returns the segments. Long files continue as a job: poll media_job_status. Then fix names with a glossary in media_build_captions and import with pr_import_captions.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `filePath` | string | yes | Absolute path to a video or audio file. |
| `language` | string |  | ISO code of the spoken language (pt, de, en…). Empty = detect. |
| `model` | `tiny` · `base` · `small` · `medium` |  |  Default: `"small"`. |
| `wordTimestamps` | boolean |  | Real time of every word (Parakeet TDT v3; ~480 MB download once). Also writes <name>.words.json for word-by-word animated captions. Use it for any animated caption. |
| `outputDir` | string |  |  |
| `maxChars` | integer |  | Characters per line (reels 24–32, widescreen 42). Default 32. |
| `maxLines` | integer |  | Lines per caption (reels 1–2). Default 2. |
| `minDuration` | number |  |  |
| `maxDuration` | number |  |  |
| `uppercase` | boolean |  |  |
| `stripPunctuation` | boolean |  |  |
| `glossary` | object |  | Corrections 'wrong' → 'right' applied before splitting, e.g. {'chat GPP': 'ChatGPT', 'em camadas': 'em camadas'}. |
| `terms` | string[] |  | Names and brands spelled right (5+ letters); runs of 1–3 words that sound close are fixed, e.g. ['Levatio', 'ChatGPT', 'Invisalign']. |
| `waitSeconds` | number |  |  Default: `45`. |

## `media_normalize_loudness`

Normalise the loudness of a video or audio file in two passes (EBU R128 loudnorm): default -14 LUFS and -1.5 dBTP for Instagram/Reels. Video is copied untouched; streams are mapped by type. Writes a new file (the original stays) and reports the level before and after. Long files become a job: poll media_job_status.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `filePath` | string | yes |  |
| `outputPath` | string | yes | New file (must differ from filePath). .wav/.mp3/.m4a = audio only. |
| `lufs` | number |  |  Default: `-14`. |
| `truePeak` | number |  |  Default: `-1.5`. |
| `lra` | number |  |  Default: `11`. |
| `waitSeconds` | integer |  |  Default: `45`. |

## `media_zone_report`

Zone System report of a photo or a video frame (CIE L*: zone 0 = black … X = white): percent per zone, clipped shadows/highlights, mean L*, key (low/mid/high), colour cast of the midtones and a diagnosis (FLAT, NO_BLACK, HIGHLIGHTS_CLIPPED, MIDTONE_CAST…). Optional zone map PNG (each pixel painted with its zone grey). Use before and after a grade.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `filePath` | string | yes | Image (jpg, png, tif, exported preview) or video. |
| `atSeconds` | number |  | Video: the frame to read. |
| `width` | integer |  | Analysis width (the image is scaled down). Default: `512`. |
| `zoneMapPath` | string |  | Write the zone map PNG here. |

## `media_job_status`

Status and result of a media job (media_transcribe, media_analyze_audio on long files). Without jobId, lists the jobs.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `jobId` | string |  |  |

## `media_build_captions`

Turn a transcript (file from media_transcribe, or segments) into caption cues and an SRT: glossary fixes, line length, lines per cue, minimum time on screen, optional upper case. Pass keep (the cut plan's kept ranges, in source seconds) to re-time the captions to the edited clip. Also re-styles an existing SRT.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `transcriptPath` | string |  |  |
| `segments` | object[] |  |  |
| `srtPath` | string |  | Re-style an existing SRT instead of a transcript. |
| `keep` | object[] |  |  |
| `offsetSeconds` | number |  | Shift every cue (e.g. the clip starts at 2.5 s on the timeline). |
| `outputPath` | string | yes | Where to write the .srt. |
| `kitPath` | string |  | Brand kit (00_briefing/kit-de-marca.json): its termos, glossario and client name fix the spelling too. |
| `maxChars` | integer |  | Characters per line (reels 24–32, widescreen 42). Default 32. |
| `maxLines` | integer |  | Lines per caption (reels 1–2). Default 2. |
| `minDuration` | number |  |  |
| `maxDuration` | number |  |  |
| `uppercase` | boolean |  |  |
| `stripPunctuation` | boolean |  |  |
| `glossary` | object |  | Corrections 'wrong' → 'right' applied before splitting, e.g. {'chat GPP': 'ChatGPT', 'em camadas': 'em camadas'}. |
| `terms` | string[] |  | Names and brands spelled right (5+ letters); runs of 1–3 words that sound close are fixed, e.g. ['Levatio', 'ChatGPT', 'Invisalign']. |

## `text_balance_lines`

Break a title or short support text into balanced lines: no single word alone on the last line, lines of similar width, no line ending in a connector (de, o, em, the, of…). Give maxChars (box width in characters) and/or the number of lines. Use the returned lines as explicit line breaks in the app (works for any app; no document needed).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `text` | string | yes |  |
| `maxChars` | integer |  | Maximum characters per line. |
| `lines` | integer |  | Force this number of lines. |

## `media_analyze_audio`

Analyse the audio of a file (WAV read directly, others through ffmpeg): loudness (peak, RMS, gated level, noise floor), silences and speech ranges, a cut plan that removes pauses (keep/remove ranges for pr_apply_cut_plan), beats/BPM for music, and ducking keyframes for a music bed under speech (pr_duck_music).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `filePath` | string | yes |  |
| `analyses` | `loudness` · `silences` · `cutPlan` · `beats` · `ducking`[] |  |  Default: `["loudness","silences","cutPlan"]`. |
| `thresholdDb` | number |  | Silence threshold in dBFS (default: noise floor + 12 dB). |
| `minSilence` | number |  | Shortest pause counted as silence, s (default 0.4). |
| `padding` | number |  | Cut plan: breath kept around speech, s (default 0.12). |
| `minGap` | number |  | Cut plan: pauses shorter than this stay (default 0.35). |
| `duckDb` | number |  | Ducking: how far the music goes down under speech, dB (default 14). |
| `speechRanges` | object[] |  | Ducking: speech ranges on the timeline (default: from this file). |
