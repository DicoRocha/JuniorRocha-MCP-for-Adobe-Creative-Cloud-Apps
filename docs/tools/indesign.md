# InDesign

Documents, text frames, styles, tables, links, data merge, preflight and export.

[← All tools](README.md)

| Tool | What it does |
|---|---|
| [`id_get_document_info`](#id_get_document_info) | InDesign: open documents and, for the active one, page size, bleed, pages with their parent pages, layers, paragraph / character / object styles, swatches and counts. |
| [`id_manage_document`](#id_manage_document) | Create (size, pages, facing pages, margins, columns, bleed, print or web intent), open, save or close an InDesign document. |
| [`id_manage_pages`](#id_manage_pages) | Add pages (after a page or at the end, with a parent page), remove, duplicate, move, or apply a parent page (master). |
| [`id_find_objects`](#id_find_objects) | Find frames and shapes: by type (TextFrame, Rectangle, Oval, Polygon, GraphicLine, Group), name, page, layer or text content. |
| [`id_modify_objects`](#id_modify_objects) | Edit frames and shapes (by ids, names or selection): move, move by, resize, rotate, duplicate, fill, stroke, corner radius, opacity, blend mode, drop shadow, object style,… |
| [`id_create_text_frame`](#id_create_text_frame) | Create a text frame on a page with text, formatting (paragraph/character style or direct font, size, leading, colour, alignment) and frame options (columns, inset, vertical… |
| [`id_edit_text`](#id_edit_text) | Change the text of frames (replace or append), format the whole story or one paragraph, change frame options, or thread the frame into another frame (threadTo). |
| [`id_find_change`](#id_find_change) | Find / change across the whole document: plain text or GREP. |
| [`id_create_shape`](#id_create_shape) | Draw a rectangle, ellipse, polygon/star or line with fill, stroke, corner radius, opacity, blend mode and drop shadow. |
| [`id_place_file`](#id_place_file) | Place an image, PDF, AI/PSD or a Word/RTF/TXT file: into a new frame (page + rect) or into an existing frame (intoId), with fitting (fill, proportionally, contentAware...). |
| [`id_manage_styles`](#id_manage_styles) | List, create, update or apply paragraph, character, object, table and cell styles. |
| [`id_swatches`](#id_swatches) | List the document's swatches or add a colour swatch ('#RRGGBB', [r,g,b] or [c,m,y,k]) with an optional name. |
| [`id_create_table`](#id_create_table) | Create a table in a new text frame from a 2-D array of values (rows × columns), with header rows, table style and header fill. |
| [`id_manage_layers`](#id_manage_layers) | List, add, rename, show/hide, lock/unlock or remove document layers. |
| [`id_preflight`](#id_preflight) | Check the document before export: overset text, missing or modified links, low-resolution images (minPpi), missing fonts, empty text frames, and optionally a named preflight… |
| [`id_links`](#id_links) | List placed files (links) with status, update modified links, or relink one (name + newPath). |
| [`id_export`](#id_export) | Export the active document: PDF (with a PDF preset such as '[High Quality Print]' or '[PDF/X-4:2008]' and a page range), JPG/PNG (resolution, page range), IDML, reflowable EPUB… |
| [`id_manage_sections`](#id_manage_sections) | Sections and page numbering: list the sections, or set one starting on a page (start number or continue, numbering style arabic / romanUpper / romanLower / lettersUpper /… |
| [`id_text_wrap`](#id_text_wrap) | Text wrap around objects: none, boundingBox, contour, jumpObject or nextColumn, with an offset (one number, or [top, left, bottom, right]) in the units of the call. |
| [`id_qr_code`](#id_qr_code) | Create a QR code as vector artwork in a new frame: a web address (url), plain text, or an e-mail (address in value, plus subject and body). |
| [`id_paragraph_options`](#id_paragraph_options) | Paragraph options on text frames (every paragraph of the story, or one by paragraphIndex): drop cap (lines and characters), a heading that spans the columns of a multi-column… |
| [`id_anchor_object`](#id_anchor_object) | Anchor an object to text so it moves with it: inline (sits in the line like a character), aboveLine, or custom. |
| [`id_thread_text`](#id_thread_text) | Thread text frames into one story in reading order (ids or names, in order), unthread them, or report the chain and overset. |
| [`id_create_toc`](#id_create_toc) | Create or update a table of contents from paragraph styles (e.g. |
| [`id_package`](#id_package) | Package the document for the print shop (File > Package): copies fonts, linked images and the .indd into a folder, updates modified links, writes the instructions report and… |
| [`id_audit_document`](#id_audit_document) | Check an InDesign document beyond preflight: overset text, text without paragraph styles, type below the minimum size, text closer than 3 mm to the trim, missing bleed,… |
| [`id_data_merge`](#id_data_merge) | Data merge without the Data Merge panel: the template page(s) carry {{field}} in text and frames named {{field}} for images; each record (CSV/TSV/JSON or inline) gets its own… |
| [`id_get_page_preview`](#id_get_page_preview) | Visual check: render one InDesign page to JPEG and return it as an image. |
| [`id_execute_extendscript`](#id_execute_extendscript) | InDesign escape hatch: run ExtendScript (ES3) with `app` in scope, as one undo step. |
| [`id_recipe_flyer`](#id_recipe_flyer) | Recipe: a print-ready flyer/poster in one call, in a NEW InDesign document. |
| [`id_recipe_catalog`](#id_recipe_catalog) | Recipe: product catalogue / price list from a spreadsheet in one call, in a NEW InDesign document. |
| [`id_recipe_manual_skeleton`](#id_recipe_manual_skeleton) | Recipe: skeleton of a manual / handbook / guide in one call, in a NEW InDesign document (facing pages by default, white paper theme). |

## `id_get_document_info`

InDesign: open documents and, for the active one, page size, bleed, pages with their parent pages, layers, paragraph / character / object styles, swatches and counts. Call this first.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `units` | `mm` · `cm` · `pt` · `px` · `in` · `pica` |  | Measurement unit for every number in this call (default mm). Default: `"mm"`. |

## `id_manage_document`

Create (size, pages, facing pages, margins, columns, bleed, print or web intent), open, save or close an InDesign document.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `operation` | `create` · `open` · `save` · `close` | yes |  |
| `units` | `mm` · `cm` · `pt` · `px` · `in` · `pica` |  | Measurement unit for every number in this call (default mm). Default: `"mm"`. |
| `width` | number |  | Page width (default 210 mm). |
| `height` | number |  | Page height (default 297 mm). |
| `pages` | integer |  |  |
| `facingPages` | boolean |  |  |
| `margins` | number |  |  |
| `columns` | integer |  |  |
| `gutter` | number |  |  |
| `bleed` | number |  |  |
| `intent` | `print` · `web` |  |  |
| `filePath` | string |  | For open / save (.indd). |
| `save` | boolean |  | For close: save first. |

## `id_manage_pages`

Add pages (after a page or at the end, with a parent page), remove, duplicate, move, or apply a parent page (master).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `operation` | `add` · `remove` · `duplicate` · `move` · `applyParent` | yes |  |
| `page` | integer or string |  | 1-based page number or page name; defaults to the active page. |
| `afterPage` | any |  |  |
| `toPage` | any |  | For move: place after this page. |
| `count` | integer |  |  |
| `parent` | string |  | Parent page name or prefix, e.g. 'A-Parent' or 'A'; 'None' removes it. |

## `id_find_objects`

Find frames and shapes: by type (TextFrame, Rectangle, Oval, Polygon, GraphicLine, Group), name, page, layer or text content. Returns id (use it in other id_ tools), page, x/y/width/height from the page's top-left, text preview, overset and linked file.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `units` | `mm` · `cm` · `pt` · `px` · `in` · `pica` |  | Measurement unit for every number in this call (default mm). Default: `"mm"`. |
| `type` | string |  |  |
| `name` | string |  |  |
| `nameContains` | string |  |  |
| `textContains` | string |  |  |
| `page` | string |  | Page name, e.g. '1'. |
| `layer` | string |  |  |
| `limit` | integer |  |  Default: `300`. |

## `id_modify_objects`

Edit frames and shapes (by ids, names or selection): move, move by, resize, rotate, duplicate, fill, stroke, corner radius, opacity, blend mode, drop shadow, object style, layer, fit content (images), stacking order, lock, hide, rename or delete. Returns the objects afterwards.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `ids` | integer[] |  | Object ids from id_find_objects (most reliable). |
| `names` | string[] |  | Object names (Layers panel). |
| `useSelection` | boolean |  | Use the current selection when no ids / names are given. Default: `true`. |
| `units` | `mm` · `cm` · `pt` · `px` · `in` · `pica` |  | Measurement unit for every number in this call (default mm). Default: `"mm"`. |
| `position` | object |  | New top-left from the page's top-left. |
| `moveBy` | object |  |  |
| `size` | object |  |  |
| `rotate` | number |  | Absolute rotation in degrees. |
| `duplicate` | boolean |  | Edit a duplicate instead of the original. |
| `fillColor` | string or number[] |  | Swatch name ('Black', 'Paper', 'None', a document swatch), '#RRGGBB', [r,g,b] 0-255 or [c,m,y,k] 0-100. |
| `strokeColor` | any |  | Swatch name ('Black', 'Paper', 'None', a document swatch), '#RRGGBB', [r,g,b] 0-255 or [c,m,y,k] 0-100. |
| `strokeWeight` | number |  | Points. |
| `cornerRadius` | number |  |  |
| `opacity` | number |  |  |
| `blendMode` | string |  | normal, multiply, screen, overlay, softLight, hardLight, darken, lighten, colorDodge, colorBurn, difference, exclusion, hue, saturation, color, luminosity. |
| `dropShadow` | object |  |  |
| `feather` | object |  | Feather effect (Effects panel): gradient fade toward one side, soft edges, or per-side feather. type 'none' removes them. Photo dissolving into a dark text panel: fit the frame to the whole image so it runs under the text, then { type: 'directional', sides: { bottom: ~35% of the frame height } }. |
| `objectStyle` | string |  |  |
| `layer` | string |  |  |
| `name` | string |  |  |
| `fit` | `proportionally` · `fill` · `contentToFrame` · `frameToContent` · `center` · `contentAware` |  |  |
| `zOrder` | `bringToFront` · `bringForward` · `sendBackward` · `sendToBack` |  |  |
| `locked` | boolean |  |  |
| `visible` | boolean |  |  |
| `remove` | boolean |  |  |

## `id_create_text_frame`

Create a text frame on a page with text, formatting (paragraph/character style or direct font, size, leading, colour, alignment) and frame options (columns, inset, vertical alignment, auto-size). Reports overset text.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `units` | `mm` · `cm` · `pt` · `px` · `in` · `pica` |  | Measurement unit for every number in this call (default mm). Default: `"mm"`. |
| `page` | integer or string |  | 1-based page number or page name; defaults to the active page. |
| `rect` | object | yes | Frame from the top-left of the page: x, y, width, height in `units`. |
| `contents` | string | yes | Text; use \r for new paragraphs. |
| `format` | object |  |  |
| `frame` | object |  |  |
| `fillColor` | any |  | Swatch name ('Black', 'Paper', 'None', a document swatch), '#RRGGBB', [r,g,b] 0-255 or [c,m,y,k] 0-100. |
| `objectStyle` | string |  |  |
| `layer` | string |  |  |
| `name` | string |  |  |

## `id_edit_text`

Change the text of frames (replace or append), format the whole story or one paragraph, change frame options, or thread the frame into another frame (threadTo).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `ids` | integer[] |  | Object ids from id_find_objects (most reliable). |
| `names` | string[] |  | Object names (Layers panel). |
| `useSelection` | boolean |  | Use the current selection when no ids / names are given. Default: `true`. |
| `units` | `mm` · `cm` · `pt` · `px` · `in` · `pica` |  | Measurement unit for every number in this call (default mm). Default: `"mm"`. |
| `contents` | string |  |  |
| `append` | string |  |  |
| `paragraphIndex` | integer |  | Format only this paragraph (0-based). |
| `format` | object |  |  |
| `frame` | object |  |  |
| `threadTo` | integer |  | Id of the next frame in the thread. |

## `id_find_change`

Find / change across the whole document: plain text or GREP. Without a change it only finds (count + samples). Can replace text and/or apply a paragraph style, character style or colour to every match.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `mode` | `text` · `grep` |  |  Default: `"text"`. |
| `find` | string | yes |  |
| `replace` | string |  |  |
| `applyParagraphStyle` | string |  |  |
| `applyCharacterStyle` | string |  |  |
| `color` | string or number[] |  | Swatch name ('Black', 'Paper', 'None', a document swatch), '#RRGGBB', [r,g,b] 0-255 or [c,m,y,k] 0-100. |
| `caseSensitive` | boolean |  |  |
| `wholeWord` | boolean |  |  |
| `includeParentPages` | boolean |  |  |

## `id_create_shape`

Draw a rectangle, ellipse, polygon/star or line with fill, stroke, corner radius, opacity, blend mode and drop shadow.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `units` | `mm` · `cm` · `pt` · `px` · `in` · `pica` |  | Measurement unit for every number in this call (default mm). Default: `"mm"`. |
| `page` | integer or string |  | 1-based page number or page name; defaults to the active page. |
| `shape` | `rectangle` · `ellipse` · `polygon` · `line` |  |  Default: `"rectangle"`. |
| `rect` | object |  | Frame from the top-left of the page: x, y, width, height in `units`. |
| `sides` | integer |  | Polygon sides. |
| `starInset` | number |  | Star inset % (polygon). |
| `from` | object |  | Line start. |
| `to` | object |  | Line end. |
| `fillColor` | string or number[] |  | Swatch name ('Black', 'Paper', 'None', a document swatch), '#RRGGBB', [r,g,b] 0-255 or [c,m,y,k] 0-100. |
| `strokeColor` | any |  | Swatch name ('Black', 'Paper', 'None', a document swatch), '#RRGGBB', [r,g,b] 0-255 or [c,m,y,k] 0-100. |
| `strokeWeight` | number |  | Points. |
| `cornerRadius` | number |  |  |
| `opacity` | number |  |  |
| `blendMode` | string |  | normal, multiply, screen, overlay, softLight, hardLight, darken, lighten, colorDodge, colorBurn, difference, exclusion, hue, saturation, color, luminosity. |
| `dropShadow` | object |  |  |
| `feather` | object |  | Feather effect (Effects panel): gradient fade toward one side, soft edges, or per-side feather. type 'none' removes them. Photo dissolving into a dark text panel: fit the frame to the whole image so it runs under the text, then { type: 'directional', sides: { bottom: ~35% of the frame height } }. |
| `objectStyle` | string |  |  |
| `layer` | string |  |  |
| `name` | string |  |  |

## `id_place_file`

Place an image, PDF, AI/PSD or a Word/RTF/TXT file: into a new frame (page + rect) or into an existing frame (intoId), with fitting (fill, proportionally, contentAware...). Returns the frame and the image's effective PPI.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `units` | `mm` · `cm` · `pt` · `px` · `in` · `pica` |  | Measurement unit for every number in this call (default mm). Default: `"mm"`. |
| `filePath` | string | yes | Absolute path. |
| `page` | integer or string |  | 1-based page number or page name; defaults to the active page. |
| `rect` | object |  | Frame from the top-left of the page: x, y, width, height in `units`. |
| `intoId` | integer |  |  |
| `fit` | `proportionally` · `fill` · `contentToFrame` · `frameToContent` · `center` · `contentAware` |  |  Default: `"fill"`. |
| `name` | string |  |  |
| `layer` | string |  |  |
| `objectStyle` | string |  |  |

## `id_manage_styles`

List, create, update or apply paragraph, character, object, table and cell styles. Properties use friendly names: fontFamily, fontStyle, size, leading, tracking, color, align, spaceBefore, spaceAfter, firstLineIndent, hyphenation, capitalization (text styles); fillColor, strokeColor, strokeWeight (object styles); cell: fillColor, fillTint, paragraphStyle, inset, verticalAlign (top|center|bottom|justify), strokeColor, strokeWeight (all edges); table: headerCellStyle, bodyCellStyle, footerCellStyle, leftColumnCellStyle, rightColumnCellStyle (cell style names), rowFill + alternateRowFill (+ alternateRowTint) for zebra rows, borderColor, borderWeight, spaceBefore, spaceAfter. Build cell styles first, then the table style that uses them. Apply table/cell styles to text frames (ids/names) whose story holds tables; a property the app refuses comes back in warnings.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `ids` | integer[] |  | Object ids from id_find_objects (most reliable). |
| `names` | string[] |  | Object names (Layers panel). |
| `useSelection` | boolean |  | Use the current selection when no ids / names are given. Default: `true`. |
| `units` | `mm` · `cm` · `pt` · `px` · `in` · `pica` |  | Measurement unit for every number in this call (default mm). Default: `"mm"`. |
| `kind` | `paragraph` · `character` · `object` · `table` · `cell` |  |  Default: `"paragraph"`. |
| `operation` | `list` · `create` · `update` · `apply` |  |  Default: `"list"`. |
| `name` | string |  |  |
| `basedOn` | string |  |  |
| `properties` | object |  |  |
| `clearOverrides` | boolean |  | Apply table style: clear local table/cell formatting (default true). |
| `rows` | integer[] |  | Apply cell style: only these 0-based rows (default all cells). |

## `id_swatches`

List the document's swatches or add a colour swatch ('#RRGGBB', [r,g,b] or [c,m,y,k]) with an optional name.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `operation` | `list` · `add` |  |  Default: `"list"`. |
| `color` | string or number[] |  | Swatch name ('Black', 'Paper', 'None', a document swatch), '#RRGGBB', [r,g,b] 0-255 or [c,m,y,k] 0-100. |
| `name` | string |  |  |

## `id_create_table`

Create a table in a new text frame from a 2-D array of values (rows × columns), with header rows, table style and header fill.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `units` | `mm` · `cm` · `pt` · `px` · `in` · `pica` |  | Measurement unit for every number in this call (default mm). Default: `"mm"`. |
| `page` | integer or string |  | 1-based page number or page name; defaults to the active page. |
| `rect` | object | yes | Frame from the top-left of the page: x, y, width, height in `units`. |
| `data` | string or number[][] |  |  |
| `rows` | integer |  |  |
| `columns` | integer |  |  |
| `headerRows` | integer |  |  Default: `1`. |
| `tableStyle` | string |  |  |
| `headerFill` | string or number[] |  | Swatch name ('Black', 'Paper', 'None', a document swatch), '#RRGGBB', [r,g,b] 0-255 or [c,m,y,k] 0-100. |
| `name` | string |  |  |

## `id_manage_layers`

List, add, rename, show/hide, lock/unlock or remove document layers.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `operation` | `list` · `add` · `update` · `remove` |  |  Default: `"list"`. |
| `name` | string |  |  |
| `newName` | string |  |  |
| `visible` | boolean |  |  |
| `locked` | boolean |  |  |

## `id_preflight`

Check the document before export: overset text, missing or modified links, low-resolution images (minPpi), missing fonts, empty text frames, and optionally a named preflight profile. ok=true means no errors.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `minPpi` | number |  |  Default: `250`. |
| `profile` | string |  | Name of an InDesign preflight profile, e.g. '[Basic] (working)'. |

## `id_links`

List placed files (links) with status, update modified links, or relink one (name + newPath).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `operation` | `list` · `update` · `relink` |  |  Default: `"list"`. |
| `name` | string |  |  |
| `newPath` | string |  |  |

## `id_export`

Export the active document: PDF (with a PDF preset such as '[High Quality Print]' or '[PDF/X-4:2008]' and a page range), JPG/PNG (resolution, page range), IDML, reflowable EPUB or fixed-layout EPUB. PDF uses the document bleed by default (the stock presets do not) and adds crop marks on request. Missing output folders are created.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `format` | `pdf` · `jpg` · `png` · `idml` · `epub` · `fixedEpub` |  |  Default: `"pdf"`. |
| `filePath` | string | yes | Absolute output path. |
| `pdfPreset` | string |  |  |
| `bleed` | boolean |  | PDF: include the document bleed (default: true when the document has bleed). |
| `cropMarks` | boolean |  | PDF: crop and bleed marks, placed outside the bleed (default false; ask the print shop). |
| `pageRange` | string |  | e.g. '1-3,5'. Omit for all pages. |
| `resolution` | integer |  | JPG/PNG ppi (default 150). |
| `transparent` | boolean |  |  |

## `id_manage_sections`

Sections and page numbering: list the sections, or set one starting on a page (start number or continue, numbering style arabic / romanUpper / romanLower / lettersUpper / lettersLower, prefix, section marker text), or remove one. Use it for roman-numbered front matter, a catalogue whose numbering starts at 2, or chapters with their own marker.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `operation` | `list` · `set` · `remove` |  |  Default: `"list"`. |
| `page` | integer or string |  | 1-based page number or page name; defaults to the active page. |
| `startNumber` | integer |  |  |
| `continueNumbering` | boolean |  |  |
| `numbering` | `arabic` · `romanUpper` · `romanLower` · `lettersUpper` · `lettersLower` |  |  |
| `prefix` | string |  |  |
| `includePrefix` | boolean |  | Show the prefix in page numbers (default: InDesign's). |
| `marker` | string |  | Section marker text (shown by Type > Insert Special Character > Section Marker). |

## `id_text_wrap`

Text wrap around objects: none, boundingBox, contour, jumpObject or nextColumn, with an offset (one number, or [top, left, bottom, right]) in the units of the call. The text of other frames flows around the object.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `ids` | integer[] |  | Object ids from id_find_objects (most reliable). |
| `names` | string[] |  | Object names (Layers panel). |
| `useSelection` | boolean |  | Use the current selection when no ids / names are given. Default: `true`. |
| `units` | `mm` · `cm` · `pt` · `px` · `in` · `pica` |  | Measurement unit for every number in this call (default mm). Default: `"mm"`. |
| `mode` | `none` · `boundingBox` · `contour` · `jumpObject` · `nextColumn` |  |  Default: `"boundingBox"`. |
| `offset` | number or number[] |  |  |
| `invert` | boolean |  |  |

## `id_qr_code`

Create a QR code as vector artwork in a new frame: a web address (url), plain text, or an e-mail (address in value, plus subject and body). The colour is a swatch name, '#RRGGBB', [r,g,b] or [c,m,y,k]; keep it dark on a light ground.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `units` | `mm` · `cm` · `pt` · `px` · `in` · `pica` |  | Measurement unit for every number in this call (default mm). Default: `"mm"`. |
| `page` | integer or string |  |  |
| `rect` | object | yes | Frame from the top-left of the page: x, y, width, height in `units`. |
| `kind` | `url` · `text` · `email` |  |  Default: `"url"`. |
| `value` | string | yes | The URL, the text, or the e-mail address. |
| `subject` | string |  |  |
| `body` | string |  |  |
| `color` | any |  |  |
| `layer` | string |  |  |
| `name` | string |  |  |

## `id_paragraph_options`

Paragraph options on text frames (every paragraph of the story, or one by paragraphIndex): drop cap (lines and characters), a heading that spans the columns of a multi-column frame, and tab stops (position in the units of the call, alignment and leader such as '.'). tabs replaces the existing tab stops; tabs: [] clears them.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `ids` | integer[] |  | Object ids from id_find_objects (most reliable). |
| `names` | string[] |  | Object names (Layers panel). |
| `useSelection` | boolean |  | Use the current selection when no ids / names are given. Default: `true`. |
| `units` | `mm` · `cm` · `pt` · `px` · `in` · `pica` |  | Measurement unit for every number in this call (default mm). Default: `"mm"`. |
| `paragraphIndex` | integer |  |  |
| `dropCap` | object |  | lines: 0 removes the drop cap. |
| `span` | `all` · `none` or integer |  |  |
| `tabs` | object[] |  |  |
| `keepWithNext` | integer |  |  |
| `hyphenation` | boolean |  |  |

## `id_anchor_object`

Anchor an object to text so it moves with it: inline (sits in the line like a character), aboveLine, or custom. The anchor goes at the start of a paragraph (paragraphIndex) or at a character position of the story.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `units` | `mm` · `cm` · `pt` · `px` · `in` · `pica` |  | Measurement unit for every number in this call (default mm). Default: `"mm"`. |
| `objectId` | integer | yes | The object to anchor (id from id_find_objects). |
| `textFrameId` | integer | yes | A frame of the story that receives it. |
| `paragraphIndex` | integer |  |  |
| `characterIndex` | integer |  |  |
| `position` | `inline` · `aboveLine` · `custom` |  |  Default: `"inline"`. |

## `id_thread_text`

Thread text frames into one story in reading order (ids or names, in order), unthread them, or report the chain and overset. addPagesUntilFits adds pages after the last frame (same parent page, frame mirrored on facing pages) and threads new frames until the story fits — for long copy in brochures and catalogues.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `ids` | integer[] |  | Object ids from id_find_objects (most reliable). |
| `names` | string[] |  | Object names (Layers panel). |
| `useSelection` | boolean |  | Use the current selection when no ids / names are given. Default: `true`. |
| `units` | `mm` · `cm` · `pt` · `px` · `in` · `pica` |  | Measurement unit for every number in this call (default mm). Default: `"mm"`. |
| `operation` | `thread` · `unthread` · `status` |  |  Default: `"thread"`. |
| `addPagesUntilFits` | boolean |  |  Default: `false`. |
| `maxNewPages` | integer |  |  Default: `40`. |

## `id_create_toc`

Create or update a table of contents from paragraph styles (e.g. Título 1 level 1, Título 2 level 2), with optional entry styles, page number position and separator (default tab), title and title style, placed in a rectangle on a page. Re-run with the same tocStyleName after editing headings to update it. Reports overset.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `units` | `mm` · `cm` · `pt` · `px` · `in` · `pica` |  | Measurement unit for every number in this call (default mm). Default: `"mm"`. |
| `entries` | object[] | yes |  |
| `title` | string |  |  |
| `titleStyle` | string |  |  |
| `tocStyleName` | string |  |  |
| `page` | integer or string |  | 1-based page number or page name; defaults to the active page. |
| `rect` | object |  | Frame from the top-left of the page: x, y, width, height in `units`. |
| `name` | string |  |  |
| `replace` | boolean |  | Replace an existing table of contents (default true). |
| `includeOverset` | boolean |  |  |

## `id_package`

Package the document for the print shop (File > Package): copies fonts, linked images and the .indd into a folder, updates modified links, writes the instructions report and optionally an IDML and a PDF. Needs a saved document (saveFirst saves pending changes). Run id_preflight first. Adobe Fonts are not copied.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `folder` | string | yes | Absolute output folder (created if missing). |
| `copyFonts` | boolean |  |  |
| `copyLinks` | boolean |  |  |
| `copyProfiles` | boolean |  |  |
| `updateGraphics` | boolean |  |  |
| `includeHiddenLayers` | boolean |  |  |
| `createReport` | boolean |  |  |
| `includeIdml` | boolean |  |  |
| `includePdf` | boolean |  |  |
| `pdfPreset` | string |  | PDF preset when includePdf, e.g. '[PDF/X-4:2008]'. |
| `comments` | string |  |  |
| `saveFirst` | boolean |  | Save pending changes before packaging (default true). |

## `id_audit_document`

Check an InDesign document beyond preflight: overset text, text without paragraph styles, type below the minimum size, text closer than 3 mm to the trim, missing bleed, missing/modified links, low effective ppi, RGB images and RGB swatches in print, font problems, empty frames. Uses the document intent (print/web). Returns findings by severity.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `minPpi` | integer |  | Default 250 for print, 72 for web. |
| `minPointSize` | number |  | Default 6 pt for print, 9 pt for web. |
| `safeMarginMm` | number |  | Distance from the trim for text (default 3 mm). |
| `maxStories` | integer |  |  |

## `id_data_merge`

Data merge without the Data Merge panel: the template page(s) carry {{field}} in text and frames named {{field}} for images; each record (CSV/TSV/JSON or inline) gets its own copy of the template pages, filled, added at the end of the document (template pages removed unless removeTemplate is false). Catalogues, certificates, price cards, name badges. Reports missing fields and overset text. Then id_preflight + id_export.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `csvPath` | string |  | CSV/TSV with a header row (delimiter auto-detected). |
| `jsonPath` | string |  |  |
| `records` | object[] |  |  |
| `templateFirstPage` | integer or string |  | 1-based page number or page name; defaults to the active page. |
| `templateLastPage` | any |  |  |
| `imageFit` | `fill` · `proportionally` · `contentAware` · `frameToContent` |  |  Default: `"fill"`. |
| `imageFolder` | string |  | Relative image paths in the data are resolved against this folder. |
| `removeTemplate` | boolean |  |  Default: `true`. |

## `id_get_page_preview`

Visual check: render one InDesign page to JPEG and return it as an image.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `page` | integer or string |  | 1-based page number or page name; defaults to the active page. |
| `resolution` | integer |  |  Default: `72`. |
| `outputPath` | string |  |  |

## `id_execute_extendscript`

InDesign escape hatch: run ExtendScript (ES3) with `app` in scope, as one undo step. The value of the last expression is returned. Numbers use the scripting unit of this call's `units` (default mm) and the page ruler origin — including type sizes: write pointSize/leading as strings with a unit ("10pt"), otherwise 10 means 10 mm.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `code` | string | yes |  |
| `units` | `mm` · `cm` · `pt` · `px` · `in` · `pica` |  | Measurement unit for every number in this call (default mm). Default: `"mm"`. |

## `id_recipe_flyer`

Recipe: a print-ready flyer/poster in one call, in a NEW InDesign document. Brand kit → swatches (official CMYK when the kit has it) and paragraph styles (Chamada, Titulo, Subtitulo, Corpo, Lista, CTA, Rodape); image with bleed, text column, call-to-action button sized to its text, footer band with contact and logo. Layouts: imagem-topo (portrait default), imagem-cheia (image behind, gradient veil under the text), lateral (landscape default). Shrinks the type together if the text does not fit, then audits (overset, minimum size, bleed, ppi, RGB in print) and returns a preview. Optional .indd and PDF. Everything stays editable.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `kitPath` | string |  | 00_briefing/kit-de-marca.json (cores por uso, cmyk oficial, tipos titulo/corpo/rotulo). |
| `colors` | object |  | '#RRGGBB' per role; overrides the kit. |
| `fonts` | object |  | Font names (PostScript or 'Family\tStyle'). |
| `theme` | `marca` · `papel` |  | marca: page in the kit background colour (default); papel: white paper, dark text. |
| `colorSpace` | `cmyk` · `rgb` |  | Default cmyk (print); rgb for screen-only PDFs. |
| `size` | `A3` · `A4` · `A5` · `A6` · `carta` · `quadrado` · `dl-envelope` |  | Default A4. |
| `orientation` | `retrato` · `paisagem` |  |  |
| `width` | number |  | Custom page width in mm (with height). |
| `height` | number |  |  |
| `bleed` | number |  | mm, default 3. |
| `margin` | number |  | mm, default 12. |
| `savePath` | string |  | Save the .indd here. |
| `pdfPath` | string |  | Export a PDF here. |
| `pdfPreset` | string |  | Default '[High Quality Print]' (cmyk) or '[Smallest File Size]' (rgb). |
| `cropMarks` | boolean |  | Crop/bleed marks in the PDF (ask the print shop). |
| `previewPath` | string |  |  |
| `layout` | `imagem-topo` · `imagem-cheia` · `lateral` |  |  |
| `kicker` | string |  | Short line above the title (e.g. 'Lançamento'). |
| `title` | string | yes |  |
| `subtitle` | string |  |  |
| `body` | string |  | Paragraphs separated by \r. |
| `bullets` | string[] |  |  |
| `cta` | string |  | Button text, e.g. 'Agende pelo WhatsApp (11) 99999-0000'. |
| `footer` | string |  | Contact line: address, site, social. |
| `imagePath` | string |  |  |
| `logoPath` | string |  |  |

## `id_recipe_catalog`

Recipe: product catalogue / price list from a spreadsheet in one call, in a NEW InDesign document. Each record becomes a card (image, code, name, description, price) in a grid of columns × rows per page, with a header band (catalogue title) and a footer with page numbers; pages are added as needed. Prices that are numbers are formatted as currency (R$ by default). Long descriptions shrink a little, then are reported. Audited, preview, optional .indd and PDF. Map your column names with `fields`.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `kitPath` | string |  | 00_briefing/kit-de-marca.json (cores por uso, cmyk oficial, tipos titulo/corpo/rotulo). |
| `colors` | object |  | '#RRGGBB' per role; overrides the kit. |
| `fonts` | object |  | Font names (PostScript or 'Family\tStyle'). |
| `theme` | `marca` · `papel` |  | marca: page in the kit background colour (default); papel: white paper, dark text. |
| `colorSpace` | `cmyk` · `rgb` |  | Default cmyk (print); rgb for screen-only PDFs. |
| `size` | `A3` · `A4` · `A5` · `A6` · `carta` · `quadrado` · `dl-envelope` |  | Default A4. |
| `orientation` | `retrato` · `paisagem` |  |  |
| `width` | number |  | Custom page width in mm (with height). |
| `height` | number |  |  |
| `bleed` | number |  | mm, default 3. |
| `margin` | number |  | mm, default 12. |
| `savePath` | string |  | Save the .indd here. |
| `pdfPath` | string |  | Export a PDF here. |
| `pdfPreset` | string |  | Default '[High Quality Print]' (cmyk) or '[Smallest File Size]' (rgb). |
| `cropMarks` | boolean |  | Crop/bleed marks in the PDF (ask the print shop). |
| `previewPath` | string |  |  |
| `csvPath` | string |  | CSV/TSV with a header row (delimiter auto-detected). |
| `jsonPath` | string |  |  |
| `records` | object[] |  |  |
| `fields` | object |  | Column names in your data (defaults: nome/titulo/title, descricao/description, preco/price, imagem/image, codigo/sku). |
| `imageFolder` | string |  | Relative image paths are resolved against this folder (default: the CSV's folder). |
| `title` | string |  | Catalogue title on every page. |
| `headerSubtitle` | string |  | Small line above the title, e.g. 'Coleção Verão 2027'. |
| `footer` | string |  |  |
| `columns` | integer |  |  Default: `2`. |
| `rows` | integer |  |  Default: `3`. |
| `imageRatio` | number |  | Share of the card height for the image (default 0.58). |
| `currency` | string |  |  Default: `"BRL"`. |
| `locale` | string |  |  Default: `"pt-BR"`. |

## `id_recipe_manual_skeleton`

Recipe: skeleton of a manual / handbook / guide in one call, in a NEW InDesign document (facing pages by default, white paper theme). Cover in the brand band, table of contents built from the headings (dot leaders, page numbers), one opener per chapter on a right-hand page (master B, number only) and the chapter text threaded onto as many pages as it needs (master A: running head + automatic page number). Sections numbered 1.1, 1.2…, placeholder copy and one sample 'Aviso' box to replace. Named paragraph styles for everything (Titulo 1/2, Corpo, Lista, Aviso, Legenda…). Audited, preview, optional .indd and PDF.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `kitPath` | string |  | 00_briefing/kit-de-marca.json (cores por uso, cmyk oficial, tipos titulo/corpo/rotulo). |
| `colors` | object |  | '#RRGGBB' per role; overrides the kit. |
| `fonts` | object |  | Font names (PostScript or 'Family\tStyle'). |
| `theme` | `marca` · `papel` |  | marca: page in the kit background colour (default); papel: white paper, dark text. |
| `colorSpace` | `cmyk` · `rgb` |  | Default cmyk (print); rgb for screen-only PDFs. |
| `size` | `A3` · `A4` · `A5` · `A6` · `carta` · `quadrado` · `dl-envelope` |  | Default A4. |
| `orientation` | `retrato` · `paisagem` |  |  |
| `width` | number |  | Custom page width in mm (with height). |
| `height` | number |  |  |
| `bleed` | number |  | mm, default 3. |
| `margin` | number |  | mm, default 12. |
| `savePath` | string |  | Save the .indd here. |
| `pdfPath` | string |  | Export a PDF here. |
| `pdfPreset` | string |  | Default '[High Quality Print]' (cmyk) or '[Smallest File Size]' (rgb). |
| `cropMarks` | boolean |  | Crop/bleed marks in the PDF (ask the print shop). |
| `previewPath` | string |  |  |
| `title` | string | yes |  |
| `subtitle` | string |  |  |
| `kicker` | string |  | Small line above the cover title (default 'Manual'). |
| `organization` | string |  |  |
| `version` | string |  | e.g. 'Versão 1.0'. |
| `date` | string |  |  |
| `chapters` | object[] | yes |  |
| `facingPages` | boolean |  | Default true (printed and bound). |
| `chapterOnRight` | boolean |  | Chapters open on a right-hand page (default true). |
| `placeholderParagraphs` | integer |  | Placeholder paragraphs per section (default 2). |
| `placeholderText` | string |  |  |
