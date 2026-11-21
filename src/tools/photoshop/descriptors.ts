/**
 * actionJSON builders for Photoshop. The same descriptors run on the UXP bridge (batchPlay) and on the
 * ExtendScript bridges (CEP / COM), which convert actionJSON to ActionDescriptor.
 */

export type Descriptor = Record<string, unknown>;

export interface LayerRef {
  layerId?: number;
  layerName?: string;
}

const PRESET_DEFAULT = { _enum: "presetKindType", _value: "presetKindDefault" };

/** Adjustment types → actionJSON class and the defaults Photoshop's own "New Adjustment Layer" uses. */
export const ADJUSTMENT_TYPES: Record<string, Descriptor> = {
  brightnessContrast: { _obj: "brightnessEvent", useLegacy: false },
  levels: { _obj: "levels", presetKind: PRESET_DEFAULT },
  curves: { _obj: "curves", presetKind: PRESET_DEFAULT },
  exposure: { _obj: "exposure", presetKind: PRESET_DEFAULT },
  vibrance: { _obj: "vibrance" },
  hueSaturation: { _obj: "hueSaturation", presetKind: PRESET_DEFAULT, colorize: false },
  colorBalance: {
    _obj: "colorBalance",
    shadowLevels: [0, 0, 0],
    midtoneLevels: [0, 0, 0],
    highlightLevels: [0, 0, 0],
    preserveLuminosity: true
  },
  blackAndWhite: {
    _obj: "blackAndWhite",
    presetKind: PRESET_DEFAULT,
    red: 40,
    yellow: 60,
    grain: 40,
    cyan: 60,
    blue: 20,
    magenta: 80,
    useTint: false
  },
  photoFilter: { _obj: "photoFilter" },
  channelMixer: { _obj: "channelMixer", presetKind: PRESET_DEFAULT },
  colorLookup: { _obj: "colorLookup" },
  invert: { _obj: "invert" },
  posterize: { _obj: "posterization", levels: 4 },
  threshold: { _obj: "thresholdClassEvent", level: 128 },
  gradientMap: { _obj: "gradientMapClass" },
  selectiveColor: { _obj: "selectiveColor", presetKind: PRESET_DEFAULT },
  // Photoshop 27.4+ (classes and fields read back live on 20/11/2026). settings: { clarity: -100..100 }.
  clarity: { _obj: "clarity", clarity: 0 },
  // settings: { grainAmount: 0..100, grainSize: 0..100, grainRoughness: 0..100 }.
  grain: { _obj: "grainAdjustment", grainAmount: 25, grainSize: 25, grainRoughness: 50 }
};

export function layerTarget(ref: LayerRef): Descriptor[] {
  if (typeof ref.layerId === "number") return [{ _ref: "layer", _id: ref.layerId }];
  if (ref.layerName) return [{ _ref: "layer", _name: ref.layerName }];
  return [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }];
}

export function selectLayer(ref: LayerRef): Descriptor | null {
  if (typeof ref.layerId !== "number" && !ref.layerName) return null;
  return { _obj: "select", _target: layerTarget(ref), makeVisible: false };
}

/** Readback of the active layer: id, name and kind. */
export function readActiveLayer(): Descriptor[] {
  const active = { _ref: "layer", _enum: "ordinal", _value: "targetEnum" };
  return [
    { _obj: "get", _target: [{ _property: "layerID" }, active] },
    { _obj: "get", _target: [{ _property: "name" }, active] }
  ];
}

export function blendModeValue(mode: string): Descriptor {
  return { _enum: "blendMode", _value: mode };
}

export interface AdjustmentOptions extends LayerRef {
  type: string;
  settings?: Record<string, unknown>;
  name?: string;
  clipToBelow?: boolean;
  opacity?: number;
  blendMode?: string;
}

export function buildAdjustmentLayer(opts: AdjustmentOptions): Descriptor[] {
  const base = ADJUSTMENT_TYPES[opts.type];
  if (!base) {
    throw new Error(`Unknown adjustment type '${opts.type}'. Use one of: ${Object.keys(ADJUSTMENT_TYPES).join(", ")}.`);
  }
  const using: Descriptor = { _obj: "adjustmentLayer", type: { ...base, ...(opts.settings || {}) } };
  if (opts.name) using.name = opts.name;
  if (opts.clipToBelow) using.group = true;
  if (typeof opts.opacity === "number") using.opacity = { _unit: "percentUnit", _value: opts.opacity };
  if (opts.blendMode) using.mode = blendModeValue(opts.blendMode);

  const out: Descriptor[] = [];
  const sel = selectLayer(opts);
  if (sel) out.push(sel);
  out.push({ _obj: "make", _target: [{ _ref: "adjustmentLayer" }], using });
  out.push(...readActiveLayer());
  return out;
}

export type SmartObjectOperation = "convert" | "editContents" | "replaceContents" | "relink" | "convertToLayers" | "rasterize";

export function buildSmartObject(op: SmartObjectOperation, ref: LayerRef, filePath?: string): Descriptor[] {
  const out: Descriptor[] = [];
  const sel = selectLayer(ref);
  if (sel) out.push(sel);
  switch (op) {
    case "convert":
      out.push({ _obj: "newPlacedLayer" });
      break;
    case "editContents":
      out.push({ _obj: "placedLayerEditContents" });
      break;
    case "replaceContents":
    case "relink":
      if (!filePath) throw new Error(`filePath is required for ${op}.`);
      out.push({
        _obj: op === "replaceContents" ? "placedLayerReplaceContents" : "placedLayerRelinkToFile",
        null: { _path: filePath, _kind: "local" }
      });
      break;
    case "convertToLayers":
      out.push({ _obj: "placedLayerConvertToLayers" });
      break;
    case "rasterize":
      out.push({ _obj: "rasterizeLayer", _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }] });
      break;
    default:
      throw new Error(`Unknown smart object operation '${op as string}'.`);
  }
  if (op !== "editContents") out.push(...readActiveLayer());
  return out;
}

/** Layer methods of the Photoshop DOM that apply a filter (UXP 23.5+/24.0 and ExtendScript ArtLayer). */
export const DOM_FILTERS = [
  "applyAddNoise",
  "applyAverage",
  "applyBlur",
  "applyBlurMore",
  "applyClouds",
  "applyCustomFilter",
  "applyDeInterlace",
  "applyDespeckle",
  "applyDifferenceClouds",
  "applyDiffuseGlow",
  "applyDisplace",
  "applyDustAndScratches",
  "applyGaussianBlur",
  "applyGlassEffect",
  "applyHighPass",
  "applyLensBlur",
  "applyLensFlare",
  "applyMaximum",
  "applyMedianNoise",
  "applyMinimum",
  "applyMotionBlur",
  "applyNTSC",
  "applyOceanRipple",
  "applyOffset",
  "applyPinch",
  "applyPolarCoordinates",
  "applyRipple",
  "applySharpen",
  "applySharpenEdges",
  "applySharpenMore",
  "applyShear",
  "applySmartBlur",
  "applySpherize",
  "applyTwirl",
  "applyUnSharpMask",
  "applyWave",
  "applyZigZag"
] as const;
