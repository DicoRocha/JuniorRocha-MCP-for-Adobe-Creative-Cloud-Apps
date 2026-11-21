---
name: jrmcp-indesign-layout
description: Layout, typography and print/digital output in Adobe InDesign through the id_* tools — documents, pages, text frames, styles, images, tables, find/change, preflight and export. Use for flyers, posters, magazines, catalogues, reports, social posts and any multi-page layout.
---

# Adobe InDesign Layout Skill (`id_*`)

## 1. Critical rules
- **Units**: every id_ tool takes `units` (`mm` default, also `pt`, `px`, `cm`, `in`, `pica`). Print → mm; social/web → px.
- **Coordinates**: `rect` / `position` are `{x, y, width, height}` from the **top-left of the page** (y grows down),
  whatever the user's ruler settings; the tools set and restore page origin themselves.
- **One undo step per call.** Each id_ call (and a whole `jradb_batch` with `app: "indesign"`) is a single Edit > Undo.
- **Target objects by `ids`** returned by `id_find_objects` / creation tools; names can repeat.
- Start with `id_get_document_info`: pages, parent pages, styles and swatches that already exist.

## 2. Build order (professional workflow)
1. Document: `id_manage_document` create with final size, `bleed` (3 mm print, 0 for screen), `margins`, `columns`,
   `facingPages` for spreads, `intent: "web"` for screen.
2. Swatches: `id_swatches add` with the brand colours (CMYK for print, RGB for screen). Name them.
3. Styles BEFORE content: `id_manage_styles create` paragraph styles (Title, Subtitle, Body, Caption) and character
   styles (Bold, Highlight); object styles for repeated boxes. Then text uses `format.paragraphStyle`.
4. Parent pages for repeated elements (logo, page numbers); `id_manage_pages` applyParent.
5. Content: `id_create_text_frame`, `id_place_file` (fit `fill` for photos, `proportionally` for logos),
   `id_create_shape`, `id_create_table`.
6. Clean-up: `id_find_change` (GREP) — double spaces `find: "  +"`, `replace: " "`; straight quotes; apply character
   styles to patterns (e.g. prices `R\\$\\s?\\d+`).
7. Check: `id_preflight` must return `ok: true`; fix overset text (bigger frame, `frame.autoSize`, or thread with `threadTo`).
8. Look: `id_get_page_preview` for every page you changed.
9. Output: `id_export` — print `pdfPreset: "[PDF/X-4:2008]"` or `"[High Quality Print]"`; screen/email
   `"[Smallest File Size]"`; images `jpg`/`png` with `resolution`; hand-off `idml`.

## 3. Typography and layout rules
- Body 9–12 pt for print (leading ≈ 120–140 % of size); 16–24 px on screen. Max ~60–75 characters per line.
- 2–3 type sizes per page from a scale (e.g. 10 / 14 / 20 / 32 pt). One or two families.
- Align to the margin/column grid; keep equal gutters; consistent spacing via spaceBefore/spaceAfter, not empty paragraphs.
- Images for print: effective PPI ≥ 300 (preflight warns below `minPpi`). Never upscale a low-res image to fill a page.
- Contrast: dark text on light or the reverse; no small text over busy photos without a box or shadow.
- Bleed: anything touching the trim must extend into the bleed (place backgrounds at x = -bleed, width + 2×bleed).

## 4. Common sizes
| Piece | Size |
|---|---|
| A4 / A5 flyer | 210×297 mm / 148×210 mm (+3 mm bleed) |
| Business card (BR) | 90×50 mm |
| Instagram post / story | 1080×1350 px / 1080×1920 px |
| Banner 16:9 | 1920×1080 px |

## 5. Escape hatch
`id_execute_extendscript` (ES3: `var`, no arrow functions/template literals). The last expression is returned.
Use for Books, Data Merge, XML, interactive/EPUB details, GREP styles, anchored objects, and anything not typed above.
