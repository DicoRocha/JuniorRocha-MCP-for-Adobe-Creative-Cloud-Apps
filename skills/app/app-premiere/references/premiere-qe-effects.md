# Premiere Pro Intrinsic Components, QE DOM Effects & Ticks Reference

---

## 1. Intrinsic Clip Components (`pr_modify_timeline_clip`)
Pass `componentName` and `componentProperties: { "<property name>": value }`.

Video clips:
1. **`Motion`**
   - `"Position"`: normalized `[x, y]`, `[0.5, 0.5]` is the center of the frame.
   - `"Scale"`: percent (`100` = 100%).
   - `"Rotation"`: degrees.
   - `"Anchor Point"`: normalized `[0.5, 0.5]`.
2. **`Opacity`**
   - `"Opacity"`: `0` to `100`.

Audio clips:
1. **`Volume`**
   - `"Level"`: **not decibels.** The stored value is linear with a 15 dB offset:
     `value = Math.pow(10, (dB - 15) / 20)` and `dB = 20 * Math.log(value) / Math.LN10 + 15`.
     `0 dB` is about `0.1778`; `-6 dB` is about `0.0891`. Passing `-6` directly mutes the clip.

Component and property names are shown in the app's UI language.

---

## 2. Effect and Transition Names (`pr_apply_effect` / `pr_apply_transition`)
Pass the exact UI name in `effectName` or `transitionName`, with `trackType: "video" | "audio"`.
These are the **English** names. In a translated Premiere, list the real ones first:
```javascript
// pr_execute_extendscript
app.enableQE();
qe.project.getVideoEffectList().join("\n");      // also getAudioEffectList(),
                                                  // getVideoTransitionList(), getAudioTransitionList()
```

### Video Effects (`effectName`, `trackType: "video"`)
- `"Gaussian Blur"`
- `"Lumetri Color"`
- `"Transform"`
- `"Crop"`
- `"Warp Stabilizer"`
- `"Drop Shadow"`
- `"Tint"`
- `"Posterize Time"`

### Video Transitions (`transitionName`, `trackType: "video"`)
- `"Cross Dissolve"`
- `"Dip to Black"`
- `"Dip to White"`
- `"Film Dissolve"`
- `"Push"`
- `"Slide"`
- `"Wipe"`

### Audio (`trackType: "audio"`)
- Transitions (`transitionName`): `"Constant Power"`, `"Constant Gain"`, `"Exponential Fade"`
- Effects (`effectName`): `"Parametric Equalizer"`, `"Single-band Compressor"`, `"DeNoise"`

---

## 3. Ticks Conversion (for `pr_execute_extendscript`)
```javascript
var TICKS_PER_SECOND = 254016000000;
function secondsToTicks(sec) {
  return String(Math.round(sec * TICKS_PER_SECOND));
}
function ticksToSeconds(ticksStr) {
  return Number(ticksStr) / TICKS_PER_SECOND;
}
```
