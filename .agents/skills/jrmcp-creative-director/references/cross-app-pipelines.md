# Cross-Application Production Pipelines Reference

---

## Pipeline 1: Vector Logo to Animated Intro (Illustrator → After Effects → Premiere Pro)
1. **Illustrator (`ai_*`)**
   - `ai_manage_document` (`operation: "create"`, `width: 1920`, `height: 1080`). Keep the `artboardRect`
     from the answer: every coordinate is `aiX = abLeft + x`, `aiY = abTop - y`.
   - One top-level layer per animated part with `ai_manage_layers` (`operation: "add"`, `name`), e.g.
     `"Logo_Icon"`, `"Logo_Text"`, `"Background"`.
   - Draw with `ai_create_shape`, `ai_create_bezier_path`, `ai_create_text` (`createOutlines: true`).
   - Check with `ai_get_artboard_preview`.
   - `ai_manage_document` (`operation: "save"`, `filePath: ".../logo.ai"`).
2. **After Effects (`ae_*`)**
   - `ae_manage_project` (`operation: "import"`, `filePath: ".../logo.ai"`, `importAs: "compCroppedLayers"`)
     creates a composition with one layer per Illustrator layer.
   - Animate with `ae_set_keyframes` (`easing: "easeInOut"`, `influence: 75`) and `ae_set_expression`.
   - Check frames with `ae_get_comp_frame_preview` (`time: 0.5`, `time: 2.0`).
   - `ae_render_queue` (`outputPath`, `startRenderImmediately: true`).
3. **Premiere Pro (`pr_*`)**
   - `pr_manage_project` (`operation: "createBin"`, `binName: "Intros"`).
   - `pr_import_media` (`filePaths: [rendered file]`, `targetBinName: "Intros"`).
   - `pr_place_clip_on_timeline` (`clipNameOrPath`, `videoTrackIndex: 0`, `timeSeconds: 0`).

---

## Pipeline 2: Photo Cutout to Animated Promo (Photoshop → After Effects)
1. **Photoshop (`ps_*`)**
   - `ps_open_document` (`filePath`).
   - `ps_selection_and_masks` (`operation: "selectSubject"`), then (`operation: "addMaskFromSelection"`);
     or (`operation: "removeBackground"`) in one step.
   - Grade with `ps_effects_and_adjustments` (`category: "adjustmentLayer"`), shadow with
     (`category: "layerStyle"`, `type: "dropShadow"`).
   - Check with `ps_get_canvas_snapshot`.
2. **Transfer**
   - `jradb_bridge_transfer` (`sourceApp: "photoshop"`, `targetApp: "after-effects"`,
     `exchangeFilePath: ".../cutout.psd"`, `format: "psd"`, `importAsComp: true`).
3. **After Effects (`ae_*`)**
   - Animate scale/position of the subject and add typography; verify with `ae_get_comp_frame_preview`.
