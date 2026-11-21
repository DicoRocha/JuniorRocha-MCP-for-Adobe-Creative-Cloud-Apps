# Illustrator Bezier Math & Menu Commands Reference

---

## 1. Coordinate Conversion Formula (Screen Top-Left → Illustrator Cartesian)
Read `artboardRect = [abLeft, abTop, abRight, abBottom]` from `ai_get_document_info` (script-created documents
usually have `[0, H, W, 0]`, user-created ones `[0, 0, W, -H]`). In both cases:
- `aiX = abLeft + screenX`
- `aiY = abTop - screenY`

---

## 2. Exact Cubic Bezier Circle / Rounded Arc Formula (`KAPPA`)
To draw a full circle of radius `R` centered at `(cx, cy)` (already in Illustrator coordinates, Y up) with four
points, clockwise from the top, use `K = 0.5522847498 * R` and `closed: true`:
1. **Top Point** `[cx, cy + R]`:
   - `anchor: [cx, cy + R]`
   - `leftDirection: [cx - K, cy + R]`
   - `rightDirection: [cx + K, cy + R]`
2. **Right Point** `[cx + R, cy]`:
   - `anchor: [cx + R, cy]`
   - `leftDirection: [cx + R, cy + K]`
   - `rightDirection: [cx + R, cy - K]`
3. **Bottom Point** `[cx, cy - R]`:
   - `anchor: [cx, cy - R]`
   - `leftDirection: [cx + K, cy - R]`
   - `rightDirection: [cx - K, cy - R]`
4. **Left Point** `[cx - R, cy]`:
   - `anchor: [cx - R, cy]`
   - `leftDirection: [cx - R, cy - K]`
   - `rightDirection: [cx - R, cy + K]`

---

## 3. Common Illustrator Menu Commands (`ai_execute_menu_or_action`)
Pass these strings in `menuCommand`. They are internal identifiers, the same in every UI language.
Most act on the current selection, so select the art first.

### Selection & Grouping
- `"selectall"` — Select All
- `"deselectall"` — Deselect All
- `"group"` — Group Selection (`Ctrl+G`)
- `"ungroup"` — Ungroup Selection (`Ctrl+Shift+G`)
- `"makeMask"` — Make Clipping Mask (`Ctrl+7`)
- `"releaseMask"` — Release Clipping Mask

### Expand & Outlines
- `"Expand3"` — Expand Object
- `"OffsetPath v22"` — Offset Path (opens its dialog)
- `"expandStyle"` — Expand Appearance
- `"outline"` — Create Outlines on selected TextFrame

### Pathfinder Operations (via Menu / Live Effect)
- `"Live Pathfinder Add"` — Unite / Add
- `"Live Pathfinder Subtract"` — Minus Front
- `"Live Pathfinder Intersect"` — Intersect
- `"Live Pathfinder Exclude"` — Exclude Overlap
- `"Live Pathfinder Divide"` — Divide
*(Tip: Follow a `"Live Pathfinder ..."` command with `"expandStyle"` to bake the boolean result into clean vector paths!)*
