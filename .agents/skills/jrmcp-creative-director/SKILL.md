---
name: jrmcp-creative-director
description: >-
  Cross-application orchestration skill for coordinating multi-app creative pipelines across
  Adobe Illustrator, Photoshop, After Effects, Premiere Pro, InDesign and Lightroom Classic using the Junior Rocha MCP.
  Use this skill when a task spans two or more Adobe applications (e.g., designing a logo in Illustrator,
  texturing in Photoshop, animating in After Effects, and editing into a Premiere Pro timeline).
---

# Adobe Creative Director — Multi-App Orchestration Skill (`adobe_*`)

## 1. Pre-Flight Check
1. Call `jradb_get_status`. For each app it reports `installed`, `running`, `wsConnected` and
   `comFallbackAvailable`; `hub.role` should be `leader` or `follower`. If it is `offline`, `hub.error`
   says why (usually another program holding port 31001) and no panel can connect until that is fixed.
2. Start missing apps with `jradb_launch_app`, then ask the user to open the panels:
   - After Effects, Premiere Pro, Illustrator: `Window > Extensions > Junior Rocha MCP`
   - Photoshop: `Plugins > Junior Rocha MCP`
   - InDesign: `Window > Extensions > Junior Rocha MCP` (Windows COM works without it)
   - Lightroom Classic: nothing to open; its plug-in starts with Lightroom
   Premiere Pro does nothing without its panel. After Effects must at least be running.
3. Load the skill of each app involved; every app has its own units, colors and coordinate rules.

## 2. Moving assets between apps
`jradb_bridge_transfer` exports the active document and imports the file in one call:
`sourceApp`, `targetApp`, `exchangeFilePath` (absolute path of the file to write), `format`, `importAsComp`.

| From | To | `format` |
|---|---|---|
| Illustrator | After Effects or Premiere Pro | `png` |
| Photoshop | After Effects or Premiere Pro | `png` or `psd` (`importAsComp: true` keeps layers in After Effects) |

After Effects and Premiere Pro do not import SVG. To keep Illustrator layers, save the `.ai` with
`ai_manage_document` (`operation: "save"`, `filePath`) and import it with `ae_manage_project`
(`operation: "import"`, `filePath`, `importAs: "compCroppedLayers"`).

## 3. Standard Production Pipelines
See [cross-app-pipelines.md](./references/cross-app-pipelines.md):
1. Vector logo to animated intro (Illustrator → After Effects → Premiere Pro).
2. Photo cutout to animated promo (Photoshop → After Effects).

Verify visually at every hand-off (`ai_get_artboard_preview`, `ps_get_canvas_snapshot`,
`ae_get_comp_frame_preview`, `pr_export_frame_or_sequence`) before moving to the next app.

## Lightroom Classic in pipelines
- **Photo → layout**: grade in Lightroom (`lr_apply_develop_preset` / `lr_copy_develop_settings`) → `lr_export_photos`
  (TIFF AdobeRGB for print, JPEG sRGB for screen) into a project folder → `id_place_file` the returned paths in InDesign.
- **Photo → retouch**: `lr_export_photos format:"PSD"` → `ps_open_document` → retouch → save next to the original →
  `lr_import_photos` the PSD back into the catalog (optionally into the same collection).
- **Photo → motion/edit**: export JPEG/TIFF sequences or stills, then `ae_*`/`pr_import_media` with the returned paths.

