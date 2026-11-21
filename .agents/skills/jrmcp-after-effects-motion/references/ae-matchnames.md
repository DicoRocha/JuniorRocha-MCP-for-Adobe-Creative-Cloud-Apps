# After Effects ADBE `matchName` & Expressions Reference

Use these exact `matchName` strings with `ae_apply_effect`, `ae_get_property_tree`, `ae_set_property`, `ae_set_keyframes`, and `ae_execute_extendscript`.

matchNames are the same in every language. The quoted display names below are the **English** UI names: in a
translated After Effects they differ, so read the real matchNames with `ae_get_property_tree` and use those.
A `propertyPath` is an array, e.g. `["ADBE Effect Parade", "ADBE Gaussian Blur 2", "ADBE Gaussian Blur 2-0001"]`.
Effect parameters have matchNames of the form `<effect matchName>-000N`.

---

## 1. Layer Transform Group (`ADBE Transform Group`)
- `ADBE Anchor Point` (`"Anchor Point"`) — `[x, y]` or `[x, y, z]`
- `ADBE Position` (`"Position"`) — `[x, y]` or `[x, y, z]`
- `ADBE Scale` (`"Scale"`) — `[sx, sy]` or `[sx, sy, sz]` (in percent, e.g. `[100, 100]`)
- `ADBE Rotate Z` (`"Rotation"` / `"Z Rotation"`) — degrees
- `ADBE Rotate X` / `ADBE Rotate Y` / `ADBE Orientation` (3D layers only)
- `ADBE Opacity` (`"Opacity"`) — `0` to `100`

## 2. Shape Layer Hierarchy (`ADBE Root Vectors Group`)
- Group: `ADBE Vector Group` → inner contents: `ADBE Vectors Group`, transform: `ADBE Vector Transform Group`
- Rectangle: `ADBE Vector Shape - Rect` (`ADBE Vector Rect Size`, `ADBE Vector Rect Position`, `ADBE Vector Rect Roundness`)
- Ellipse: `ADBE Vector Shape - Ellipse` (`ADBE Vector Ellipse Size`, `ADBE Vector Ellipse Position`)
- Polystar: `ADBE Vector Shape - Star` (`ADBE Vector Star Points`, `ADBE Vector Star Outer Radius`, `ADBE Vector Star Inner Radius`)
- Custom Bezier Path: `ADBE Vector Shape - Group` (`ADBE Vector Shape`)
- Fill: `ADBE Vector Graphic - Fill` (`ADBE Vector Fill Color` `[r,g,b]`, `ADBE Vector Fill Opacity`)
- Stroke: `ADBE Vector Graphic - Stroke` (`ADBE Vector Stroke Color`, `ADBE Vector Stroke Width`, `ADBE Vector Stroke Opacity`)
- Trim Paths: `ADBE Vector Filter - Trim` (`ADBE Vector Trim Start`, `ADBE Vector Trim End`, `ADBE Vector Trim Offset`)
- Repeater: `ADBE Vector Filter - Repeater`
- Round Corners: `ADBE Vector Filter - RC`

## 3. Top Native Effects (`effectMatchNameOrName` for `ae_apply_effect`)
| Effect Name | matchName | Key Parameters (English names) |
|---|---|---|
| **Gaussian Blur** | `ADBE Gaussian Blur 2` | `"Blurriness"`, `"Blur Dimensions"` |
| **Glow** (native) | `ADBE Glo2` | `"Glow Threshold"`, `"Glow Radius"`, `"Glow Intensity"` |
| **Fill** | `ADBE Fill` | `"Color"` (`[r,g,b]`), `"Opacity"` |
| **Gradient Ramp** | `ADBE Ramp` | `"Start of Ramp"`, `"Start Color"`, `"End of Ramp"`, `"End Color"` |
| **Drop Shadow** | `ADBE Drop Shadow` | `"Shadow Color"`, `"Opacity"`, `"Direction"`, `"Distance"`, `"Softness"` |
| **Curves** | `ADBE CurvesCustom` | Channel curves |
| **Hue/Saturation** | `ADBE HUE SATURATION` | `"Master Hue"`, `"Master Saturation"`, `"Master Lightness"` |
| **Tint** | `ADBE Tint` | `"Map Black To"`, `"Map White To"`, `"Amount to Tint"` |
| **Fractal Noise** | `ADBE Fractal Noise` | `"Contrast"`, `"Brightness"`, `"Evolution"` |
| **Turbulent Displace** | `ADBE Turbulent Displace` | `"Amount"`, `"Size"`, `"Evolution"` |
| **Slider Control** | `ADBE Slider Control` | `"Slider"` |
| **Color Control** | `ADBE Color Control` | `"Color"` |

## 4. Battle-Tested Expression Snippets (`ae_set_expression`)
- **Smooth Organic Float**: `wiggle(1.5, 12)`
- **Continuous Rotation**: `time * 45`
- **Ping-Pong Loop**: `loopOut("pingpong")`
- **Inertial Overshoot Bounce (on Keyframed Property)**:
  ```javascript
  var amp = 0.05; var freq = 2.5; var decay = 5.0;
  var n = 0;
  if (numKeys > 0) {
    n = nearestKey(time).index;
    if (key(n).time > time) n--;
  }
  if (n == 0) { value; } else {
    var t = time - key(n).time;
    var v = velocityAtTime(key(n).time - thisComp.frameDuration/10);
    value + v * amp * Math.sin(freq * t * 2 * Math.PI) / Math.exp(decay * t);
  }
  ```
