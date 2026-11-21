# Photoshop `batchPlay` Descriptors Cheatsheet (`ps_batch_play`)

Pass these JSON descriptor arrays to `ps_batch_play`'s `descriptors` parameter (requires the UXP panel).
batchPlay reports failures as `{ "_obj": "error" }` result entries: check `errorCount` in the answer.
In ActionManager colors, **green is spelled `grain`**.

---

## 1. Select Layer by Name
```json
[
  {
    "_obj": "select",
    "_target": [{ "_ref": "layer", "_name": "My Layer Name" }],
    "makeVisible": false
  }
]
```

## 2. Layer Styles on the Active Layer (Drop Shadow + Stroke together)
Setting `layerEffects` replaces every style already on the layer, so list all the effects you want.
```json
[
  {
    "_obj": "set",
    "_target": [
      { "_ref": "property", "_property": "layerEffects" },
      { "_ref": "layer", "_enum": "ordinal", "_value": "targetEnum" }
    ],
    "to": {
      "_obj": "layerEffects",
      "scale": { "_unit": "percentUnit", "_value": 100 },
      "dropShadow": {
        "_obj": "dropShadow",
        "enabled": true,
        "present": true,
        "mode": { "_enum": "blendMode", "_value": "multiply" },
        "color": { "_obj": "RGBColor", "red": 0, "grain": 0, "blue": 0 },
        "opacity": { "_unit": "percentUnit", "_value": 65 },
        "useGlobalAngle": false,
        "localLightingAngle": { "_unit": "angleUnit", "_value": 120 },
        "distance": { "_unit": "pixelsUnit", "_value": 12 },
        "chokeMatte": { "_unit": "pixelsUnit", "_value": 0 },
        "blur": { "_unit": "pixelsUnit", "_value": 24 }
      },
      "frameFX": {
        "_obj": "frameFX",
        "enabled": true,
        "present": true,
        "style": { "_enum": "frameStyle", "_value": "outsetFrame" },
        "paintType": { "_enum": "frameFill", "_value": "solidColor" },
        "mode": { "_enum": "blendMode", "_value": "normal" },
        "opacity": { "_unit": "percentUnit", "_value": 100 },
        "size": { "_unit": "pixelsUnit", "_value": 4 },
        "color": { "_obj": "RGBColor", "red": 255, "grain": 255, "blue": 255 }
      }
    }
  }
]
```

## 3. Fill Active Layer / Selection with Solid RGB Color
```json
[
  {
    "_obj": "set",
    "_target": [{ "_ref": "color", "_property": "foregroundColor" }],
    "to": { "_obj": "RGBColor", "red": 30, "grain": 41, "blue": 59 }
  },
  {
    "_obj": "fill",
    "using": { "_enum": "fillContents", "_value": "foregroundColor" },
    "opacity": { "_unit": "percentUnit", "_value": 100 },
    "mode": { "_enum": "blendMode", "_value": "normal" }
  }
]
```

## 4. Create Solid Color Fill Layer
(Also available as `ps_create_layer` with `layerType: "solidColor"`.)
```json
[
  {
    "_obj": "make",
    "_target": [{ "_ref": "contentLayer" }],
    "using": {
      "_obj": "contentLayer",
      "type": {
        "_obj": "solidColorLayer",
        "color": { "_obj": "RGBColor", "red": 15, "grain": 23, "blue": 42 }
      }
    }
  }
]
```

## 5. High Pass Sharpening Filter
```json
[
  {
    "_obj": "highPass",
    "radius": { "_unit": "pixelsUnit", "_value": 2.5 }
  }
]
```

## 6. Align Active Layer to Canvas Center (Horizontal & Vertical)
One `align` descriptor per axis. Selectors: `ADSLefts`, `ADSCentersH`, `ADSRights`, `ADSTops`,
`ADSCentersV`, `ADSBottoms`.
```json
[
  {
    "_obj": "align",
    "_target": [{ "_ref": "layer", "_enum": "ordinal", "_value": "targetEnum" }],
    "using": { "_enum": "alignDistributeSelector", "_value": "ADSCentersH" },
    "alignToCanvas": true
  },
  {
    "_obj": "align",
    "_target": [{ "_ref": "layer", "_enum": "ordinal", "_value": "targetEnum" }],
    "using": { "_enum": "alignDistributeSelector", "_value": "ADSCentersV" },
    "alignToCanvas": true
  }
]
```

## 7. Select All / Deselect / Inverse
```json
[{ "_obj": "set", "_target": [{ "_ref": "channel", "_property": "selection" }], "to": { "_enum": "ordinal", "_value": "allEnum" } }]
```
```json
[{ "_obj": "set", "_target": [{ "_ref": "channel", "_property": "selection" }], "to": { "_enum": "ordinal", "_value": "none" } }]
```
```json
[{ "_obj": "inverse" }]
```

## 8. Expand / Contract / Feather the Selection
```json
[{ "_obj": "expand", "by": { "_unit": "pixelsUnit", "_value": 4 }, "selectionModifyEffectAtCanvasBounds": false }]
```
```json
[{ "_obj": "contract", "by": { "_unit": "pixelsUnit", "_value": 4 }, "selectionModifyEffectAtCanvasBounds": false }]
```
```json
[{ "_obj": "feather", "radius": { "_unit": "pixelsUnit", "_value": 6 } }]
```

## 9. Finding a descriptor you do not know
Record the step in Photoshop with **Plugins > Development > Record Action Commands** (or the Alchemist
plugin) and copy the descriptor it produces. Guessing descriptor keys rarely works.
