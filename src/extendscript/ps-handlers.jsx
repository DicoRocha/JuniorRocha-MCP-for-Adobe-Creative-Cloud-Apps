/*
 * ps-handlers.jsx
 * Pure ECMAScript 3 ExtendScript fallback handlers for Adobe Photoshop (used via Windows COM DoJavaScript
 * when the UXP WebSocket plugin is not connected, or via CEP).
 */

function __psMakeSolidColor(spec) {
  var sc = new SolidColor();
  if (!spec) {
    sc.rgb.red = 255;
    sc.rgb.green = 255;
    sc.rgb.blue = 255;
    return sc;
  }
  if (typeof spec === "string") {
    var hex = spec.replace("#", "");
    sc.rgb.red = parseInt(hex.substring(0, 2), 16) || 0;
    sc.rgb.green = parseInt(hex.substring(2, 4), 16) || 0;
    sc.rgb.blue = parseInt(hex.substring(4, 6), 16) || 0;
  } else {
    sc.rgb.red = typeof spec.r === "number" ? spec.r : (spec[0] || 0);
    sc.rgb.green = typeof spec.g === "number" ? spec.g : (spec[1] || 0);
    sc.rgb.blue = typeof spec.b === "number" ? spec.b : (spec[2] || 0);
  }
  return sc;
}

function __psRequireDoc() {
  if (!app.documents || app.documents.length === 0) {
    throw new Error("No active document in Adobe Photoshop.");
  }
  return app.activeDocument;
}

function __psCollectLayers(container, depth, maxDepth) {
  var out = [];
  if (!container || !container.layers || depth > maxDepth) return out;
  for (var i = 0; i < container.layers.length; i++) {
    var lyr = container.layers[i];
    var item = {
      index: i,
      id: lyr.id || i,
      name: lyr.name,
      typename: lyr.typename,
      visible: lyr.visible,
      opacity: lyr.opacity,
      blendMode: String(lyr.blendMode),
      bounds: lyr.bounds ? [ Number(lyr.bounds[0]), Number(lyr.bounds[1]), Number(lyr.bounds[2]), Number(lyr.bounds[3]) ] : null
    };
    if (lyr.typename !== "LayerSet") {
      try { item.kind = __psKindName(lyr); } catch (_eKind) {}
      if (item.kind === "LayerKind.TEXT") {
        try { item.text = String(lyr.textItem.contents).slice(0, 80); } catch (_eTxt) {}
      }
    }
    if (lyr.typename === "LayerSet") {
      item.children = __psCollectLayers(lyr, depth + 1, maxDepth);
    }
    out.push(item);
  }
  return out;
}

function __psFindLayer(container, id, name) {
  if (!container || !container.layers) return null;
  for (var i = 0; i < container.layers.length; i++) {
    var lyr = container.layers[i];
    if ((typeof id === "number" && lyr.id === id) || (name && lyr.name === name)) {
      return lyr;
    }
    if (lyr.typename === "LayerSet") {
      var sub = __psFindLayer(lyr, id, name);
      if (sub) return sub;
    }
  }
  return null;
}

/**
 * Resolves the layer named by layerId / layerName. When the caller named a layer that does not exist
 * this throws: silently falling back to the active layer would edit or delete the wrong layer.
 */
function __psTargetLayer(doc, params) {
  if (typeof params.layerId === "number" || params.layerName) {
    var found = __psFindLayer(doc, params.layerId, params.layerName);
    if (!found) {
      throw new Error("Layer not found (layerId=" + String(params.layerId) + ", layerName=" + String(params.layerName) + ").");
    }
    return found;
  }
  return doc.activeLayer;
}

function __psBlendMode(name) {
  var key = String(name).replace(/[\s_-]/g, "").toUpperCase();
  if (typeof BlendMode[key] === "undefined") {
    throw new Error("Unknown blend mode: " + name);
  }
  return BlendMode[key];
}

/* ------------------------------------------------------------ layer styles */
function __psHexRgb(hex, dflt) {
  if (typeof hex !== "string") return { _obj: "RGBColor", red: dflt[0], grain: dflt[1], blue: dflt[2] };
  var h = hex.replace(/^#/, "");
  if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
  return { _obj: "RGBColor", red: parseInt(h.substr(0, 2), 16), grain: parseInt(h.substr(2, 2), 16), blue: parseInt(h.substr(4, 2), 16) };
}
function __psNum(v, d) { return typeof v === "number" ? v : d; }
function __psPct(v) { return { _unit: "percentUnit", _value: v }; }
function __psPx(v) { return { _unit: "pixelsUnit", _value: v }; }

/** actionJSON for the layer styles ps_effects_and_adjustments offers (same as the UXP panel). */
/** Names of the styles switched on in the layer the reference points to. */
function __psLayerStyleNames(ref) {
  var names = [];
  try {
    var d = executeActionGet(ref);
    var id = stringIDToTypeID("layerEffects");
    if (!d.hasKey(id)) return names;
    var fx = d.getObjectValue(id);
    for (var i = 0; i < fx.count; i++) {
      var k = fx.getKey(i);
      if (fx.getType(k) !== DescValueType.OBJECTTYPE) continue;
      var o = fx.getObjectValue(k);
      var en = stringIDToTypeID("enabled");
      if (!o.hasKey(en) || o.getBoolean(en)) names.push(typeIDToStringID(k));
    }
  } catch (e) {}
  return names;
}

function __psLayerStyle(type, s) {
  if (type === "dropShadow") {
    return { key: "dropShadow", value: {
      _obj: "dropShadow", enabled: true, present: true, showInDialog: true,
      mode: { _enum: "blendMode", _value: s.blendMode || "multiply" },
      color: __psHexRgb(s.color, [0, 0, 0]),
      opacity: __psPct(__psNum(s.opacity, 35)),
      useGlobalAngle: false,
      localLightingAngle: { _unit: "angleUnit", _value: __psNum(s.angle, 120) },
      distance: __psPx(__psNum(s.distance, 8)),
      chokeMatte: __psPx(s.spread || 0),
      blur: __psPx(__psNum(s.size, 16))
    } };
  }
  if (type === "stroke") {
    return { key: "frameFX", value: {
      _obj: "frameFX", enabled: true, present: true, showInDialog: true,
      style: { _enum: "frameStyle", _value: s.position === "inside" ? "insetFrame" : (s.position === "center" ? "centeredFrame" : "outsetFrame") },
      paintType: { _enum: "frameFill", _value: "solidColor" },
      mode: { _enum: "blendMode", _value: s.blendMode || "normal" },
      opacity: __psPct(__psNum(s.opacity, 100)),
      size: __psPx(__psNum(s.size, 3)),
      color: __psHexRgb(s.color, [0, 0, 0])
    } };
  }
  if (type === "outerGlow") {
    return { key: "outerGlow", value: {
      _obj: "outerGlow", enabled: true, present: true, showInDialog: true,
      mode: { _enum: "blendMode", _value: s.blendMode || "screen" },
      color: __psHexRgb(s.color, [255, 255, 190]),
      opacity: __psPct(__psNum(s.opacity, 60)),
      glowTechnique: { _enum: "matteTechnique", _value: "softMatte" },
      chokeMatte: __psPx(s.spread || 0),
      blur: __psPx(__psNum(s.size, 16))
    } };
  }
  if (type === "colorOverlay") {
    return { key: "solidFill", value: {
      _obj: "solidFill", enabled: true, present: true, showInDialog: true,
      mode: { _enum: "blendMode", _value: s.blendMode || "normal" },
      opacity: __psPct(__psNum(s.opacity, 100)),
      color: __psHexRgb(s.color, [0, 0, 0])
    } };
  }
  if (type === "gradientOverlay") {
    var from = __psHexRgb(s.from || s.color, [0, 0, 0]);
    var to = __psHexRgb(s.to, [255, 255, 255]);
    return { key: "gradientFill", value: {
      _obj: "gradientFill", enabled: true, present: true, showInDialog: true,
      mode: { _enum: "blendMode", _value: s.blendMode || "normal" },
      opacity: __psPct(__psNum(s.opacity, 100)),
      angle: { _unit: "angleUnit", _value: __psNum(s.angle, 90) },
      type: { _enum: "gradientType", _value: s.style || "linear" },
      reverse: !!s.reverse, align: true,
      scale: __psPct(__psNum(s.scale, 100)),
      gradient: {
        _obj: "gradientClassEvent", name: "MCP", gradientForm: { _enum: "gradientForm", _value: "customStops" },
        interfaceIconFrameDimmed: 4096,
        colors: [
          { _obj: "colorStop", color: from, type: { _enum: "colorStopType", _value: "userStop" }, location: 0, midpoint: 50 },
          { _obj: "colorStop", color: to, type: { _enum: "colorStopType", _value: "userStop" }, location: 4096, midpoint: 50 }
        ],
        transparency: [
          { _obj: "transferSpec", opacity: __psPct(__psNum(s.fromOpacity, 100)), location: 0, midpoint: 50 },
          { _obj: "transferSpec", opacity: __psPct(__psNum(s.toOpacity, 100)), location: 4096, midpoint: 50 }
        ]
      }
    } };
  }
  if (type === "innerShadow") {
    return { key: "innerShadow", value: {
      _obj: "innerShadow", enabled: true, present: true, showInDialog: true,
      mode: { _enum: "blendMode", _value: s.blendMode || "multiply" },
      color: __psHexRgb(s.color, [0, 0, 0]),
      opacity: __psPct(__psNum(s.opacity, 35)),
      useGlobalAngle: false,
      localLightingAngle: { _unit: "angleUnit", _value: __psNum(s.angle, 120) },
      distance: __psPx(__psNum(s.distance, 5)),
      chokeMatte: __psPx(s.choke || 0),
      blur: __psPx(__psNum(s.size, 8))
    } };
  }
  if (type === "innerGlow") {
    return { key: "innerGlow", value: {
      _obj: "innerGlow", enabled: true, present: true, showInDialog: true,
      mode: { _enum: "blendMode", _value: s.blendMode || "screen" },
      color: __psHexRgb(s.color, [255, 255, 190]),
      opacity: __psPct(__psNum(s.opacity, 60)),
      glowTechnique: { _enum: "matteTechnique", _value: "softMatte" },
      innerGlowSource: { _enum: "innerGlowSourceType", _value: s.source === "center" ? "centerGlow" : "edgeGlow" },
      chokeMatte: __psPx(s.choke || 0),
      blur: __psPx(__psNum(s.size, 12))
    } };
  }
  if (type === "bevelEmboss") {
    var bevelStyles = { innerBevel: "innerBevel", outerBevel: "outerBevel", emboss: "emboss", pillowEmboss: "pillowEmboss", strokeEmboss: "strokeEmboss" };
    return { key: "bevelEmboss", value: {
      _obj: "bevelEmboss", enabled: true, present: true, showInDialog: true,
      highlightMode: { _enum: "blendMode", _value: s.highlightMode || "screen" },
      highlightColor: __psHexRgb(s.highlightColor, [255, 255, 255]),
      highlightOpacity: __psPct(__psNum(s.highlightOpacity, 50)),
      shadowMode: { _enum: "blendMode", _value: s.shadowMode || "multiply" },
      shadowColor: __psHexRgb(s.shadowColor, [0, 0, 0]),
      shadowOpacity: __psPct(__psNum(s.shadowOpacity, 50)),
      bevelTechnique: { _enum: "bevelTechnique", _value: s.technique === "chiselHard" ? "preciseMatte" : (s.technique === "chiselSoft" ? "slopeLimitMatte" : "softMatte") },
      bevelStyle: { _enum: "bevelEmbossStyle", _value: bevelStyles[s.style] || "innerBevel" },
      useGlobalAngle: false,
      localLightingAngle: { _unit: "angleUnit", _value: __psNum(s.angle, 120) },
      localLightingAltitude: { _unit: "angleUnit", _value: __psNum(s.altitude, 30) },
      strengthRatio: __psPct(__psNum(s.depth, 100)),
      blur: __psPx(__psNum(s.size, 7)),
      bevelDirection: { _enum: "bevelEmbossStampStyle", _value: s.direction === "down" ? "out" : "in" },
      softness: __psPx(__psNum(s.soften, 0))
    } };
  }
  if (type === "satin") {
    return { key: "chromeFX", value: {
      _obj: "chromeFX", enabled: true, present: true, showInDialog: true,
      mode: { _enum: "blendMode", _value: s.blendMode || "multiply" },
      color: __psHexRgb(s.color, [0, 0, 0]),
      antiAlias: false,
      invert: s.invert !== false,
      opacity: __psPct(__psNum(s.opacity, 50)),
      localLightingAngle: { _unit: "angleUnit", _value: __psNum(s.angle, 19) },
      distance: __psPx(__psNum(s.distance, 11)),
      blur: __psPx(__psNum(s.size, 14))
    } };
  }
  __mcpFail("INVALID_PARAMS", "Layer style '" + type + "' is not built in (dropShadow, innerShadow, stroke, outerGlow, innerGlow, bevelEmboss, satin, colorOverlay, gradientOverlay). Use ps_batch_play for others.");
}

/** Camera Raw filter settings: name used by the tool (same names as the Lightroom develop tools) -> action key. */
function __psCameraRawKeys() {
  return {
    temperature: { id: "Temp", type: "int", min: -100, max: 100 },
    tint: { id: "Tint", type: "int", min: -100, max: 100 },
    exposure: { id: "Ex12", type: "double", min: -5, max: 5 },
    contrast: { id: "Cr12", type: "int", min: -100, max: 100 },
    highlights: { id: "Hi12", type: "int", min: -100, max: 100 },
    shadows: { id: "Sh12", type: "int", min: -100, max: 100 },
    whites: { id: "Wh12", type: "int", min: -100, max: 100 },
    blacks: { id: "Bk12", type: "int", min: -100, max: 100 },
    texture: { id: "CrTx", type: "int", min: -100, max: 100 },
    clarity: { id: "Cl12", type: "int", min: -100, max: 100 },
    dehaze: { id: "Dhze", type: "int", min: -100, max: 100 },
    vibrance: { id: "Vibr", type: "int", min: -100, max: 100 },
    saturation: { id: "Strt", type: "int", min: -100, max: 100 },
    sharpening: { id: "Shrp", type: "int", min: 0, max: 150 },
    luminanceNoise: { id: "LNR ", type: "int", min: 0, max: 100 },
    colorNoise: { id: "CNR ", type: "int", min: 0, max: 100 },
    vignette: { id: "PCVA", type: "int", min: -100, max: 100 },
    grain: { id: "GRNA", type: "int", min: 0, max: 100 }
  };
}
function __psCameraRawNames() {
  var m = __psCameraRawKeys(), out = [];
  for (var k in m) { if (m.hasOwnProperty(k)) out.push(k); }
  return out;
}

/* ---------------------------------------------- actionJSON <-> ActionDescriptor */

function __psId(s) {
  return stringIDToTypeID(String(s));
}

function __psIdName(id) {
  var s = "";
  try {
    s = typeIDToStringID(id);
  } catch (_e) {}
  if (!s) {
    try {
      s = typeIDToCharID(id);
    } catch (_e2) {}
  }
  return s;
}

function __psIsInt(v) {
  return Math.floor(v) === v && Math.abs(v) < 2147483647;
}

/** Builds an ActionReference from an actionJSON _target array (most specific element first). */
function __psToReference(items) {
  var ref = new ActionReference();
  if (!(items instanceof Array)) items = [items];
  for (var i = 0; i < items.length; i++) {
    var e = items[i];
    if (typeof e._property !== "undefined") {
      ref.putProperty(stringIDToTypeID("property"), __psId(e._property));
      continue;
    }
    var cls = __psId(e._ref);
    if (typeof e._id !== "undefined") ref.putIdentifier(cls, e._id);
    else if (typeof e._index !== "undefined") ref.putIndex(cls, e._index);
    else if (typeof e._name !== "undefined") ref.putName(cls, e._name);
    else if (typeof e._enum !== "undefined") ref.putEnumerated(cls, __psId(e._enum), __psId(e._value));
    else if (typeof e._offset !== "undefined") ref.putOffset(cls, e._offset);
    else ref.putClass(cls);
  }
  return ref;
}

function __psToList(arr) {
  var list = new ActionList();
  for (var i = 0; i < arr.length; i++) {
    var v = arr[i];
    var t = typeof v;
    if (v === null || t === "undefined") continue;
    if (t === "boolean") list.putBoolean(v);
    else if (t === "number") {
      if (__psIsInt(v)) list.putInteger(v);
      else list.putDouble(v);
    } else if (t === "string") list.putString(v);
    else if (v instanceof Array) list.putList(__psToList(v));
    else if (typeof v._enum !== "undefined") list.putEnumerated(__psId(v._enum), __psId(v._value));
    else if (typeof v._unit !== "undefined") list.putUnitDouble(__psId(v._unit), Number(v._value));
    else if (typeof v._path !== "undefined") list.putPath(new File(v._path));
    else if (typeof v._class !== "undefined") list.putClass(__psId(v._class));
    else if (typeof v._ref !== "undefined") list.putReference(__psToReference([v]));
    else list.putObject(__psId(v._obj || "null"), __psToDescriptor(v));
  }
  return list;
}

function __psPutValue(desc, key, v) {
  var t = typeof v;
  if (v === null || t === "undefined") return;
  if (t === "boolean") desc.putBoolean(key, v);
  else if (t === "number") {
    if (__psIsInt(v)) desc.putInteger(key, v);
    else desc.putDouble(key, v);
  } else if (t === "string") desc.putString(key, v);
  else if (v instanceof Array) {
    if (v.length > 0 && v[0] && typeof v[0]._ref !== "undefined") desc.putReference(key, __psToReference(v));
    else desc.putList(key, __psToList(v));
  } else if (typeof v._enum !== "undefined") desc.putEnumerated(key, __psId(v._enum), __psId(v._value));
  else if (typeof v._unit !== "undefined") desc.putUnitDouble(key, __psId(v._unit), Number(v._value));
  else if (typeof v._path !== "undefined") desc.putPath(key, new File(v._path));
  else if (typeof v._class !== "undefined") desc.putClass(key, __psId(v._class));
  else if (typeof v._ref !== "undefined") desc.putReference(key, __psToReference([v]));
  else desc.putObject(key, __psId(v._obj || "null"), __psToDescriptor(v));
}

/** actionJSON object -> ActionDescriptor (keys starting with "_" are metadata, except _target). */
function __psToDescriptor(obj) {
  var desc = new ActionDescriptor();
  for (var k in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
    if (k === "_target") {
      desc.putReference(charIDToTypeID("null"), __psToReference(obj._target));
      continue;
    }
    if (k.charAt(0) === "_") continue;
    __psPutValue(desc, __psId(k), obj[k]);
  }
  return desc;
}

function __psReadValue(container, key, type, depth) {
  if (type === DescValueType.BOOLEANTYPE) return container.getBoolean(key);
  if (type === DescValueType.INTEGERTYPE) return container.getInteger(key);
  if (type === DescValueType.DOUBLETYPE) return container.getDouble(key);
  if (type === DescValueType.STRINGTYPE) return container.getString(key);
  if (type === DescValueType.LARGEINTEGERTYPE) return container.getLargeInteger(key);
  if (type === DescValueType.ENUMERATEDTYPE) {
    return { _enum: __psIdName(container.getEnumerationType(key)), _value: __psIdName(container.getEnumerationValue(key)) };
  }
  if (type === DescValueType.UNITDOUBLE) {
    return { _unit: __psIdName(container.getUnitDoubleType(key)), _value: container.getUnitDoubleValue(key) };
  }
  if (type === DescValueType.CLASSTYPE) return { _class: __psIdName(container.getClass(key)) };
  if (type === DescValueType.ALIASTYPE) return { _path: container.getPath(key).fsName };
  if (type === DescValueType.OBJECTTYPE) {
    if (depth > 6) return "[MaxDepth]";
    var o = __psDescriptorToJson(container.getObjectValue(key), depth + 1);
    o._obj = __psIdName(container.getObjectType(key));
    return o;
  }
  if (type === DescValueType.LISTTYPE) {
    if (depth > 6) return "[MaxDepth]";
    return __psListToJson(container.getList(key), depth + 1);
  }
  if (type === DescValueType.REFERENCETYPE) return "[reference]";
  return "[raw]";
}

function __psListToJson(list, depth) {
  var out = [];
  for (var i = 0; i < list.count && i < 500; i++) {
    out.push(__psReadValue(list, i, list.getType(i), depth));
  }
  return out;
}

function __psDescriptorToJson(desc, depth) {
  var out = {};
  depth = depth || 0;
  for (var i = 0; i < desc.count; i++) {
    var key = desc.getKey(i);
    try {
      out[__psIdName(key)] = __psReadValue(desc, key, desc.getType(key), depth);
    } catch (e) {
      out[__psIdName(key)] = "[unreadable]";
    }
  }
  return out;
}

/** Runs one actionJSON descriptor like UXP batchPlay does ("get" becomes executeActionGet). */
function __psRunDescriptor(obj) {
  if (!obj || typeof obj._obj !== "string") {
    throw new Error("Each descriptor needs an _obj.");
  }
  if (obj._obj === "get") {
    return __psDescriptorToJson(executeActionGet(__psToReference(obj._target || [])), 0);
  }
  var mode = DialogModes.NO;
  if (obj._options && obj._options.dialogOptions === "display") mode = DialogModes.ALL;
  var result = executeAction(__psId(obj._obj), __psToDescriptor(obj), mode);
  return result ? __psDescriptorToJson(result, 0) : {};
}

/** Resolves "EnumName.VALUE" strings (e.g. "NoiseDistribution.GAUSSIAN") to ExtendScript enum values. */
function __psResolveEnumArg(a) {
  if (typeof a !== "string") return a;
  var m = /^([A-Z][A-Za-z]+)\.([A-Z][A-Z_0-9]*)$/.exec(a);
  if (!m) return a;
  try {
    var en = eval(m[1]);
    if (en && typeof en[m[2]] !== "undefined") return en[m[2]];
  } catch (_e) {}
  return a;
}


/* ---------- artboards and web export ---------- */

function __psLayerDesc(id) {
  var ref = new ActionReference();
  ref.putIdentifier(charIDToTypeID("Lyr "), id);
  return executeActionGet(ref);
}

/** Top-level artboards of a document: [{ name, id, rect: {x, y, width, height}, background }]. */
function __psArtboards(doc) {
  var out = [];
  for (var i = 0; i < doc.layers.length; i++) {
    var L = doc.layers[i];
    if (L.typename !== "LayerSet") continue;
    var d = null;
    try {
      d = __psLayerDesc(L.id);
    } catch (_eD) {
      continue;
    }
    var isAb = false;
    try {
      isAb = d.getBoolean(__psId("artboardEnabled"));
    } catch (_eA) {}
    if (!isAb) continue;
    var ab = d.getObjectValue(__psId("artboard"));
    var rc = ab.getObjectValue(__psId("artboardRect"));
    var l = rc.getDouble(__psId("left")), t = rc.getDouble(__psId("top"));
    var bgType = 1;
    try {
      bgType = ab.getInteger(__psId("artboardBackgroundType"));
    } catch (_eB) {}
    out.push({
      name: String(L.name),
      id: L.id,
      visible: !!L.visible,
      rect: { x: l, y: t, width: rc.getDouble(__psId("right")) - l, height: rc.getDouble(__psId("bottom")) - t },
      background: bgType === 1 ? "white" : (bgType === 2 ? "black" : (bgType === 3 ? "transparent" : "other"))
    });
  }
  // Layers panel order is top to bottom; artboards read better left-to-right, top-to-bottom.
  out.sort(function (a, b) {
    return a.rect.y - b.rect.y !== 0 && Math.abs(a.rect.y - b.rect.y) > 1 ? a.rect.y - b.rect.y : a.rect.x - b.rect.x;
  });
  return out;
}

/* ---------- recipes: cut-out and product shot ---------- */

/** Live shape layer (editable fill + live rectangle / rounded rectangle / ellipse), in pixels. A2, 16/11/2026. */
function __psShapeLayer(doc, shape, rect, radius, hex, name) {
  app.activeDocument = doc;
  var s = stringIDToTypeID, c = charIDToTypeID;
  var mk = new ActionDescriptor();
  var ref = new ActionReference();
  ref.putClass(s("contentLayer"));
  mk.putReference(c("null"), ref);
  var cl = new ActionDescriptor();
  var type = new ActionDescriptor();
  type.putObject(c("Clr "), c("RGBC"), __psRgbDesc(hex));
  cl.putObject(c("Type"), s("solidColorLayer"), type);
  var sh = new ActionDescriptor();
  sh.putInteger(s("unitValueQuadVersion"), 1);
  sh.putUnitDouble(c("Top "), c("#Pxl"), rect[1]);
  sh.putUnitDouble(c("Left"), c("#Pxl"), rect[0]);
  sh.putUnitDouble(c("Btom"), c("#Pxl"), rect[3]);
  sh.putUnitDouble(c("Rght"), c("#Pxl"), rect[2]);
  if (shape === "rounded") {
    var r = Math.max(0, Math.min(radius || 0, (rect[2] - rect[0]) / 2, (rect[3] - rect[1]) / 2));
    sh.putUnitDouble(s("topRight"), c("#Pxl"), r);
    sh.putUnitDouble(s("topLeft"), c("#Pxl"), r);
    sh.putUnitDouble(s("bottomLeft"), c("#Pxl"), r);
    sh.putUnitDouble(s("bottomRight"), c("#Pxl"), r);
  }
  cl.putObject(c("Shp "), shape === "ellipse" ? c("Elps") : c("Rctn"), sh);
  mk.putObject(c("Usng"), s("contentLayer"), cl);
  executeAction(c("Mk  "), mk, DialogModes.NO);
  var L = doc.activeLayer;
  if (name) L.name = name;
  return L;
}

/** Source for a recipe: an open document, or a file opened here (closed again at the end, unchanged). */
function __psRecipeSource(p) {
  if (p.filePath) {
    var f = new File(p.filePath);
    if (!f.exists) __mcpFail("NOT_FOUND", "File not found: " + p.filePath);
    var d = app.open(f);
    return { doc: d, opened: true };
  }
  var doc = p.documentName ? app.documents.getByName(p.documentName) : __psRequireDoc();
  app.activeDocument = doc;
  return { doc: doc, opened: false };
}

function __psRecipeCloseSource(s) {
  if (!s || !s.opened) return;
  try {
    s.doc.close(SaveOptions.DONOTSAVECHANGES);
  } catch (_eCs) {}
}

/** Leaves the document with one visible pixel layer (merging what is visible) and returns it. */
function __psSingleLayer(doc) {
  if (doc.layers.length > 1 || doc.layers[0].typename === "LayerSet") {
    try {
      doc.mergeVisibleLayers();
    } catch (_eMv) {}
    for (var i = doc.layers.length - 1; i >= 0; i--) {
      if (!doc.layers[i].visible) {
        try {
          doc.layers[i].remove();
        } catch (_eRh) {}
      }
    }
  }
  var L = doc.layers[0];
  if (L.typename === "LayerSet") L = L.merge();
  if (L.isBackgroundLayer) L.isBackgroundLayer = false;
  doc.activeLayer = L;
  return L;
}

function __psToSmartObject(doc, layer) {
  doc.activeLayer = layer;
  try {
    executeAction(stringIDToTypeID("newPlacedLayer"), undefined, DialogModes.NO);
  } catch (_eSo) {}
  return doc.activeLayer;
}

/**
 * layer.kind, or null when Photoshop cannot say. Reading .kind throws "Internal error" on the adjustment layers
 * added in Photoshop 2027 (Clarity and dehaze, Grain), which broke every loop that looked at layer kinds.
 */
function __psKindOf(layer) {
  try {
    return layer.kind;
  } catch (e) {
    return null;
  }
}
function __psKindName(layer) {
  var k = __psKindOf(layer);
  return k === null ? "LayerKind.ADJUSTMENT" : String(k);
}

/** True when the active layer has a (pixel) layer mask. */
function __psHasUserMask() {
  try {
    var r = new ActionReference();
    r.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("hasUserMask"));
    r.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
    return executeActionGet(r).getBoolean(stringIDToTypeID("hasUserMask"));
  } catch (e) {
    return false;
  }
}

/** Cuts the subject out as a layer mask. Returns the method used. */
function __psCutout(doc, layer, method) {
  doc.activeLayer = layer;
  if (method !== "selectSubject") {
    try {
      executeAction(stringIDToTypeID("removeBackground"), undefined, DialogModes.NO);
      return "removeBackground";
    } catch (_eRb) {}
  }
  var ss = new ActionDescriptor();
  ss.putBoolean(stringIDToTypeID("sampleAllLayers"), false);
  executeAction(stringIDToTypeID("autoCutout"), ss, DialogModes.NO);
  var mk = new ActionDescriptor();
  mk.putClass(charIDToTypeID("Nw  "), charIDToTypeID("Chnl"));
  var mkRef = new ActionReference();
  mkRef.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("Msk "));
  mk.putReference(charIDToTypeID("At  "), mkRef);
  mk.putEnumerated(charIDToTypeID("Usng"), charIDToTypeID("UsrM"), charIDToTypeID("RvlS"));
  executeAction(charIDToTypeID("Mk  "), mk, DialogModes.NO);
  return "selectSubject";
}

function __psLoadChannelSelection(chEnum) {
  var d = new ActionDescriptor();
  var r = new ActionReference();
  r.putProperty(charIDToTypeID("Chnl"), charIDToTypeID("fsel"));
  d.putReference(charIDToTypeID("null"), r);
  var t = new ActionReference();
  t.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID(chEnum));
  d.putReference(charIDToTypeID("T   "), t);
  executeAction(charIDToTypeID("setd"), d, DialogModes.NO);
}

function __psSelectionBox(doc) {
  try {
    var b = doc.selection.bounds;
    var box = [b[0].as("px"), b[1].as("px"), b[2].as("px"), b[3].as("px")];
    return box[2] > box[0] && box[3] > box[1] ? box : null;
  } catch (_eSb) {
    return null;
  }
}

/** Bounds of the active layer's mask (the kept subject), or null. */
function __psMaskBounds(doc) {
  try {
    __psLoadChannelSelection("Msk ");
  } catch (_eMk) {
    return null;
  }
  var b = __psSelectionBox(doc);
  doc.selection.deselect();
  return b;
}

/** Bounds of the active layer's non-transparent pixels, or null. */
function __psTransparencyBounds(doc) {
  try {
    __psLoadChannelSelection("Trsp");
  } catch (_eTr) {
    return null;
  }
  var b = __psSelectionBox(doc);
  doc.selection.deselect();
  return b;
}

/** True when the active layer has transparent pixels (an already cut-out PNG). */
function __psHasTransparency(doc) {
  try {
    __psLoadChannelSelection("Trsp");
    doc.selection.invert();
    var b = __psSelectionBox(doc);
    doc.selection.deselect();
    return !!b;
  } catch (_eHt) {
    try {
      doc.selection.deselect();
    } catch (_eDs) {}
    return false;
  }
}

function __psEllipseSelect(top, left, bottom, right) {
  var d = new ActionDescriptor();
  var r = new ActionReference();
  r.putProperty(charIDToTypeID("Chnl"), charIDToTypeID("fsel"));
  d.putReference(charIDToTypeID("null"), r);
  var box = new ActionDescriptor();
  box.putUnitDouble(charIDToTypeID("Top "), charIDToTypeID("#Pxl"), top);
  box.putUnitDouble(charIDToTypeID("Left"), charIDToTypeID("#Pxl"), left);
  box.putUnitDouble(charIDToTypeID("Btom"), charIDToTypeID("#Pxl"), bottom);
  box.putUnitDouble(charIDToTypeID("Rght"), charIDToTypeID("#Pxl"), right);
  d.putObject(charIDToTypeID("T   "), charIDToTypeID("Elps"), box);
  d.putBoolean(charIDToTypeID("AntA"), true);
  executeAction(charIDToTypeID("setd"), d, DialogModes.NO);
}

function __psRgbDesc(hex) {
  var c = __psMakeSolidColor(hex);
  var d = new ActionDescriptor();
  d.putDouble(charIDToTypeID("Rd  "), c.rgb.red);
  d.putDouble(charIDToTypeID("Grn "), c.rgb.green);
  d.putDouble(charIDToTypeID("Bl  "), c.rgb.blue);
  return d;
}

/** Solid colour fill layer (editable), named; returns the layer. */
function __psSolidFillLayer(doc, hex, name) {
  app.activeDocument = doc;
  var mk = new ActionDescriptor();
  var ref = new ActionReference();
  ref.putClass(stringIDToTypeID("contentLayer"));
  mk.putReference(charIDToTypeID("null"), ref);
  var type = new ActionDescriptor();
  type.putObject(charIDToTypeID("Clr "), charIDToTypeID("RGBC"), __psRgbDesc(hex));
  var using = new ActionDescriptor();
  using.putObject(charIDToTypeID("Type"), stringIDToTypeID("solidColorLayer"), type);
  mk.putObject(charIDToTypeID("Usng"), stringIDToTypeID("contentLayer"), using);
  executeAction(charIDToTypeID("Mk  "), mk, DialogModes.NO);
  doc.activeLayer.name = name;
  return doc.activeLayer;
}

/** Gradient fill layer (editable) from colour a (centre / start) to b; style "radial" or "linear". */
function __psGradientFillLayer(doc, name, a, b, style) {
  app.activeDocument = doc;
  var mk = new ActionDescriptor();
  var ref = new ActionReference();
  ref.putClass(stringIDToTypeID("contentLayer"));
  mk.putReference(charIDToTypeID("null"), ref);
  var g = new ActionDescriptor();
  g.putEnumerated(charIDToTypeID("Type"), charIDToTypeID("GrdT"), charIDToTypeID(style === "linear" ? "Lnr " : "Rdl "));
  g.putUnitDouble(charIDToTypeID("Angl"), charIDToTypeID("#Ang"), 90);
  g.putUnitDouble(charIDToTypeID("Scl "), charIDToTypeID("#Prc"), 150);
  var grd = new ActionDescriptor();
  grd.putString(charIDToTypeID("Nm  "), "MCP");
  grd.putEnumerated(charIDToTypeID("GrdF"), charIDToTypeID("GrdF"), charIDToTypeID("CstS"));
  grd.putDouble(charIDToTypeID("Intr"), 4096);
  var colors = new ActionList();
  var stops = [[a, 0], [b, 4096]];
  for (var i = 0; i < stops.length; i++) {
    var s = new ActionDescriptor();
    s.putObject(charIDToTypeID("Clr "), charIDToTypeID("RGBC"), __psRgbDesc(stops[i][0]));
    s.putEnumerated(charIDToTypeID("Type"), charIDToTypeID("Clry"), charIDToTypeID("UsrS"));
    s.putInteger(charIDToTypeID("Lctn"), stops[i][1]);
    s.putInteger(charIDToTypeID("Mdpn"), 50);
    colors.putObject(charIDToTypeID("Clrt"), s);
  }
  grd.putList(charIDToTypeID("Clrs"), colors);
  var trans = new ActionList();
  for (var j = 0; j < 2; j++) {
    var t = new ActionDescriptor();
    t.putUnitDouble(charIDToTypeID("Opct"), charIDToTypeID("#Prc"), 100);
    t.putInteger(charIDToTypeID("Lctn"), j * 4096);
    t.putInteger(charIDToTypeID("Mdpn"), 50);
    trans.putObject(charIDToTypeID("TrnS"), t);
  }
  grd.putList(charIDToTypeID("Trns"), trans);
  g.putObject(charIDToTypeID("Grad"), charIDToTypeID("Grdn"), grd);
  var using = new ActionDescriptor();
  using.putObject(charIDToTypeID("Type"), stringIDToTypeID("gradientLayer"), g);
  mk.putObject(charIDToTypeID("Usng"), stringIDToTypeID("contentLayer"), using);
  executeAction(charIDToTypeID("Mk  "), mk, DialogModes.NO);
  doc.activeLayer.name = name;
  return doc.activeLayer;
}

/** Saves the recipe result: optional layered PSD (copy) and the image file (PNG by default) from a web-ready duplicate. */
function __psRecipeWrite(doc, p, warnings, transparent) {
  var out = { file: null, psd: null };
  if (p.psdPath) {
    var pf = __mcpPrepareOutputFile(p.psdPath);
    doc.saveAs(pf, new PhotoshopSaveOptions(), true, Extension.LOWERCASE);
    out.psd = pf.fsName;
  }
  if (p.outputPath) {
    var fmt = String(p.format || "png").toLowerCase();
    var path = String(p.outputPath);
    if (!/\.(png|jpe?g|webp)$/i.test(path)) path += "." + fmt;
    var dup = doc.duplicate("mcp_out_tmp", false);
    try {
      __psPrepareForWeb(dup, p, warnings);
      out.file = __psWriteWeb(dup, path, fmt, p.quality, { transparent: transparent, maxKB: p.maxKB, srgb: p.srgb });
    } finally {
      dup.close(SaveOptions.DONOTSAVECHANGES);
      app.activeDocument = doc;
    }
  }
  return out;
}

/** Alpha channel by name, or null. */
function __psChannelByName(doc, name) {
  for (var i = 0; i < doc.channels.length; i++) if (doc.channels[i].name === name) return doc.channels[i];
  return null;
}

/**
 * Luminosity masks as alpha channels (no brush): Luzes 1 = the composite's brightness, Luzes N = Luzes 1 intersected
 * N-1 times with itself (narrower), Sombras N the same on the inverse, Medios = all minus Luzes 1 minus Sombras 1.
 */
function __psMakeLuminosityMasks(doc, steps, names, withMid) {
  app.activeDocument = doc;
  var made = [];
  var store = function (name) {
    var old = __psChannelByName(doc, name);
    if (old) old.remove();
    var ch = doc.channels.add();
    ch.name = name;
    doc.selection.store(ch, SelectionType.REPLACE);
    made.push(name);
    return ch;
  };
  // Lights
  __psLoadChannelSelection("RGB ");
  var l1 = store(names.lights + " 1");
  for (var i = 2; i <= steps; i++) {
    doc.selection.load(l1, SelectionType.REPLACE);
    for (var k = 1; k < i; k++) doc.selection.load(l1, SelectionType.INTERSECT);
    store(names.lights + " " + i);
  }
  // Darks
  doc.selection.load(l1, SelectionType.REPLACE);
  doc.selection.invert();
  var d1 = store(names.darks + " 1");
  for (var j = 2; j <= steps; j++) {
    doc.selection.load(d1, SelectionType.REPLACE);
    for (var m = 1; m < j; m++) doc.selection.load(d1, SelectionType.INTERSECT);
    store(names.darks + " " + j);
  }
  if (withMid) {
    doc.selection.selectAll();
    doc.selection.load(l1, SelectionType.DIMINISH);
    doc.selection.load(d1, SelectionType.DIMINISH);
    store(names.mid);
  }
  doc.selection.deselect();
  // channels.add() leaves the new alpha channel as the only visible target: show the composite again
  try {
    var comp = [];
    for (var c = 0; c < doc.channels.length; c++) if (doc.channels[c].kind === ChannelType.COMPONENT) comp.push(doc.channels[c]);
    doc.activeChannels = comp;
  } catch (_eAc) {}
  return made;
}

/** 50 % grey layer in Overlay with monochrome Gaussian noise, slightly blurred (film grain). */
function __psGrainLayer(doc, name, amount, size, opacity) {
  var gl = doc.artLayers.add();
  gl.name = name;
  var grey = new SolidColor();
  grey.rgb.red = 128;
  grey.rgb.green = 128;
  grey.rgb.blue = 128;
  doc.selection.selectAll();
  doc.selection.fill(grey);
  doc.selection.deselect();
  gl.applyAddNoise(amount, NoiseDistribution.GAUSSIAN, true);
  if (size > 0) gl.applyGaussianBlur(size);
  gl.blendMode = BlendMode.OVERLAY;
  gl.opacity = opacity;
  return gl;
}

/** Adjustment layer of a type with actionJSON fields, above the active layer. */
function __psAdjLayer(name, typeObj) {
  __psRunDescriptor({ _obj: "make", _target: [{ _ref: "adjustmentLayer" }], using: { _obj: "adjustmentLayer", name: name, type: typeObj } });
  return app.activeDocument.activeLayer;
}

/** Curves adjustment layer with points [[in,out],...] (0-255), masked by the current selection when there is one. */
function __psCurvesLayer(name, points, opacity) {
  // Two steps, raw ActionManager: the curve points must be doubles. Through the actionJSON converter whole numbers
  // became integers and "set" failed with "program error" (live, Photoshop 2027, 23/11/2026).
  var c = charIDToTypeID, sid = stringIDToTypeID;
  var mk = new ActionDescriptor();
  var mr = new ActionReference();
  mr.putClass(c("AdjL"));
  mk.putReference(c("null"), mr);
  var use = new ActionDescriptor();
  use.putString(c("Nm  "), String(name));
  var ty = new ActionDescriptor();
  ty.putEnumerated(sid("presetKind"), sid("presetKindType"), sid("presetKindDefault"));
  use.putObject(c("Type"), c("Crvs"), ty);
  mk.putObject(c("Usng"), c("AdjL"), use);
  executeAction(c("Mk  "), mk, DialogModes.NO);
  var st = new ActionDescriptor();
  var sr = new ActionReference();
  sr.putEnumerated(c("AdjL"), c("Ordn"), c("Trgt"));
  st.putReference(c("null"), sr);
  var cv = new ActionDescriptor();
  cv.putEnumerated(sid("presetKind"), sid("presetKindType"), sid("presetKindCustom"));
  var adjs = new ActionList();
  var ad = new ActionDescriptor();
  var cr = new ActionReference();
  cr.putEnumerated(c("Chnl"), c("Chnl"), c("Cmps"));
  ad.putReference(c("Chnl"), cr);
  var pts = new ActionList();
  for (var i = 0; i < points.length; i++) {
    var pd = new ActionDescriptor();
    pd.putDouble(c("Hrzn"), Number(points[i][0]));
    pd.putDouble(c("Vrtc"), Number(points[i][1]));
    pts.putObject(c("Pnt "), pd);
  }
  ad.putList(c("Crv "), pts);
  adjs.putObject(c("CrvA"), ad);
  cv.putList(c("Adjs"), adjs);
  st.putObject(c("T   "), c("Crvs"), cv);
  executeAction(c("setd"), st, DialogModes.NO);
  var lyr = app.activeDocument.activeLayer;
  if (typeof opacity === "number") lyr.opacity = opacity;
  return lyr;
}

/** Removes the layers a recipe created before it failed, so a half-built stack is never left behind. */
function __psRemoveLayerIds(doc, ids) {
  for (var i = ids.length - 1; i >= 0; i--) {
    try {
      var l = __psFindLayer(doc, Number(ids[i]), null);
      if (l) l.remove();
    } catch (_eRm) {}
  }
}

/** Selects the layers with these ids and groups them (Layer > Group Layers). Returns the new group's id. */
function __psGroupLayerIds(ids, name) {
  for (var i = 0; i < ids.length; i++) {
    var sd = new ActionDescriptor();
    var sr = new ActionReference();
    sr.putIdentifier(charIDToTypeID("Lyr "), Number(ids[i]));
    sd.putReference(charIDToTypeID("null"), sr);
    if (i > 0) sd.putEnumerated(__psId("selectionModifier"), __psId("selectionModifierType"), __psId("addToSelection"));
    sd.putBoolean(charIDToTypeID("MkVs"), false);
    executeAction(charIDToTypeID("slct"), sd, DialogModes.NO);
  }
  var g = new ActionDescriptor();
  var rg = new ActionReference();
  rg.putClass(__psId("layerSection"));
  g.putReference(charIDToTypeID("null"), rg);
  var rf = new ActionReference();
  rf.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
  g.putReference(charIDToTypeID("From"), rf);
  var nm = new ActionDescriptor();
  nm.putString(charIDToTypeID("Nm  "), String(name));
  g.putObject(charIDToTypeID("Usng"), __psId("layerSection"), nm);
  executeAction(charIDToTypeID("Mk  "), g, DialogModes.NO);
  var ar = new ActionReference();
  ar.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
  return executeActionGet(ar).getInteger(stringIDToTypeID("layerID"));
}

/** Groups every top-level layer of the document into one new group (one action); DOM fallback for leftovers. */
function __psGroupAllLayers(doc, name) {
  app.activeDocument = doc;
  try {
    var d = new ActionDescriptor();
    var r = new ActionReference();
    r.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
    d.putReference(charIDToTypeID("null"), r);
    executeAction(__psId("selectAllLayers"), d, DialogModes.NO);
    var g = new ActionDescriptor();
    var rg = new ActionReference();
    rg.putClass(__psId("layerSection"));
    g.putReference(charIDToTypeID("null"), rg);
    var rf = new ActionReference();
    rf.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
    g.putReference(charIDToTypeID("From"), rf);
    var nm = new ActionDescriptor();
    nm.putString(charIDToTypeID("Nm  "), String(name));
    g.putObject(charIDToTypeID("Usng"), __psId("layerSection"), nm);
    executeAction(charIDToTypeID("Mk  "), g, DialogModes.NO);
  } catch (_eG) {}
  var group = null;
  for (var i = 0; i < doc.layers.length; i++) {
    if (doc.layers[i].typename === "LayerSet" && doc.layers[i].name === String(name)) group = doc.layers[i];
  }
  if (!group) {
    group = doc.layerSets.add();
    group.name = String(name);
  }
  // anything the action left outside (hidden layers on some versions) goes in, keeping the stacking order
  var rest = [];
  for (var j = 0; j < doc.layers.length; j++) if (doc.layers[j] !== group && !(doc.layers[j].typename === "LayerSet" && doc.layers[j].name === String(name))) rest.push(doc.layers[j]);
  for (var k = 0; k < rest.length; k++) rest[k].move(group, ElementPlacement.PLACEATEND);
  return group;
}

/** Solid colour fill layer (content layer) — used by ps.recolor.object. */
function __psShapeLayerSolid(doc, hex, name) {
  app.activeDocument = doc;
  var c = charIDToTypeID, s = stringIDToTypeID;
  var col = new SolidColor();
  col.rgb.hexValue = String(hex).replace("#", "");
  var mk = new ActionDescriptor();
  var ref = new ActionReference();
  ref.putClass(s("contentLayer"));
  mk.putReference(c("null"), ref);
  var type = new ActionDescriptor();
  var rgb = new ActionDescriptor();
  rgb.putDouble(c("Rd  "), col.rgb.red);
  rgb.putDouble(c("Grn "), col.rgb.green);
  rgb.putDouble(c("Bl  "), col.rgb.blue);
  type.putObject(c("Clr "), c("RGBC"), rgb);
  var using = new ActionDescriptor();
  using.putObject(c("Type"), s("solidColorLayer"), type);
  mk.putObject(c("Usng"), s("contentLayer"), using);
  executeAction(c("Mk  "), mk, DialogModes.NO);
  doc.activeLayer.name = name;
  return doc.activeLayer;
}

/** Depth-first search of a layer by exact name. */
function __psFindLayerByName(container, name) {
  for (var i = 0; i < container.layers.length; i++) {
    var L = container.layers[i];
    if (String(L.name) === String(name)) return L;
    if (L.typename === "LayerSet") {
      var f = __psFindLayerByName(L, name);
      if (f) return f;
    }
  }
  return null;
}

/**
 * B39 - text layers in a document with artboards. Facts measured live on Photoshop 28 (18/11/2026):
 *  - `artboardSet.artLayers.add()` only really adds the layer in ONE artboard (the first of the document);
 *    in the others the new empty layer does not land in that set and the returned DOM reference ALIASES
 *    another layer (the top one of that set). Converting it to text then fails ("The layer cannot contain
 *    text") or, worse, silently edits the existing layer; remove() on it deletes a real layer.
 *  - after `layer.move(...)` the reference is stale too (the layer gets a new id).
 * So: the layer is taken from `set.layers[0]` only when the set really grew by one empty layer, the caller
 * fills in ALL the text properties while it sits in that "home" artboard, and the move to the wanted
 * artboard is the LAST thing done (see ps.layer.create). Nothing is ever removed through a stale
 * reference: a stray layer is removed only when it is the active layer AND empty.
 * Returns { layer, moveTo } (moveTo = the wanted artboard set, or null when it is already there).
 */
function __psIsEmptyNewLayer(l) {
  try {
    if (l.typename !== "ArtLayer" || __psKindOf(l) !== LayerKind.NORMAL) return false;
    var b = l.bounds;
    return b[2].as("px") - b[0].as("px") === 0 && b[3].as("px") - b[1].as("px") === 0;
  } catch (_eEm) {
    return false;
  }
}

function __psAddTextLayer(doc, artboardName, position) {
  var boards = __psArtboards(doc);
  if (!boards.length) {
    var plain = doc.artLayers.add();
    plain.kind = LayerKind.TEXT;
    return { layer: plain, moveTo: null };
  }
  var target = null, bi;
  if (artboardName) {
    for (bi = 0; bi < boards.length; bi++) if (boards[bi].name === String(artboardName)) target = boards[bi];
    if (!target) __mcpFail("NOT_FOUND", "No artboard named '" + artboardName + "'. Use ps_artboards (operation 'list').");
  } else if (position && position.length === 2) {
    for (bi = 0; bi < boards.length; bi++) {
      var rcB = boards[bi].rect;
      if (!target && position[0] >= rcB.x && position[0] <= rcB.x + rcB.width && position[1] >= rcB.y && position[1] <= rcB.y + rcB.height) target = boards[bi];
    }
  }
  if (!target) target = boards[0];
  var made = null, homeName = null;
  for (bi = 0; bi < boards.length && !made; bi++) {
    var setB = __psFindLayerByName(doc, boards[bi].name);
    if (!setB || setB.typename !== "LayerSet") continue;
    var n0 = setB.layers.length;
    setB.artLayers.add();
    if (setB.layers.length === n0 + 1 && __psIsEmptyNewLayer(setB.layers[0])) {
      var cand = setB.layers[0];
      try {
        cand.kind = LayerKind.TEXT;
        made = cand;
        homeName = boards[bi].name;
      } catch (_eKind) {}
    } else {
      // the new layer went somewhere else: it is the active layer; drop it only if it is really empty
      var actB = doc.activeLayer;
      if (__psIsEmptyNewLayer(actB)) actB.remove();
    }
  }
  if (!made) __mcpFail("INTERNAL", "Photoshop refused to create a text layer in any artboard of this document.");
  var targetSet = homeName === target.name ? null : __psFindLayerByName(doc, target.name);
  return { layer: made, moveTo: targetSet };
}

/** True when a group holds at least one layer with pixels, text or a smart object (something a transform can move). */
function __psGroupHasPixels(set) {
  try {
    for (var i = 0; i < set.artLayers.length; i++) {
      var k = __psKindOf(set.artLayers[i]);
      if (k === LayerKind.NORMAL || k === LayerKind.TEXT || k === LayerKind.SMARTOBJECT) return true;
    }
    for (var j = 0; j < set.layerSets.length; j++) {
      if (__psGroupHasPixels(set.layerSets[j])) return true;
    }
  } catch (_e) {
    return true; // unknown: keep the old behaviour
  }
  return false;
}

/** Deselect every layer. The target reference is required: a bare "selectNoLayers" is refused ("Deselect Layers
 * is not currently available", Photoshop 2027), the selection stayed and the next artboard swallowed it. */
function __psSelectNoLayers() {
  try {
    var d = new ActionDescriptor();
    var r = new ActionReference();
    r.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
    d.putReference(charIDToTypeID("null"), r);
    executeAction(__psId("selectNoLayers"), d, DialogModes.NO);
    return true;
  } catch (_eS) {
    return false;
  }
}

function __psMakeArtboard(doc, name, rect) {
  __psSelectNoLayers();
  var desc = new ActionDescriptor();
  var ref = new ActionReference();
  ref.putClass(__psId("artboardSection"));
  desc.putReference(charIDToTypeID("null"), ref);
  var using = new ActionDescriptor();
  using.putString(charIDToTypeID("Nm  "), String(name));
  desc.putObject(charIDToTypeID("Usng"), __psId("artboardSection"), using);
  var r = new ActionDescriptor();
  r.putDouble(__psId("top"), rect.y);
  r.putDouble(__psId("left"), rect.x);
  r.putDouble(__psId("bottom"), rect.y + rect.height);
  r.putDouble(__psId("right"), rect.x + rect.width);
  desc.putObject(__psId("artboardRect"), __psId("classFloatRect"), r);
  executeAction(charIDToTypeID("Mk  "), desc, DialogModes.NO);
  return doc.activeLayer;
}

function __psSafeName(s) {
  return String(s).replace(/[\\\/:*?"<>|]+/g, "_").replace(/^\s+|\s+$/g, "") || "arquivo";
}

/** Prepares a working duplicate for web output: 8 bits, sRGB, optional resize (fit inside maxWidth x maxHeight, or scale %). */
function __psPrepareForWeb(dup, p, warnings) {
  try {
    if (dup.bitsPerChannel !== BitsPerChannelType.EIGHT) dup.bitsPerChannel = BitsPerChannelType.EIGHT;
  } catch (eB) {
    warnings.push("8 bits: " + eB.message);
  }
  if (dup.mode !== DocumentMode.RGB) {
    try {
      dup.changeMode(ChangeMode.RGB);
    } catch (eM) {
      warnings.push("RGB: " + eM.message);
    }
  }
  if (p.srgb !== false) {
    try {
      dup.convertProfile("sRGB IEC61966-2.1", Intent.RELATIVECOLORIMETRIC, true, false);
    } catch (eP) {
      warnings.push("sRGB: " + eP.message);
    }
  }
  var w = dup.width.as("px"), h = dup.height.as("px");
  var k = 1;
  if (typeof p.scale === "number" && p.scale > 0) k = p.scale / 100;
  if (typeof p.maxWidth === "number" && w * k > p.maxWidth) k = p.maxWidth / w;
  if (typeof p.maxHeight === "number" && h * k > p.maxHeight) k = Math.min(k, p.maxHeight / h);
  if (Math.abs(k - 1) > 0.0001) {
    dup.resizeImage(UnitValue(Math.round(w * k), "px"), UnitValue(Math.round(h * k), "px"), dup.resolution, k < 1 ? ResampleMethod.BICUBICSHARPER : ResampleMethod.BICUBICSMOOTHER);
  }
}

/** Writes dup to file in png/jpg/webp; jpg/webp honour maxKB by stepping the quality down. Returns {path, bytes, quality}. */
function __psWriteWeb(dup, filePath, fmt, quality, p) {
  var f = new File(filePath);
  if (!f.parent.exists) __mcpEnsureFolder(f.parent, 0);
  var q = typeof quality === "number" ? quality : 82;
  var minQ = typeof p.minQuality === "number" ? p.minQuality : 45;
  var once = function (qq) {
    if (f.exists) f.remove();
    if (fmt === "png") {
      var po = new ExportOptionsSaveForWeb();
      po.format = SaveDocumentType.PNG;
      po.PNG8 = false;
      po.transparency = p.transparent !== false;
      po.includeProfile = false;
      if (dup.width.as("px") <= 8192 && dup.height.as("px") <= 8192) dup.exportDocument(f, ExportType.SAVEFORWEB, po);
      else {
        var pso = new PNGSaveOptions();
        pso.compression = 6;
        dup.saveAs(f, pso, true, Extension.LOWERCASE);
      }
    } else if (fmt === "jpg") {
      if (dup.width.as("px") <= 8192 && dup.height.as("px") <= 8192) {
        var jo = new ExportOptionsSaveForWeb();
        jo.format = SaveDocumentType.JPEG;
        jo.quality = qq;
        jo.optimized = true;
        jo.includeProfile = p.srgb !== false;
        dup.exportDocument(f, ExportType.SAVEFORWEB, jo);
      } else {
        var js = new JPEGSaveOptions();
        js.quality = Math.max(1, Math.min(12, Math.round((qq / 100) * 12)));
        dup.saveAs(f, js, true, Extension.LOWERCASE);
      }
    } else if (fmt === "webp") {
      // WebPSaveOptions is not exposed to ExtendScript: save through Action Manager (Photoshop 23.2+).
      var desc = new ActionDescriptor();
      var opt = new ActionDescriptor();
      opt.putEnumerated(__psId("compression"), __psId("WebPCompression"), __psId(p.lossless ? "compressionLossless" : "compressionLossy"));
      if (!p.lossless) opt.putInteger(__psId("quality"), qq);
      opt.putBoolean(__psId("includeXMPData"), false);
      opt.putBoolean(__psId("includeEXIFData"), false);
      opt.putBoolean(__psId("includePsExtras"), false);
      desc.putObject(__psId("as"), __psId("WebPFormat"), opt);
      desc.putPath(__psId("in"), f);
      desc.putBoolean(__psId("copy"), true);
      desc.putBoolean(__psId("lowerCase"), true);
      executeAction(__psId("save"), desc, DialogModes.NO);
    } else {
      __mcpFail("INVALID_PARAMS", "Unknown format '" + fmt + "'. Use png, jpg or webp.");
    }
    return new File(filePath).length;
  };
  var bytes = once(q);
  var tries = 0;
  if (typeof p.maxKB === "number" && fmt !== "png" && !p.lossless) {
    while (bytes > p.maxKB * 1024 && q > minQ && tries++ < 12) {
      q = Math.max(minQ, q - 6);
      bytes = once(q);
    }
  }
  return { path: new File(filePath).fsName, bytes: bytes, kb: Math.round(bytes / 102.4) / 10, quality: fmt === "png" || p.lossless ? null : q, width: dup.width.as("px"), height: dup.height.as("px"), overBudget: typeof p.maxKB === "number" && bytes > p.maxKB * 1024 };
}


/* ---------- audit ---------- */

var __PS_DEFAULT_NAME = /^(Layer|Camada|Ebene|Capa|Calque|Livello|Shape|Forma|Form|Rectangle|Ret\u00E2ngulo|Rechteck|Ellipse|Elipse|Group|Grupo|Gruppe|Line|Linha|Linie|Color Fill|Preenchimento de cor|Farbfl\u00E4che)( copy| c\u00F3pia| Kopie)? ?\d*( copy| c\u00F3pia| Kopie)? ?\d*$/i;

function __psSample(doc, x, y) {
  var s = doc.colorSamplers.add([UnitValue(x, "px"), UnitValue(y, "px")]);
  var c = null;
  try {
    var rgb = s.color.rgb;
    c = [Math.round(rgb.red), Math.round(rgb.green), Math.round(rgb.blue)];
  } catch (_eC) {}
  s.remove();
  return c;
}

function __psAuditWalk(doc, container, out, depth, path) {
  for (var i = 0; i < container.layers.length; i++) {
    var L = container.layers[i];
    var b = null;
    try {
      b = [L.bounds[0].as("px"), L.bounds[1].as("px"), L.bounds[2].as("px"), L.bounds[3].as("px")];
    } catch (_eB) {}
    var rec = {
      name: String(L.name),
      path: path ? path + " / " + L.name : String(L.name),
      id: L.id,
      kind: L.typename === "LayerSet" ? "group" : __psKindName(L),
      visible: !!L.visible,
      bounds: b,
      defaultName: __PS_DEFAULT_NAME.test(String(L.name)),
      empty: !!(b && b[2] - b[0] <= 0 && b[3] - b[1] <= 0 && L.typename !== "LayerSet")
    };
    if (L.typename === "ArtLayer" && __psKindOf(L) === LayerKind.TEXT) {
      try {
        var ti = L.textItem;
        var sizePx = ti.size.as("pt") * doc.resolution / 72;
        var col = null;
        try {
          col = [Math.round(ti.color.rgb.red), Math.round(ti.color.rgb.green), Math.round(ti.color.rgb.blue)];
        } catch (_eCol) {}
        var font = "";
        try {
          font = String(ti.font);
        } catch (_eF) {}
        rec.text = { contents: String(ti.contents).substring(0, 80), sizePx: Math.round(sizePx * 10) / 10, color: col, font: font };
      } catch (_eT) {}
    }
    out.push(rec);
    if (L.typename === "LayerSet" && depth < 8) __psAuditWalk(doc, L, out, depth + 1, rec.path);
  }
}

function __psDispatch(action, params, _options) {
  if (action === "adobe.ping") {
    return { pong: true, app: "photoshop", version: String(app.version), documents: app.documents.length };
  }
  if (action === "adobe.checkpoint") {
    if (app.documents.length === 0) throw new Error("No open Photoshop document to checkpoint.");
    var cpDoc = app.activeDocument;
    var cpOrig = null;
    try {
      cpOrig = cpDoc.fullName;
    } catch (_eCpPs) {
      cpOrig = null;
    }
    var cpDest = __mcpCheckpointFile(cpDoc.name, "psd", params.label, params.folder, cpOrig);
    var cpOpts = new PhotoshopSaveOptions();
    cpOpts.layers = true;
    cpOpts.embedColorProfile = true;
    cpDoc.saveAs(cpDest, cpOpts, true, Extension.LOWERCASE);
    return {
      app: "photoshop",
      document: cpDoc.name,
      checkpointPath: cpDest.fsName,
      method: "saved a layered PSD copy",
      documentPathChanged: false,
      originalPath: cpOrig ? cpOrig.fsName : null
    };
  }
  params = params || {};

  if (action === "ps.batch") {
    return __mcpBatch(params, "ps");
  }

  if (action === "ps.doc.list") {
    var docs = [];
    for (var i = 0; i < app.documents.length; i++) {
      var d = app.documents[i];
      docs.push({
        index: i,
        id: d.id || i,
        name: d.name,
        width: Number(d.width),
        height: Number(d.height),
        resolution: d.resolution,
        mode: String(d.mode)
      });
    }
    return { count: docs.length, documents: docs };
  }

  if (action === "ps.doc.create") {
    var w = UnitValue(params.width || 1920, "px");
    var h = UnitValue(params.height || 1080, "px");
    var res = params.resolution || 72;
    var name = params.name || "MCP Document";
    var created = app.documents.add(w, h, res, name, NewDocumentMode.RGB);
    return {
      name: created.name,
      width: Number(created.width),
      height: Number(created.height),
      resolution: created.resolution
    };
  }

  if (action === "ps.doc.open") {
    var f = new File(params.filePath);
    if (!f.exists) throw new Error("File not found: " + params.filePath);
    var opened = app.open(f);
    return { name: opened.name, width: Number(opened.width), height: Number(opened.height) };
  }

  if (action === "ps.doc.save") {
    var docS = __psRequireDoc();
    var prevDialogs = app.displayDialogs;
    app.displayDialogs = DialogModes.NO;
    try {
      if (params.filePath) {
        var outF = __mcpPrepareOutputFile(params.filePath);
        var fmt = (params.format || "psd").toLowerCase();
        if (fmt === "png") {
          var pngOpts = new PNGSaveOptions();
          docS.saveAs(outF, pngOpts, true, Extension.LOWERCASE);
        } else if (fmt === "jpg" || fmt === "jpeg") {
          var jpgOpts = new JPEGSaveOptions();
          jpgOpts.quality = params.quality || 10;
          docS.saveAs(outF, jpgOpts, true, Extension.LOWERCASE);
        } else {
          var psdOpts = new PhotoshopSaveOptions();
          docS.saveAs(outF, psdOpts, false, Extension.LOWERCASE);
        }
        __mcpVerifySaved(outF, null);
        return { saved: true, filePath: outF.fsName, format: fmt };
      }
      docS.save();
      return { saved: true, name: docS.name };
    } finally {
      app.displayDialogs = prevDialogs;
    }
  }

  if (action === "ps.layers.layoutInfo") {
    // Layer tree with kind, text and bounds in px, for ps_organize_layers (ExtendScript only: UXP runs it hybrid).
    var docLI = __psRequireDoc();
    if (params.documentName) docLI = app.documents.getByName(params.documentName);
    var oldRuler = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;
    try {
      return {
        documentName: docLI.name,
        width: Number(docLI.width),
        height: Number(docLI.height),
        layers: __psCollectLayers(docLI, 0, 8)
      };
    } finally {
      app.preferences.rulerUnits = oldRuler;
    }
  }

  if (action === "ps.layer.getTree") {
    var docL = __psRequireDoc();
    return {
      documentName: docL.name,
      layers: __psCollectLayers(docL, 0, params.maxDepth || 4)
    };
  }

  if (action === "ps.doc.modifyCanvas") {
    var docM = __psRequireDoc();
    var opM = params.operation;
    var curW = Number(docM.width);
    var curH = Number(docM.height);
    if (opM === "crop") {
      if (!params.bounds) throw new Error("operation 'crop' requires bounds { left, top, right, bottom } in pixels.");
      docM.crop([params.bounds.left, params.bounds.top, params.bounds.right, params.bounds.bottom]);
    } else if (opM === "resizeImage") {
      if (!params.width && !params.height) throw new Error("operation 'resizeImage' requires width and/or height.");
      var newW = params.width || Math.round(curW * params.height / curH);
      var newH = params.height || Math.round(curH * params.width / curW);
      docM.resizeImage(UnitValue(newW, "px"), UnitValue(newH, "px"), undefined, ResampleMethod.BICUBIC);
    } else if (opM === "resizeCanvas") {
      if (!params.width && !params.height) throw new Error("operation 'resizeCanvas' requires width and/or height.");
      docM.resizeCanvas(UnitValue(params.width || curW, "px"), UnitValue(params.height || curH, "px"), AnchorPosition.MIDDLECENTER);
    } else if (opM === "rotate") {
      if (typeof params.angle !== "number") throw new Error("operation 'rotate' requires angle in degrees.");
      docM.rotateCanvas(params.angle);
    } else if (opM === "trim") {
      docM.trim(TrimType.TRANSPARENT, true, true, true, true);
    } else if (opM === "flatten") {
      docM.flatten();
    } else {
      throw new Error("Unsupported ps.doc.modifyCanvas operation: " + opM);
    }
    return { operation: opM, width: Number(docM.width), height: Number(docM.height) };
  }

  if (action === "ps.doc.snapshot") {
    var docSn = __psRequireDoc();
    if (params.documentName) {
      try {
        docSn = app.documents.getByName(params.documentName);
      } catch (_eSnName) {}
    }
    var maxDim = params.maxDimension || 1024;
    var isTemp = !params.outputPath;
    var snapPath = params.outputPath || (Folder.temp.fsName + "/mcp_ps_snapshot_" + new Date().getTime() + ".png");
    var srcW = Number(docSn.width);
    var srcH = Number(docSn.height);
    var dupDoc = docSn.duplicate("mcp_snapshot_tmp", true);
    var snapFile = __mcpPrepareOutputFile(snapPath);
    var outW = srcW;
    var outH = srcH;
    try {
      var ratio = maxDim / Math.max(srcW, srcH);
      if (ratio < 1) {
        outW = Math.max(1, Math.round(srcW * ratio));
        outH = Math.max(1, Math.round(srcH * ratio));
        dupDoc.resizeImage(UnitValue(outW, "px"), UnitValue(outH, "px"), undefined, ResampleMethod.BICUBIC);
      }
      if (dupDoc.mode !== DocumentMode.RGB) {
        dupDoc.changeMode(ChangeMode.RGB);
      }
      if (dupDoc.bitsPerChannel !== BitsPerChannelType.EIGHT) {
        dupDoc.bitsPerChannel = BitsPerChannelType.EIGHT;
      }
      dupDoc.saveAs(snapFile, new PNGSaveOptions(), true, Extension.LOWERCASE);
    } finally {
      dupDoc.close(SaveOptions.DONOTSAVECHANGES);
      app.activeDocument = docSn;
    }
    return {
      outputPath: snapFile.fsName,
      temporaryFile: isTemp,
      width: outW,
      height: outH,
      sourceWidth: srcW,
      sourceHeight: srcH,
      previewMimeType: "image/png"
    };
  }

  if (action === "ps.luminosityMasks") {
    var docLM = __psRequireDoc();
    if (params.documentName) docLM = app.documents.getByName(params.documentName);
    var namesLM = { lights: params.lightsName || "Luzes", darks: params.darksName || "Sombras", mid: params.midName || "Medios" };
    var madeLM = __psMakeLuminosityMasks(docLM, Math.max(1, Math.min(5, params.steps || 3)), namesLM, params.midtones !== false);
    return { documentName: docLM.name, channels: madeLM };
  }

  if (action === "ps.recipe.zoneDodgeBurn") {
    // Dodge & burn by zones without a brush: curves masked by luminosity masks, in one group above everything.
    var docDB = __psRequireDoc();
    if (params.documentName) docDB = app.documents.getByName(params.documentName);
    app.activeDocument = docDB;
    var nm = { lights: "Luzes", darks: "Sombras", mid: "Medios" };
    if (!__psChannelByName(docDB, "Luzes 2") || !__psChannelByName(docDB, "Sombras 2") || !__psChannelByName(docDB, "Medios")) {
      __psMakeLuminosityMasks(docDB, 3, nm, true);
    }
    var st = Math.max(0, Math.min(100, typeof params.strength === "number" ? params.strength : 50));
    var lift = Math.round(6 + 0.24 * st);
    docDB.activeLayer = docDB.layers[0];
    var madeDB = [];
    var ids = [];
    var mk = function (channel, name, pts) {
      docDB.selection.load(__psChannelByName(docDB, channel), SelectionType.REPLACE);
      var l = __psCurvesLayer(name, pts, 100);
      docDB.selection.deselect();
      madeDB.push(name);
      ids.push(l.id);
    };
    try {
    if (params.liftShadows !== false) mk(params.shadowsMask || "Sombras 2", "Clarear sombras (" + (params.shadowsMask || "Sombras 2") + ")", [[0, 0], [64, 64 + lift], [128, 128 + Math.round(lift / 2)], [255, 255]]);
    if (params.holdHighlights !== false) mk(params.highlightsMask || "Luzes 2", "Escurecer luzes (" + (params.highlightsMask || "Luzes 2") + ")", [[0, 0], [128, 128 - Math.round(lift / 2)], [192, 192 - lift], [255, 255]]);
    if (params.midContrast === true) mk("Medios", "Contraste medios (Medios)", [[0, 0], [96, 96 - Math.round(lift / 2)], [160, 160 + Math.round(lift / 2)], [255, 255]]);
    } catch (eDB) {
      try { docDB.selection.deselect(); } catch (_eDs2) {}
      __psRemoveLayerIds(docDB, ids);
      throw eDB;
    }
    var gidDB = ids.length > 1 ? __psGroupLayerIds(ids, params.groupName || "Dodge & Burn por zonas") : null;
    return { documentName: docDB.name, layers: madeDB, groupId: gidDB, strength: st, next: "Lower the group opacity to taste (30-70 %); compare with media_zone_report." };
  }

  if (action === "ps.recipe.frequencySeparation") {
    // Light frequency separation with no brush: Baixa (blur) + Alta (high pass, Linear Light) rebuild the photo;
    // "Suavizar pele" (more blur, masked to skin, low opacity) smooths only colour and tone, not texture.
    var docFS = __psRequireDoc();
    if (params.documentName) docFS = app.documents.getByName(params.documentName);
    app.activeDocument = docFS;
    var base = __psTargetLayer(docFS, params);
    var baseKind = __psKindOf(base);
    if (base.typename === "LayerSet" || (baseKind !== LayerKind.NORMAL && baseKind !== LayerKind.SMARTOBJECT)) {
      __mcpFail("INVALID_PARAMS", "Frequency separation needs a pixel or smart object layer; '" + base.name + "' is not one.");
    }
    var r = typeof params.radius === "number" ? params.radius : Math.max(2, Math.round(Math.max(Number(docFS.width), Number(docFS.height)) / 600));
    var low = base.duplicate();
    low.name = "Baixa frequencia";
    if (__psKindOf(low) === LayerKind.SMARTOBJECT) low.rasterize(RasterizeType.ENTIRELAYER);
    low.applyGaussianBlur(r);
    // Suavizar pele: edge-preserving Surface Blur. A Gaussian blur pulled the grey background into the face edge
    // and left a light halo around the head (live, 23/11/2026).
    var smooth = low.duplicate();
    smooth.name = "Suavizar pele";
    docFS.activeLayer = smooth;
    try {
      var sbD = new ActionDescriptor();
      sbD.putUnitDouble(charIDToTypeID("Rds "), charIDToTypeID("#Pxl"), r * 2);
      sbD.putInteger(charIDToTypeID("Thsh"), 15);
      executeAction(stringIDToTypeID("surfaceBlur"), sbD, DialogModes.NO);
    } catch (_eSb) {
      smooth.applyGaussianBlur(r);
    }
    smooth.opacity = typeof params.smoothOpacity === "number" ? params.smoothOpacity : 30;
    // Alta: Image > Apply Image (subtract the low layer, scale 2, offset 128; 16 bits: inverted add, scale 2) so
    // Alta in Linear Light over Baixa rebuilds the photo exactly. High Pass was only close: up to 97 levels off
    // at the edges, a halo around the head (live, 23/11/2026).
    var high = base.duplicate();
    high.name = "Alta frequencia";
    if (__psKindOf(high) === LayerKind.SMARTOBJECT) high.rasterize(RasterizeType.ENTIRELAYER);
    docFS.activeLayer = high;
    var is16 = docFS.bitsPerChannel === BitsPerChannelType.SIXTEEN;
    var aiD = new ActionDescriptor();
    var calc = new ActionDescriptor();
    var aiR = new ActionReference();
    aiR.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("RGB "));
    aiR.putIdentifier(charIDToTypeID("Lyr "), low.id);
    calc.putReference(charIDToTypeID("T   "), aiR);
    if (is16) calc.putBoolean(charIDToTypeID("Invr"), true);
    calc.putEnumerated(charIDToTypeID("Clcl"), charIDToTypeID("Clcn"), charIDToTypeID(is16 ? "Add " : "Sbtr"));
    calc.putDouble(charIDToTypeID("Scl "), 2);
    calc.putInteger(charIDToTypeID("Ofst"), is16 ? 0 : 128);
    aiD.putObject(charIDToTypeID("With"), charIDToTypeID("Clcl"), calc);
    executeAction(charIDToTypeID("AppI"), aiD, DialogModes.NO);
    high.blendMode = BlendMode.LINEARLIGHT;
    // stack: Alta (top) > Suavizar > Baixa > base
    low.move(base, ElementPlacement.PLACEBEFORE);
    smooth.move(low, ElementPlacement.PLACEBEFORE);
    high.move(smooth, ElementPlacement.PLACEBEFORE);
    var skinMask = "none";
    if (params.skinMask !== false) {
      try {
        docFS.activeLayer = base;
        __psRunDescriptor({ _obj: "colorRange", colors: { _enum: "colors", _value: "skinTone" }, fuzziness: 40 });
        if (__psSelectionBox(docFS)) {
          docFS.activeLayer = smooth;
          var mkS = new ActionDescriptor();
          mkS.putClass(charIDToTypeID("Nw  "), charIDToTypeID("Chnl"));
          var rS = new ActionReference();
          rS.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("Msk "));
          mkS.putReference(charIDToTypeID("At  "), rS);
          mkS.putEnumerated(charIDToTypeID("Usng"), charIDToTypeID("UsrM"), charIDToTypeID("RvlS"));
          executeAction(charIDToTypeID("Mk  "), mkS, DialogModes.NO);
          skinMask = "skinTone";
        }
        docFS.selection.deselect();
      } catch (_eSkin) {
        try { docFS.selection.deselect(); } catch (_eDs) {}
      }
      if (skinMask === "none") smooth.opacity = Math.min(smooth.opacity, 20);
    }
    var gFS = __psGroupLayerIds([high.id, smooth.id, low.id], params.groupName || "Separacao de frequencia");
    return { documentName: docFS.name, radius: r, layers: ["Alta frequencia", "Suavizar pele", "Baixa frequencia"], skinMask: skinMask, smoothOpacity: smooth.opacity, groupId: gFS, base: base.name };
  }

  if (action === "ps.recipe.filmGrain") {
    // Grain as a 50 % grey layer in Overlay with monochrome noise: works on every Photoshop version.
    var docGr = __psRequireDoc();
    if (params.documentName) docGr = app.documents.getByName(params.documentName);
    app.activeDocument = docGr;
    docGr.activeLayer = docGr.layers[0];
    var gl = __psGrainLayer(docGr, params.name || "Grao", typeof params.amount === "number" ? params.amount : 8, typeof params.size === "number" ? params.size : 0.6, typeof params.opacity === "number" ? params.opacity : 60);
    var sz = typeof params.size === "number" ? params.size : 0.6;
    return { documentName: docGr.name, layerId: gl.id, name: gl.name, amount: params.amount || 8, size: sz, opacity: gl.opacity };
  }

  if (action === "ps.recipe.look") {
    // A look as a stack of adjustment layers in one group above everything: editable, and the group opacity is
    // the intensity. The photo itself is not touched.
    var docLk = __psRequireDoc();
    if (params.documentName) docLk = app.documents.getByName(params.documentName);
    app.activeDocument = docLk;
    docLk.activeLayer = docLk.layers[0];
    var stk = params.stack || {};
    var idsLk = [];
    var madeLk = [];
    try {
    if (stk.blackAndWhite) {
      var bw = stk.blackAndWhite;
      var bwObj = { _obj: "blackAndWhite", presetKind: { _enum: "presetKindType", _value: "presetKindCustom" }, red: bw.red, yellow: bw.yellow, grain: bw.green, cyan: bw.cyan, blue: bw.blue, magenta: bw.magenta, useTint: !!bw.tint };
      if (bw.tint) bwObj.tintColor = { _obj: "RGBColor", red: bw.tint[0], grain: bw.tint[1], blue: bw.tint[2] };
      idsLk.push(__psAdjLayer("P&B", bwObj).id);
      madeLk.push("P&B");
    }
    if (stk.saturation !== undefined && stk.saturation !== null) {
      idsLk.push(__psAdjLayer("Saturacao", { _obj: "hueSaturation", presetKind: { _enum: "presetKindType", _value: "presetKindCustom" }, colorize: false, adjustment: [{ _obj: "hueSatAdjustmentV2", hue: 0, saturation: Number(stk.saturation), lightness: 0 }] }).id);
      madeLk.push("Saturacao");
    }
    if (stk.colorBalance) {
      idsLk.push(__psAdjLayer("Tom dividido", { _obj: "colorBalance", shadowLevels: stk.colorBalance.shadows, midtoneLevels: [0, 0, 0], highlightLevels: stk.colorBalance.highlights, preserveLuminosity: true }).id);
      madeLk.push("Tom dividido");
    }
    if (stk.curve) {
      idsLk.push(__psCurvesLayer("Contraste", stk.curve, 100).id);
      madeLk.push("Contraste");
    }
    if (stk.grain) {
      idsLk.push(__psGrainLayer(docLk, "Grao", stk.grain.amount, stk.grain.size, stk.grain.opacity).id);
      madeLk.push("Grao");
    }
    } catch (eLk) {
      __psRemoveLayerIds(docLk, idsLk);
      throw eLk;
    }
    if (!idsLk.length) __mcpFail("INVALID_PARAMS", "The look has no layers.");
    var gLk = idsLk.length > 1 ? __psGroupLayerIds(idsLk, "Look \u2013 " + (params.name || "look")) : idsLk[0];
    var grpLk = docLk.activeLayer;
    var opLk = Math.max(0, Math.min(100, typeof params.opacity === "number" ? params.opacity : 70));
    try { grpLk.opacity = opLk; } catch (_eOp) {}
    return { documentName: docLk.name, look: params.name, layers: madeLk, groupId: gLk, opacity: opLk };
  }

  if (action === "ps.layers.groupPlan") {
    // Builds the groups proposed by ps_organize_layers: children first, then the group that holds them.
    var docGP = __psRequireDoc();
    if (params.documentName) docGP = app.documents.getByName(params.documentName);
    app.activeDocument = docGP;
    var made = [];
    var failed = [];
    var buildGP = function (g) {
      var ids = [];
      var m;
      for (m = 0; m < (g.members || []).length; m++) ids.push(Number(g.members[m]));
      for (m = 0; m < (g.children || []).length; m++) {
        var cid = buildGP(g.children[m]);
        if (cid !== null) ids.push(cid);
      }
      if (ids.length < 2) return ids.length === 1 ? ids[0] : null;
      try {
        var gid = __psGroupLayerIds(ids, g.name);
        made.push({ name: g.name, id: gid, layers: ids.length });
        return gid;
      } catch (eGP) {
        failed.push({ name: g.name, error: String(eGP) });
        return null;
      }
    };
    for (var gp = 0; gp < (params.groups || []).length; gp++) buildGP(params.groups[gp]);
    return { documentName: docGP.name, created: made, failed: failed };
  }

  if (action === "ps.layer.create") {
    var docC = __psRequireDoc();
    var kind = params.layerType || "pixel";
    var createdLayer;
    var moveToC = null;
    if (kind === "group") {
      createdLayer = docC.layerSets.add();
    } else if (kind === "solidColor") {
      var fillC = __psMakeSolidColor(params.color);
      var mkDesc = new ActionDescriptor();
      var mkRef = new ActionReference();
      mkRef.putClass(stringIDToTypeID("contentLayer"));
      mkDesc.putReference(charIDToTypeID("null"), mkRef);
      var rgbDesc = new ActionDescriptor();
      rgbDesc.putDouble(charIDToTypeID("Rd  "), fillC.rgb.red);
      rgbDesc.putDouble(charIDToTypeID("Grn "), fillC.rgb.green);
      rgbDesc.putDouble(charIDToTypeID("Bl  "), fillC.rgb.blue);
      var typeDesc = new ActionDescriptor();
      typeDesc.putObject(charIDToTypeID("Clr "), charIDToTypeID("RGBC"), rgbDesc);
      var usingDesc = new ActionDescriptor();
      usingDesc.putObject(charIDToTypeID("Type"), stringIDToTypeID("solidColorLayer"), typeDesc);
      mkDesc.putObject(charIDToTypeID("Usng"), stringIDToTypeID("contentLayer"), usingDesc);
      executeAction(charIDToTypeID("Mk  "), mkDesc, DialogModes.NO);
      createdLayer = docC.activeLayer;
    } else {
      if (kind === "text") {
        var addedT = __psAddTextLayer(docC, params.artboard, params.position);
        createdLayer = addedT.layer;
        moveToC = addedT.moveTo;
        var ti = createdLayer.textItem;
        ti.contents = String(params.text || "Text").replace(/\r?\n/g, "\r");
        if (params.fontSize) ti.size = UnitValue(params.fontSize, "pt");
        if (params.font) ti.font = params.font;
        if (params.position) {
          ti.position = [UnitValue(params.position[0], "px"), UnitValue(params.position[1], "px")];
        }
        if (params.color) {
          ti.color = __psMakeSolidColor(params.color);
        }
      } else if (kind !== "pixel") {
        throw new Error("Unsupported layerType: " + kind);
      } else {
        createdLayer = docC.artLayers.add();
      }
    }
    if (params.name) createdLayer.name = params.name;
    if (typeof params.opacity === "number") createdLayer.opacity = params.opacity;
    if (params.blendMode && params.blendMode !== "normal") createdLayer.blendMode = __psBlendMode(params.blendMode);
    var outC = { id: createdLayer.id, name: String(createdLayer.name), layerType: kind };
    if (moveToC) {
      // LAST step (B39): after the move the reference is stale and the layer has a new id - read it back
      // from the top of the artboard instead of touching `createdLayer` again.
      createdLayer.move(moveToC, ElementPlacement.INSIDE);
      try {
        var topC = moveToC.layers[0];
        if (String(topC.name) === outC.name) outC.id = topC.id;
        outC.artboard = String(moveToC.name);
      } catch (_eTop) {}
    }
    return outC;
  }

  if (action === "ps.layer.editText") {
    var docT = __psRequireDoc();
    var lyrT = __psTargetLayer(docT, params);
    if (__psKindOf(lyrT) !== LayerKind.TEXT) {
      throw new Error("Layer '" + lyrT.name + "' is not a text layer.");
    }
    var tiE = lyrT.textItem;
    if (typeof params.text === "string") tiE.contents = params.text.replace(/\r?\n/g, "\r");
    if (params.font) tiE.font = params.font;
    if (params.fontSize) tiE.size = UnitValue(params.fontSize, "pt");
    if (params.color) tiE.color = __psMakeSolidColor(params.color);
    if (typeof params.tracking === "number") tiE.tracking = params.tracking;
    if (typeof params.leading === "number") {
      tiE.useAutoLeading = false;
      tiE.leading = UnitValue(params.leading, "pt");
    }
    if (params.alignment) {
      var justMap = {
        left: Justification.LEFT,
        center: Justification.CENTER,
        right: Justification.RIGHT,
        justify: Justification.FULLYJUSTIFIED
      };
      if (!justMap[params.alignment]) throw new Error("Unsupported alignment: " + params.alignment);
      tiE.justification = justMap[params.alignment];
    }
    return { id: lyrT.id, name: lyrT.name, text: String(tiE.contents), updated: true };
  }

  if (action === "ps.layer.manage") {
    var docG = __psRequireDoc();
    var lyrG = __psTargetLayer(docG, params);
    var opG = params.operation || "updateProperties";
    if (opG === "delete") {
      var delInfo = { deleted: true, layerId: lyrG.id, name: lyrG.name };
      lyrG.remove();
      return delInfo;
    }
    if (opG === "duplicate") {
      var dupL = lyrG.duplicate();
      if (params.newName) dupL.name = params.newName;
      return { duplicated: true, id: dupL.id, name: dupL.name };
    }
    if (opG === "translate") {
      lyrG.translate(UnitValue(params.deltaX || 0, "px"), UnitValue(params.deltaY || 0, "px"));
    } else if (opG === "scale") {
      lyrG.resize(params.scaleX || 100, params.scaleY || params.scaleX || 100, AnchorPosition.MIDDLECENTER);
    } else if (opG === "rotate") {
      lyrG.rotate(params.angle || 0, AnchorPosition.MIDDLECENTER);
    } else if (opG === "flipHorizontal") {
      lyrG.resize(-100, 100, AnchorPosition.MIDDLECENTER);
    } else if (opG === "flipVertical") {
      lyrG.resize(100, -100, AnchorPosition.MIDDLECENTER);
    } else if (opG === "rasterize") {
      lyrG.rasterize(RasterizeType.ENTIRELAYER);
    } else if (opG === "convertToSmartObject") {
      docG.activeLayer = lyrG;
      executeAction(stringIDToTypeID("newPlacedLayer"), undefined, DialogModes.NO);
      lyrG = docG.activeLayer;
    } else if (opG !== "updateProperties") {
      throw new Error("Unsupported ps.layer.manage operation: " + opG);
    }
    if (params.newName) lyrG.name = params.newName;
    if (typeof params.visible === "boolean") lyrG.visible = params.visible;
    if (typeof params.opacity === "number") lyrG.opacity = params.opacity;
    if (params.blendMode) lyrG.blendMode = __psBlendMode(params.blendMode);
    return { id: lyrG.id, name: lyrG.name, operation: opG, updated: true };
  }

  if (action === "ps.selection.operate") {
    var docSel = __psRequireDoc();
    var opS = params.operation;
    var fthr = params.feather || 0;
    if (opS === "selectAll") {
      docSel.selection.selectAll();
    } else if (opS === "clear") {
      docSel.selection.deselect();
    } else if (opS === "invert") {
      docSel.selection.invert();
    } else if (opS === "rectangle") {
      if (!params.bounds) throw new Error("operation 'rectangle' requires bounds.");
      var bR = params.bounds;
      docSel.selection.select(
        [[bR.left, bR.top], [bR.right, bR.top], [bR.right, bR.bottom], [bR.left, bR.bottom]],
        SelectionType.REPLACE, fthr, false
      );
    } else if (opS === "polygon") {
      if (!params.points || params.points.length < 3) throw new Error("operation 'polygon' requires at least 3 points.");
      docSel.selection.select(params.points, SelectionType.REPLACE, fthr, true);
    } else if (opS === "ellipse") {
      if (!params.bounds) throw new Error("operation 'ellipse' requires bounds.");
      var elDesc = new ActionDescriptor();
      var elRef = new ActionReference();
      elRef.putProperty(charIDToTypeID("Chnl"), charIDToTypeID("fsel"));
      elDesc.putReference(charIDToTypeID("null"), elRef);
      var elBox = new ActionDescriptor();
      elBox.putUnitDouble(charIDToTypeID("Top "), charIDToTypeID("#Pxl"), params.bounds.top);
      elBox.putUnitDouble(charIDToTypeID("Left"), charIDToTypeID("#Pxl"), params.bounds.left);
      elBox.putUnitDouble(charIDToTypeID("Btom"), charIDToTypeID("#Pxl"), params.bounds.bottom);
      elBox.putUnitDouble(charIDToTypeID("Rght"), charIDToTypeID("#Pxl"), params.bounds.right);
      elDesc.putObject(charIDToTypeID("T   "), charIDToTypeID("Elps"), elBox);
      elDesc.putBoolean(charIDToTypeID("AntA"), true);
      executeAction(charIDToTypeID("setd"), elDesc, DialogModes.NO);
      if (fthr > 0) docSel.selection.feather(fthr);
    } else if (opS === "selectSubject") {
      var ssDesc = new ActionDescriptor();
      ssDesc.putBoolean(stringIDToTypeID("sampleAllLayers"), false);
      executeAction(stringIDToTypeID("autoCutout"), ssDesc, DialogModes.NO);
    } else if (opS === "selectSky") {
      var skDesc = new ActionDescriptor();
      skDesc.putBoolean(stringIDToTypeID("sampleAllLayers"), false);
      executeAction(stringIDToTypeID("selectSky"), skDesc, DialogModes.NO);
    } else if (opS === "removeBackground") {
      executeAction(stringIDToTypeID("removeBackground"), undefined, DialogModes.NO);
    } else if (opS === "addMaskFromSelection") {
      var mkM = new ActionDescriptor();
      mkM.putClass(charIDToTypeID("Nw  "), charIDToTypeID("Chnl"));
      var mkMRef = new ActionReference();
      mkMRef.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("Msk "));
      mkM.putReference(charIDToTypeID("At  "), mkMRef);
      mkM.putEnumerated(charIDToTypeID("Usng"), charIDToTypeID("UsrM"), charIDToTypeID("RvlS"));
      executeAction(charIDToTypeID("Mk  "), mkM, DialogModes.NO);
    } else if (opS === "deleteMask") {
      var dlM = new ActionDescriptor();
      var dlMRef = new ActionReference();
      dlMRef.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("Msk "));
      dlM.putReference(charIDToTypeID("null"), dlMRef);
      executeAction(charIDToTypeID("Dlt "), dlM, DialogModes.NO);
    } else if (opS === "expand" || opS === "contract" || opS === "smooth" || opS === "feather" || opS === "border") {
      var amountS = Number(params.amount);
      if (!(amountS > 0)) __mcpFail("INVALID_PARAMS", "operation '" + opS + "' needs amount (pixels, greater than 0).");
      if (opS === "expand") docSel.selection.expand(amountS);
      else if (opS === "contract") docSel.selection.contract(amountS);
      else if (opS === "smooth") docSel.selection.smooth(amountS);
      else if (opS === "feather") docSel.selection.feather(amountS);
      else docSel.selection.selectBorder(amountS);
    } else if (opS === "grow" || opS === "similar") {
      var tolS = typeof params.tolerance === "number" ? params.tolerance : 32;
      if (opS === "grow") docSel.selection.grow(tolS, true);
      else docSel.selection.similar(tolS, true);
    } else if (opS === "colorRange") {
      var rangesS = { highlights: "highlights", midtones: "midtones", shadows: "shadows", reds: "radius", yellows: "yellows", greens: "graininess", cyans: "cyans", blues: "blues", magentas: "magenta", skinTones: "skinTone" };
      var rangeS = rangesS[params.range];
      if (!rangeS) __mcpFail("INVALID_PARAMS", "colorRange needs range: highlights, midtones, shadows, reds, yellows, greens, cyans, blues, magentas or skinTones.");
      __psRunDescriptor({ _obj: "colorRange", colors: { _enum: "colors", _value: rangeS } });
    } else if (opS === "saveSelection") {
      if (!params.name) __mcpFail("INVALID_PARAMS", "saveSelection needs name.");
      var chSave = null;
      try { chSave = docSel.channels.getByName(params.name); } catch (eChS) { chSave = null; }
      if (!chSave) { chSave = docSel.channels.add(); chSave.name = params.name; }
      docSel.selection.store(chSave);
      // adding a channel makes it the active one: go back to the composite so the next edits paint the image
      try { docSel.activeChannels = docSel.componentChannels; } catch (eChA) {}
    } else if (opS === "loadSelection") {
      if (!params.name) __mcpFail("INVALID_PARAMS", "loadSelection needs name.");
      var chLoad = null;
      try { chLoad = docSel.channels.getByName(params.name); } catch (eChL) { chLoad = null; }
      if (!chLoad) __mcpFail("SELECTION_NOT_FOUND", "No saved selection named '" + params.name + "' in this document.");
      docSel.selection.load(chLoad, SelectionType.REPLACE, !!params.invert);
    } else {
      throw new Error("Unsupported ps.selection.operate operation: " + opS);
    }
    var boundsS = null;
    try {
      var bb = docSel.selection.bounds;
      boundsS = { left: bb[0].as("px"), top: bb[1].as("px"), right: bb[2].as("px"), bottom: bb[3].as("px") };
    } catch (eNoSel) { boundsS = null; }
    return { operation: opS, completed: true, selectionBounds: boundsS };
  }

  if (action === "ps.guides") {
    var docG = __psRequireDoc();
    var opGd = params.operation || "list";
    if (opGd === "clear") {
      docG.guides.removeAll();
    } else if (opGd === "add") {
      var listG = params.guides || [];
      if (!listG.length) __mcpFail("INVALID_PARAMS", "add needs guides: [{ orientation: 'vertical'|'horizontal', position }] in pixels.");
      for (var gi = 0; gi < listG.length; gi++) {
        var gO = listG[gi];
        if (typeof gO.position !== "number" || (gO.orientation !== "vertical" && gO.orientation !== "horizontal")) {
          __mcpFail("INVALID_PARAMS", "Each guide needs orientation ('vertical' or 'horizontal') and position (pixels).");
        }
        docG.guides.add(gO.orientation === "vertical" ? Direction.VERTICAL : Direction.HORIZONTAL, new UnitValue(gO.position, "px"));
      }
    } else if (opGd === "layout") {
      // margins + equal columns/rows with gutters, the usual layout grid
      var wG = docG.width.as("px"), hG = docG.height.as("px");
      var mG = Number(params.margin) || 0, gutG = Number(params.gutter) || 0;
      var colsG = Number(params.columns) || 0, rowsG = Number(params.rows) || 0;
      if (!colsG && !rowsG && !mG) __mcpFail("INVALID_PARAMS", "layout needs margin, columns and/or rows.");
      var addV = function (x) { docG.guides.add(Direction.VERTICAL, new UnitValue(Math.round(x * 100) / 100, "px")); };
      var addH = function (y) { docG.guides.add(Direction.HORIZONTAL, new UnitValue(Math.round(y * 100) / 100, "px")); };
      if (params.replace) docG.guides.removeAll();
      if (colsG > 0) {
        var colW = (wG - 2 * mG - gutG * (colsG - 1)) / colsG;
        for (var cG = 0; cG < colsG; cG++) { var x0 = mG + cG * (colW + gutG); addV(x0); addV(x0 + colW); }
      } else if (mG > 0) { addV(mG); addV(wG - mG); }
      if (rowsG > 0) {
        var rowH = (hG - 2 * mG - gutG * (rowsG - 1)) / rowsG;
        for (var rG = 0; rG < rowsG; rG++) { var y0 = mG + rG * (rowH + gutG); addH(y0); addH(y0 + rowH); }
      } else if (mG > 0) { addH(mG); addH(hG - mG); }
    } else if (opGd !== "list") {
      __mcpFail("INVALID_PARAMS", "operation must be list, add, layout or clear.");
    }
    var outG = [];
    for (var lg = 0; lg < docG.guides.length; lg++) {
      outG.push({ orientation: docG.guides[lg].direction === Direction.VERTICAL ? "vertical" : "horizontal", position: Math.round(docG.guides[lg].coordinate.as("px") * 100) / 100 });
    }
    return { operation: opGd, document: docG.name, guideCount: outG.length, guides: outG.slice(0, 200) };
  }

  if (action === "ps.cameraRaw") {
    // Camera Raw as a filter on the target layer (a Smart Object keeps it editable as a Smart Filter).
    var docCR = __psRequireDoc();
    var lyrCR = __psTargetLayer(docCR, params);
    docCR.activeLayer = lyrCR;
    var sCR = params.settings || {};
    var mapCR = __psCameraRawKeys();
    var descCR = new ActionDescriptor();
    var usedCR = [], unknownCR = [];
    for (var kCR in sCR) {
      if (!sCR.hasOwnProperty(kCR)) continue;
      var specCR = mapCR[kCR];
      if (!specCR) { unknownCR.push(kCR); continue; }
      var vCR = Number(sCR[kCR]);
      if (isNaN(vCR)) __mcpFail("INVALID_PARAMS", "Camera Raw setting '" + kCR + "' must be a number.");
      if (vCR < specCR.min || vCR > specCR.max) __mcpFail("INVALID_PARAMS", "Camera Raw setting '" + kCR + "' must be between " + specCR.min + " and " + specCR.max + ".");
      if (specCR.type === "double") descCR.putDouble(charIDToTypeID(specCR.id), vCR);
      else descCR.putInteger(charIDToTypeID(specCR.id), Math.round(vCR));
      usedCR.push(kCR);
    }
    if (unknownCR.length) __mcpFail("INVALID_PARAMS", "Unknown Camera Raw settings: " + unknownCR.join(", ") + ". Available: " + __psCameraRawNames().join(", ") + ".");
    if (!usedCR.length) __mcpFail("INVALID_PARAMS", "settings is empty. Available: " + __psCameraRawNames().join(", ") + ".");
    executeAction(stringIDToTypeID("Adobe Camera Raw Filter"), descCR, DialogModes.NO);
    return { layer: lyrCR.name, applied: usedCR, smartFilter: __psKindOf(lyrCR) === LayerKind.SMARTOBJECT };
  }

  if (action === "ps.effects.apply") {
    var docF = __psRequireDoc();
    var sF = params.settings || {};
    if (params.category === "layerStyle") {
      var lyrS = __psTargetLayer(docF, params);
      docF.activeLayer = lyrS;
      var fx = __psLayerStyle(params.type, sF);
      // Keep the styles already on the layer: read its layerEffects descriptor and put this one effect into it.
      // (Setting a fresh layerEffects object would wipe every other style.) replaceExisting: true starts clean.
      var idFx = stringIDToTypeID("layerEffects");
      var refFx = new ActionReference();
      refFx.putProperty(charIDToTypeID("Prpr"), idFx);
      refFx.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
      var allFx = null;
      if (params.replaceExisting !== true) {
        try {
          var gotFx = executeActionGet(refFx);
          if (gotFx.hasKey(idFx)) allFx = gotFx.getObjectValue(idFx);
        } catch (eFx) { allFx = null; }
      }
      var keptFx = allFx !== null;
      if (!allFx) {
        allFx = new ActionDescriptor();
        allFx.putUnitDouble(stringIDToTypeID("scale"), charIDToTypeID("#Prc"), 100);
      }
      var idMulti = stringIDToTypeID(fx.key + "Multi");
      if (allFx.hasKey(idMulti)) allFx.erase(idMulti);
      allFx.putObject(stringIDToTypeID(fx.key), __psId(fx.value._obj), __psToDescriptor(fx.value));
      var setFx = new ActionDescriptor();
      setFx.putReference(charIDToTypeID("null"), refFx);
      setFx.putObject(charIDToTypeID("T   "), idFx, allFx);
      executeAction(charIDToTypeID("setd"), setFx, DialogModes.NO);
      return {
        applied: params.type,
        category: "layerStyle",
        layerId: lyrS.id,
        keptExistingStyles: keptFx,
        styles: __psLayerStyleNames(refFx)
      };
    }
    if (params.category !== "filter") {
      __mcpUnsupported("Photoshop adjustment layers go through ps_adjustment_layer (works without the UXP panel).");
    }
    var lyrF = __psTargetLayer(docF, params);
    docF.activeLayer = lyrF;
    if (params.type === "gaussianBlur") {
      lyrF.applyGaussianBlur(sF.radius || 10);
    } else if (params.type === "motionBlur") {
      lyrF.applyMotionBlur(sF.angle || 0, sF.distance || 15);
    } else if (params.type === "highPass") {
      lyrF.applyHighPass(sF.radius || 10);
    } else if (params.type === "addNoise") {
      lyrF.applyAddNoise(
        sF.amount || 10,
        sF.distribution === "uniform" ? NoiseDistribution.UNIFORM : NoiseDistribution.GAUSSIAN,
        Boolean(sF.monochromatic)
      );
    } else if (params.type === "unsharpMask") {
      lyrF.applyUnSharpMask(sF.amount || 100, sF.radius || 1, sF.threshold || 0);
    } else {
      __mcpUnsupported("Photoshop filter '" + params.type + "' is not available through ExtendScript here; use the UXP panel or ps_batch_play.");
    }
    return { applied: params.type, category: "filter", layer: lyrF.name };
  }

  if (action === "ps.raw.batchPlay") {
    var descs = params.descriptors || [];
    var results = [];
    var errorCount = 0;
    var continueOnError = params.options && params.options.continueOnError === true;
    for (var di = 0; di < descs.length; di++) {
      try {
        results.push(__psRunDescriptor(descs[di]));
      } catch (eDesc) {
        errorCount++;
        results.push({ _obj: "error", message: String(eDesc.message || eDesc), result: -1, descriptor: descs[di]._obj });
        if (!continueOnError) break;
      }
    }
    return { count: descs.length, executed: results.length, errorCount: errorCount, results: results, bridge: "extendscript" };
  }

  if (action === "ps.filter.applyDom") {
    var docF = __psRequireDoc();
    var lyrF = __psTargetLayer(docF, params);
    var fname = String(params.filter || "");
    if (!/^apply[A-Z][A-Za-z]+$/.test(fname)) throw new Error("filter must be a Layer method name such as applyGaussianBlur.");
    docF.activeLayer = lyrF;
    if (typeof lyrF[fname] !== "function") {
      __mcpUnsupported("Layer." + fname + " is not available in this Photoshop (ExtendScript) for a " + lyrF.typename + ".");
    }
    var argsF = [];
    var rawArgs = params.args || [];
    for (var ai = 0; ai < rawArgs.length; ai++) argsF.push(__psResolveEnumArg(rawArgs[ai]));
    lyrF[fname].apply(lyrF, argsF);
    return { filter: fname, layerId: lyrF.id, layerName: lyrF.name, layerKind: __psKindName(lyrF) };
  }

  if (action === "ps.menu.perform") {
    var md = new ActionDescriptor();
    var mr = new ActionReference();
    mr.putEnumerated(charIDToTypeID("Mn  "), charIDToTypeID("MnIt"), params.commandId);
    md.putReference(charIDToTypeID("null"), mr);
    executeAction(charIDToTypeID("slct"), md, DialogModes.NO);
    return { performed: true, commandId: params.commandId, title: null };
  }

  if (action === "ps.action.list") {
    var sets = [];
    for (var si = 1; si <= 500; si++) {
      var sref = new ActionReference();
      sref.putIndex(charIDToTypeID("ASet"), si);
      var sdesc = null;
      try {
        sdesc = executeActionGet(sref);
      } catch (_eEnd) {
        break;
      }
      var setName = sdesc.getString(charIDToTypeID("Nm  "));
      var count = sdesc.hasKey(charIDToTypeID("NmbC")) ? sdesc.getInteger(charIDToTypeID("NmbC")) : 0;
      var names = [];
      for (var aj = 1; aj <= count; aj++) {
        var aref = new ActionReference();
        aref.putIndex(charIDToTypeID("Actn"), aj);
        aref.putIndex(charIDToTypeID("ASet"), si);
        try {
          names.push(executeActionGet(aref).getString(charIDToTypeID("Nm  ")));
        } catch (_eA) {}
      }
      sets.push({ name: setName, actions: names });
    }
    return { count: sets.length, sets: sets };
  }

  if (action === "ps.fonts.list") {
    var fq = params.search ? String(params.search).toLowerCase().replace(/[\s_-]+/g, "") : "";
    var fLimit = typeof params.limit === "number" ? params.limit : 200;
    var fOut = [];
    var fTotal = 0;
    for (var fi2 = 0; fi2 < app.fonts.length; fi2++) {
      var fnt = app.fonts[fi2];
      var hay = (String(fnt.family) + String(fnt.style) + String(fnt.postScriptName)).toLowerCase().replace(/[\s_-]+/g, "");
      if (fq && hay.indexOf(fq) < 0) continue;
      fTotal++;
      if (fOut.length < fLimit) fOut.push({ postScriptName: String(fnt.postScriptName), family: String(fnt.family), style: String(fnt.style) });
    }
    return { installed: app.fonts.length, matched: fTotal, truncated: fTotal > fOut.length, fonts: fOut };
  }

  if (action === "ps.layer.place") {
    var docPl = __psRequireDoc();
    var plFile = new File(params.filePath);
    if (!plFile.exists) __mcpFail("FILE_NOT_FOUND", "File not found: " + params.filePath);
    var plDesc = new ActionDescriptor();
    plDesc.putPath(charIDToTypeID("null"), plFile);
    if (params.linked === true) plDesc.putBoolean(charIDToTypeID("Lnkd"), true);
    executeAction(stringIDToTypeID("placeEvent"), plDesc, DialogModes.NO);
    var plLayer = docPl.activeLayer;
    if (params.name) plLayer.name = String(params.name);
    var pb = plLayer.bounds;
    var pw = pb[2].as("px") - pb[0].as("px");
    var ph = pb[3].as("px") - pb[1].as("px");
    var boxW = typeof params.width === "number" ? params.width : null;
    var boxH = typeof params.height === "number" ? params.height : null;
    var fitMode = params.fit || (boxW && boxH ? "contain" : (boxW ? "width" : (boxH ? "height" : "none")));
    var sPct = null;
    if (fitMode === "width" && boxW) sPct = boxW / pw * 100;
    else if (fitMode === "height" && boxH) sPct = boxH / ph * 100;
    else if (fitMode === "contain" && boxW && boxH) sPct = Math.min(boxW / pw, boxH / ph) * 100;
    else if (fitMode === "cover" && boxW && boxH) sPct = Math.max(boxW / pw, boxH / ph) * 100;
    if (sPct !== null) plLayer.resize(sPct, sPct, AnchorPosition.TOPLEFT);
    pb = plLayer.bounds;
    if (typeof params.x === "number" || typeof params.y === "number") {
      var nw = pb[2].as("px") - pb[0].as("px");
      var nh = pb[3].as("px") - pb[1].as("px");
      // x/y place the top-left corner; with a box, the content is centred inside it.
      var tx = typeof params.x === "number" ? params.x + (boxW ? (boxW - nw) / 2 : 0) : pb[0].as("px");
      var ty = typeof params.y === "number" ? params.y + (boxH ? (boxH - nh) / 2 : 0) : pb[1].as("px");
      plLayer.translate(new UnitValue(tx - pb[0].as("px"), "px"), new UnitValue(ty - pb[1].as("px"), "px"));
      pb = plLayer.bounds;
    }
    return {
      layerId: plLayer.id,
      layerName: plLayer.name,
      kind: __psKindName(plLayer),
      linked: params.linked === true,
      bounds: [pb[0].as("px"), pb[1].as("px"), pb[2].as("px"), pb[3].as("px")],
      scalePercent: sPct
    };
  }

  if (action === "ps.variants") {
    // One template PSD → one exported file per record: text layers and Smart Objects are found by
    // name (layer names = record columns), filled, exported, and the document goes back to its state.
    var docV = params.documentName ? app.documents.getByName(params.documentName) : __psRequireDoc();
    app.activeDocument = docV;
    var recsV = params.records || [];
    if (!recsV.length) __mcpFail("INVALID_PARAMS", "No records.");
    var outDirV = new Folder(params.outputFolder);
    if (!outDirV.exists) __mcpEnsureFolder(outDirV, 0);
    var fmtV = String(params.format || "png").toLowerCase();
    var layersByName = {};
    var collect = function (container) {
      for (var li = 0; li < container.layers.length; li++) {
        var ly = container.layers[li];
        if (!layersByName[ly.name]) layersByName[ly.name] = [];
        layersByName[ly.name].push(ly);
        if (ly.typename === "LayerSet") collect(ly);
      }
    };
    collect(docV);
    var startState = docV.activeHistoryState;
    var results = [];
    var unknownCols = {};
    for (var rv = 0; rv < recsV.length; rv++) {
      var recV = recsV[rv];
      var setCount = 0;
      var warn = [];
      for (var col in recV) {
        if (!Object.prototype.hasOwnProperty.call(recV, col)) continue;
        if (col === "__file") continue;
        var targets = layersByName[col];
        if (!targets) {
          unknownCols[col] = true;
          continue;
        }
        var val = String(recV[col]);
        for (var tl = 0; tl < targets.length; tl++) {
          var lyr = targets[tl];
          if (__psKindOf(lyr) === LayerKind.TEXT) {
            lyr.textItem.contents = val.replace(/\\r|\\n|\n/g, "\r");
            setCount++;
          } else if (__psKindOf(lyr) === LayerKind.SMARTOBJECT && val) {
            var fV = new File(val);
            if (!fV.exists) {
              warn.push("file not found for " + col + ": " + val);
              continue;
            }
            docV.activeLayer = lyr;
            var dsc = new ActionDescriptor();
            dsc.putPath(charIDToTypeID("null"), fV);
            executeAction(stringIDToTypeID("placedLayerReplaceContents"), dsc, DialogModes.NO);
            setCount++;
          } else if (val === "hide" || val === "show") {
            lyr.visible = val === "show";
            setCount++;
          }
        }
      }
      var nameV = String(recV.__file || ("variant_" + (rv < 9 ? "0" : "") + (rv + 1))).replace(/[\\\/:*?"<>|]+/g, "_");
      var fileV = new File(outDirV.fsName + "/" + nameV + "." + (fmtV === "jpg" ? "jpg" : fmtV));
      if (fmtV === "jpg") {
        var jo = new JPEGSaveOptions();
        jo.quality = typeof params.quality === "number" ? params.quality : 10;
        jo.embedColorProfile = true;
        docV.saveAs(fileV, jo, true, Extension.LOWERCASE);
      } else if (fmtV === "psd") {
        var po = new PhotoshopSaveOptions();
        po.layers = true;
        docV.saveAs(fileV, po, true, Extension.LOWERCASE);
      } else {
        var pngo = new PNGSaveOptions();
        pngo.compression = 6;
        docV.saveAs(fileV, pngo, true, Extension.LOWERCASE);
      }
      results.push({ record: rv + 1, file: fileV.fsName, exists: fileV.exists, layersSet: setCount, warnings: warn });
      docV.activeHistoryState = startState;
    }
    var unk = [];
    for (var uc in unknownCols) if (Object.prototype.hasOwnProperty.call(unknownCols, uc)) unk.push(uc);
    return { document: docV.name, exported: results.length, files: results, columnsWithoutLayer: unk };
  }


  if (action === "ps.artboards") {
    var docA = params.documentName ? app.documents.getByName(params.documentName) : __psRequireDoc();
    app.activeDocument = docA;
    var prevUnitsA = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;
    try {
      var opA = params.operation || "list";
      if (opA === "list") {
        var listA = __psArtboards(docA);
        return { document: docA.name, count: listA.length, artboards: listA, canvas: { width: docA.width.as("px"), height: docA.height.as("px") } };
      }
      if (opA === "quickExport") {
        // File > Export > Quick Export as PNG: Photoshop writes one file per artboard (named after it).
        // The files appear shortly AFTER the script returns; the tool waits for them on the Node side.
        var listQ = __psArtboards(docA);
        var folderQ = new Folder(params.outputFolder);
        if (!folderQ.exists) folderQ.create();
        var dQ = new ActionDescriptor();
        var rQ = new ActionReference();
        rQ.putEnumerated(stringIDToTypeID("layer"), stringIDToTypeID("ordinal"), stringIDToTypeID("targetEnum"));
        dQ.putReference(stringIDToTypeID("null"), rQ);
        dQ.putString(stringIDToTypeID("fileType"), params.format === "jpg" ? "jpg" : "png");
        dQ.putInteger(stringIDToTypeID("quality"), 32);
        dQ.putInteger(stringIDToTypeID("metadata"), 0);
        dQ.putString(stringIDToTypeID("destFolder"), folderQ.fsName);
        dQ.putBoolean(stringIDToTypeID("sRGB"), true);
        dQ.putBoolean(stringIDToTypeID("openWindow"), false);
        executeAction(stringIDToTypeID("exportDocumentAsFileTypePressed"), dQ, DialogModes.NO);
        var namesQ = [];
        for (var qa = 0; qa < listQ.length; qa++) namesQ.push(String(listQ[qa].name));
        return { document: docA.name, method: "quickExport", folder: folderQ.fsName, expected: namesQ, extension: params.format === "jpg" ? "jpg" : "png" };
      }
      if (opA === "create") {
        var specs = params.artboards || [];
        if (!specs.length) __mcpFail("INVALID_PARAMS", "artboards: [{ name, width, height, x?, y? }]");
        var existingA = __psArtboards(docA);
        var cursorX = 0;
        for (var ea = 0; ea < existingA.length; ea++) cursorX = Math.max(cursorX, existingA[ea].rect.x + existingA[ea].rect.width + (params.gap || 100));
        var made = [];
        for (var sa = 0; sa < specs.length; sa++) {
          var sp = specs[sa];
          var rectA = { x: typeof sp.x === "number" ? sp.x : cursorX, y: typeof sp.y === "number" ? sp.y : 0, width: sp.width, height: sp.height };
          var abL = __psMakeArtboard(docA, sp.name, rectA);
          if (sp.backgroundColor) {
            var bgL = abL.artLayers.add();
            bgL.name = "Fundo";
            docA.activeLayer = bgL;
            docA.selection.select([[rectA.x, rectA.y], [rectA.x + rectA.width, rectA.y], [rectA.x + rectA.width, rectA.y + rectA.height], [rectA.x, rectA.y + rectA.height]]);
            docA.selection.fill(__psMakeSolidColor(sp.backgroundColor));
            docA.selection.deselect();
          }
          cursorX = rectA.x + rectA.width + (params.gap || 100);
          made.push({ name: String(abL.name), id: abL.id, rect: rectA });
        }
        return { document: docA.name, created: made, artboards: __psArtboards(docA) };
      }
      if (opA === "export") {
        var allA = __psArtboards(docA);
        var wanted = params.names && params.names.length ? params.names : null;
        var pick = [];
        for (var pa = 0; pa < allA.length; pa++) {
          if (!wanted) pick.push(allA[pa]);
          else for (var wn = 0; wn < wanted.length; wn++) if (wanted[wn] === allA[pa].name) pick.push(allA[pa]);
        }
        if (!pick.length) __mcpFail("NOT_FOUND", wanted ? "No artboard named " + wanted.join(", ") + ". Use operation 'list'." : "The document has no artboards.");
        var fmtA = String(params.format || "png").toLowerCase();
        var outA = new Folder(params.outputFolder);
        if (!outA.exists) __mcpEnsureFolder(outA, 0);
        var files = [];
        var warnA = [];
        for (var xa = 0; xa < pick.length; xa++) {
          var abI = pick[xa];
          // B40 (18/11/2026): on a script-built PSD the first artboard exported right and the others came out
          // blank. The old path deleted the hidden artboards before cropping, and without them the canvas
          // origin moves, so the crop rectangle missed the art. Now: opaque artboards use a FLATTENED
          // duplicate cropped by the artboard rectangle (the path that worked live); transparent ones keep
          // the hide-and-merge path but no artboard is deleted before the crop.
          var rr = abI.rect;
          var bgT = abI.background;
          var keepAlpha = bgT === "transparent" && (fmtA === "png" || fmtA === "webp");
          var dup = docA.duplicate("mcp_ab_" + xa, !keepAlpha);
          try {
            if (keepAlpha) {
              for (var rl = 0; rl < dup.layers.length; rl++) dup.layers[rl].visible = dup.layers[rl].name === abI.name;
              try {
                dup.mergeVisibleLayers();
              } catch (_eMv) {
                dup.layers.getByName(abI.name).merge();
              }
            }
            dup.crop([UnitValue(rr.x, "px"), UnitValue(rr.y, "px"), UnitValue(rr.x + rr.width, "px"), UnitValue(rr.y + rr.height, "px")]);
            __psPrepareForWeb(dup, params, warnA);
            var base = String(params.fileNamePattern || "{{name}}").replace(/\{\{\s*name\s*\}\}/g, abI.name).replace(/\{\{\s*#\s*\}\}/g, (xa < 9 ? "0" : "") + (xa + 1)).replace(/\{\{\s*document\s*\}\}/g, String(docA.name).replace(/\.[^.]+$/, ""));
            var rec = __psWriteWeb(dup, outA.fsName + "/" + __psSafeName(base) + "." + fmtA, fmtA, params.quality, params);
            rec.artboard = abI.name;
            files.push(rec);
          } finally {
            dup.close(SaveOptions.DONOTSAVECHANGES);
          }
        }
        app.activeDocument = docA;
        return { document: docA.name, format: fmtA, files: files, warnings: warnA };
      }
      __mcpFail("INVALID_PARAMS", "Unknown artboards operation '" + opA + "'.");
    } finally {
      app.preferences.rulerUnits = prevUnitsA;
    }
  }

  if (action === "ps.export.web") {
    var docW = params.documentName ? app.documents.getByName(params.documentName) : __psRequireDoc();
    app.activeDocument = docW;
    var prevUnitsW = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;
    var warnW = [];
    try {
      var fmtW = String(params.format || "jpg").toLowerCase();
      if (__psArtboards(docW).length) {
        __mcpFail("INVALID_PARAMS", "This document has artboards: export them with ps_artboards (operation 'export'), which takes the same format, quality, maxKB, scale and maxWidth options.");
      }
      var sizes = params.sizes && params.sizes.length ? params.sizes : [{ suffix: "", maxWidth: params.maxWidth, maxHeight: params.maxHeight, scale: params.scale }];
      var outW = [];
      for (var sz = 0; sz < sizes.length; sz++) {
        var dupW = docW.duplicate("mcp_web_" + sz, false);
        try {
          if (fmtW === "jpg") dupW.flatten();
          var pW = {};
          for (var kp in params) if (params.hasOwnProperty(kp)) pW[kp] = params[kp];
          pW.maxWidth = sizes[sz].maxWidth;
          pW.maxHeight = sizes[sz].maxHeight;
          pW.scale = sizes[sz].scale;
          __psPrepareForWeb(dupW, pW, warnW);
          // Name: path without a known extension + suffix + extension of the format ("$1" of an unmatched group is "undefined" in ExtendScript).
          var fp = String(params.filePath).replace(/\.(png|jpe?g|webp)$/i, "");
          fp += String(sizes[sz].suffix || "") + "." + fmtW;
          outW.push(__psWriteWeb(dupW, fp, fmtW, params.quality, pW));
        } finally {
          dupW.close(SaveOptions.DONOTSAVECHANGES);
        }
      }
      app.activeDocument = docW;
      return { document: docW.name, format: fmtW, files: outW, warnings: warnW };
    } finally {
      app.preferences.rulerUnits = prevUnitsW;
    }
  }


  if (action === "ps.audit") {
    var docAu = params.documentName ? app.documents.getByName(params.documentName) : __psRequireDoc();
    app.activeDocument = docAu;
    var prevUnitsAu = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;
    try {
      var layersAu = [];
      __psAuditWalk(docAu, docAu, layersAu, 0, "");
      var W = docAu.width.as("px"), H = docAu.height.as("px");
      var maxText = typeof params.maxTextLayers === "number" ? params.maxTextLayers : 12;
      var sampled = 0;
      if (params.sampleBackground !== false) {
        for (var la = 0; la < layersAu.length && sampled < maxText; la++) {
          var rec = layersAu[la];
          if (!rec.text || !rec.visible || !rec.bounds) continue;
          var bx = rec.bounds;
          var x0 = Math.max(0, bx[0]), y0 = Math.max(0, bx[1]), x1 = Math.min(W - 1, bx[2]), y1 = Math.min(H - 1, bx[3]);
          if (x1 <= x0 || y1 <= y0) continue;
          var lyr = null;
          try {
            lyr = docAu.layers.length ? __psFindLayer(docAu, rec.id, null) : null;
          } catch (_eFl) {}
          if (!lyr) continue;
          lyr.visible = false;
          var pts = [[0.5, 0.5], [0.15, 0.3], [0.85, 0.3], [0.15, 0.75], [0.85, 0.75], [0.5, 0.15], [0.5, 0.88]];
          var samples = [];
          try {
            for (var sp = 0; sp < pts.length; sp++) {
              var c = __psSample(docAu, x0 + (x1 - x0) * pts[sp][0], y0 + (y1 - y0) * pts[sp][1]);
              if (c) samples.push(c);
            }
          } finally {
            lyr.visible = true;
          }
          rec.text.background = samples;
          sampled++;
        }
      }
      var profile = "";
      try {
        profile = String(docAu.colorProfileName);
      } catch (_eP) {}
      return {
        document: docAu.name,
        width: W,
        height: H,
        resolution: docAu.resolution,
        mode: String(docAu.mode),
        bits: String(docAu.bitsPerChannel),
        profile: profile,
        layers: layersAu,
        sampledTextLayers: sampled
      };
    } finally {
      app.preferences.rulerUnits = prevUnitsAu;
    }
  }


  // 18/11/2026 — recolour an object that already has colour: hue, saturation and luminosity as three
  // separate adjustments inside one masked group (the user's method; Color blend mode over-saturates).
  if (action === "ps.recolor.object") {
    var docRc = params.documentName ? app.documents.getByName(params.documentName) : __psRequireDoc();
    app.activeDocument = docRc;
    var prevRc = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;
    var cRc = charIDToTypeID, sRc = stringIDToTypeID;
    try {
      var hasSel = false;
      if (params.maskPath) {
        var mf = new File(params.maskPath);
        if (!mf.exists) __mcpFail("FILE_NOT_FOUND", "Mask not found: " + params.maskPath);
        var md = app.open(mf);
        md.selection.selectAll();
        md.selection.copy();
        md.close(SaveOptions.DONOTSAVECHANGES);
        app.activeDocument = docRc;
        docRc.selection.deselect();
        var pasted = docRc.paste();
        var dSel = new ActionDescriptor();
        var rSel = new ActionReference();
        rSel.putProperty(cRc("Chnl"), cRc("fsel"));
        dSel.putReference(cRc("null"), rSel);
        var tSel = new ActionReference();
        tSel.putEnumerated(cRc("Chnl"), cRc("Chnl"), cRc("RGB "));
        dSel.putReference(cRc("T   "), tSel);
        executeAction(cRc("setd"), dSel, DialogModes.NO);
        pasted.remove();
        hasSel = true;
      } else {
        try {
          var sb = docRc.selection.bounds;
          hasSel = !!sb;
        } catch (_eNoSel) {
          hasSel = false;
        }
      }
      if (!hasSel) __mcpFail("INVALID_PARAMS", "Give maskPath (white = object) or make a selection of the object first.");
      var chan = docRc.channels.add();
      chan.name = "__mcp_recolor_sel";
      docRc.selection.store(chan);
      docRc.selection.deselect();
      docRc.activeChannels = docRc.componentChannels;

      var grpRc = docRc.layerSets.add();
      grpRc.name = params.groupName || "Recolorir";
      function mkAdjRc(typeDesc, typeId, nm) {
        var d = new ActionDescriptor();
        var r = new ActionReference();
        r.putClass(cRc("AdjL"));
        d.putReference(cRc("null"), r);
        var u = new ActionDescriptor();
        u.putObject(cRc("Type"), typeId, typeDesc);
        d.putObject(cRc("Usng"), cRc("AdjL"), u);
        executeAction(cRc("Mk  "), d, DialogModes.NO);
        docRc.activeLayer.name = nm;
        return docRc.activeLayer;
      }
      var curvePts = params.curve && params.curve.length >= 2 ? params.curve : [[0, 0], [255, 255]];
      var cv = new ActionDescriptor();
      cv.putEnumerated(sRc("presetKind"), sRc("presetKindType"), sRc("presetKindCustom"));
      var cl = new ActionList();
      var ca = new ActionDescriptor();
      var chr = new ActionReference();
      chr.putEnumerated(cRc("Chnl"), cRc("Chnl"), cRc("Cmps"));
      ca.putReference(cRc("Chnl"), chr);
      var pts = new ActionList();
      for (var ci = 0; ci < curvePts.length; ci++) {
        var pt = new ActionDescriptor();
        pt.putDouble(cRc("Hrzn"), curvePts[ci][0]);
        pt.putDouble(cRc("Vrtc"), curvePts[ci][1]);
        pts.putObject(cRc("Pnt "), pt);
      }
      ca.putList(cRc("Crv "), pts);
      cl.putObject(cRc("CrvA"), ca);
      cv.putList(cRc("Adjs"), cl);
      var lumL = mkAdjRc(cv, cRc("Crvs"), "Luminosidade (curvas)");
      lumL.move(grpRc, ElementPlacement.INSIDE);

      var hs = new ActionDescriptor();
      hs.putEnumerated(sRc("presetKind"), sRc("presetKindType"), sRc("presetKindCustom"));
      hs.putBoolean(cRc("Clrz"), false);
      var hl = new ActionList();
      var ha = new ActionDescriptor();
      ha.putInteger(cRc("H   "), 0);
      ha.putInteger(cRc("Strt"), typeof params.saturation === "number" ? params.saturation : 0);
      ha.putInteger(cRc("Lght"), 0);
      hl.putObject(cRc("Hst2"), ha);
      hs.putList(cRc("Adjs"), hl);
      var satL = mkAdjRc(hs, cRc("HStr"), "Saturacao (matiz/saturacao)");
      satL.move(lumL, ElementPlacement.PLACEBEFORE);

      var hueL = __psShapeLayerSolid(docRc, params.color, "Matiz (matiz)");
      hueL.blendMode = BlendMode.HUE;
      hueL.move(satL, ElementPlacement.PLACEBEFORE);

      docRc.selection.load(chan);
      if (params.feather) docRc.selection.feather(params.feather);
      docRc.activeLayer = grpRc;
      var mk = new ActionDescriptor();
      mk.putClass(cRc("Nw  "), cRc("Chnl"));
      var mr = new ActionReference();
      mr.putEnumerated(cRc("Chnl"), cRc("Chnl"), cRc("Msk "));
      mk.putReference(cRc("At  "), mr);
      mk.putEnumerated(cRc("Usng"), cRc("UsrM"), cRc("RvlS"));
      executeAction(cRc("Mk  "), mk, DialogModes.NO);
      try {
        docRc.selection.deselect();
      } catch (_eDs) {}
      chan.remove();
      return { group: String(grpRc.name), layers: ["Matiz (matiz)", "Saturacao (matiz/saturacao)", "Luminosidade (curvas)"], color: params.color, saturation: typeof params.saturation === "number" ? params.saturation : 0, curve: curvePts };
    } finally {
      app.preferences.rulerUnits = prevRc;
    }
  }

  // 18/11/2026 — Blend If (advanced blending): lets the shadows/texture of the layer below show through
  // a print or logo placed on fabric. Split values = [start, end] of the soft transition.
  // 18/11/2026: text centred in a shape by the CAP HEIGHT (rule of the user: the ink box of a line with
  // descenders or accents sits too high or too low; the eye centres the capitals). Measures an "H" in the
  // same style on a temporary copy, then moves the text. Only the copy made here is removed.
  if (action === "ps.text.centerInShape") {
    var docCt = params.documentName ? app.documents.getByName(params.documentName) : __psRequireDoc();
    app.activeDocument = docCt;
    var prevUnitsCt = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;
    try {
      var txL = __psFindLayer(docCt, params.textLayerId, params.textLayerName);
      var shL = __psFindLayer(docCt, params.shapeLayerId, params.shapeLayerName);
      if (!txL) __mcpFail("NOT_FOUND", "Text layer not found (textLayerName / textLayerId).");
      if (!shL) __mcpFail("NOT_FOUND", "Shape layer not found (shapeLayerName / shapeLayerId).");
      if (__psKindOf(txL) !== LayerKind.TEXT) __mcpFail("INVALID_PARAMS", "'" + txL.name + "' is not a text layer.");
      function bx(layer) {
        var b = layer.bounds;
        try {
          if (layer.boundsNoEffects) b = layer.boundsNoEffects;
        } catch (_eNe) {}
        return [b[0].as("px"), b[1].as("px"), b[2].as("px"), b[3].as("px")];
      }
      var sb = bx(shL), tb = bx(txL);
      var shCx = (sb[0] + sb[2]) / 2, shCy = (sb[1] + sb[3]) / 2;
      var modeCt = params.mode || "capHeight";
      var topCt = tb[1], botCt = tb[3], usedCt = "ink";
      if (modeCt === "capHeight") {
        var tiCt = txL.textItem;
        var linesCt = String(tiCt.contents).split("\r").length;
        var isBox = false;
        try {
          isBox = tiCt.kind === TextType.PARAGRAPHTEXT;
        } catch (_eKd) {}
        if (!isBox) {
          var probeCt = null;
          try {
            probeCt = txL.duplicate();
            probeCt.textItem.contents = "H";
            var hb = bx(probeCt);
            var capTop = hb[1], baseline = hb[3];
            var leadCt;
            try {
              leadCt = tiCt.useAutoLeading ? tiCt.size.as("px") * (tiCt.autoLeadingAmount || 120) / 100 : tiCt.leading.as("px");
            } catch (_eLd) {
              leadCt = tiCt.size.as("px") * 1.2;
            }
            topCt = capTop;
            botCt = baseline + (linesCt - 1) * leadCt;
            usedCt = "capHeight";
          } catch (_ePr) {
            usedCt = "ink";
          } finally {
            if (probeCt) {
              try {
                probeCt.remove();
              } catch (_eRp) {}
            }
          }
        }
      }
      var dxCt = params.horizontal === false ? 0 : shCx - (tb[0] + tb[2]) / 2;
      var dyCt = params.vertical === false ? 0 : shCy - (topCt + botCt) / 2;
      dxCt += typeof params.offsetX === "number" ? params.offsetX : 0;
      dyCt += typeof params.offsetY === "number" ? params.offsetY : 0;
      txL.translate(UnitValue(dxCt, "px"), UnitValue(dyCt, "px"));
      var nb = bx(txL);
      return {
        document: docCt.name,
        text: txL.name,
        shape: shL.name,
        method: usedCt,
        moved: [Math.round(dxCt * 10) / 10, Math.round(dyCt * 10) / 10],
        spaceAbove: Math.round((topCt + dyCt - sb[1]) * 10) / 10,
        spaceBelow: Math.round((sb[3] - (botCt + dyCt)) * 10) / 10,
        spaceLeft: Math.round((nb[0] - sb[0]) * 10) / 10,
        spaceRight: Math.round((sb[2] - nb[2]) * 10) / 10
      };
    } finally {
      app.preferences.rulerUnits = prevUnitsCt;
    }
  }

  // 18/11/2026: the brand logo in a corner of the document (or of one artboard) with the house margin.
  if (action === "ps.logo.place") {
    var docLg = params.documentName ? app.documents.getByName(params.documentName) : __psRequireDoc();
    app.activeDocument = docLg;
    var lgFile = new File(params.filePath);
    if (!lgFile.exists) __mcpFail("FILE_NOT_FOUND", "Logo file not found: " + params.filePath);
    var prevUnitsLg = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;
    try {
      var area = { x: 0, y: 0, width: docLg.width.as("px"), height: docLg.height.as("px") };
      var abSet = null;
      if (params.artboard) {
        var absLg = __psArtboards(docLg), hitLg = null;
        for (var al = 0; al < absLg.length; al++) if (absLg[al].name === String(params.artboard)) hitLg = absLg[al];
        if (!hitLg) __mcpFail("NOT_FOUND", "No artboard named '" + params.artboard + "'.");
        area = hitLg.rect;
        abSet = __psFindLayerByName(docLg, hitLg.name);
      }
      var lgDesc = new ActionDescriptor();
      lgDesc.putPath(charIDToTypeID("null"), lgFile);
      executeAction(stringIDToTypeID("placeEvent"), lgDesc, DialogModes.NO);
      var lgL = docLg.activeLayer;
      lgL.name = params.name || "Logo";
      var b0 = lgL.bounds;
      var w0 = b0[2].as("px") - b0[0].as("px"), h0 = b0[3].as("px") - b0[1].as("px");
      var shortSide = Math.min(area.width, area.height);
      var wantW = typeof params.width === "number" ? params.width : area.width * (typeof params.widthFraction === "number" ? params.widthFraction : 0.18);
      var scLg = wantW / Math.max(w0, 1) * 100;
      if (typeof params.maxHeightFraction === "number" && h0 * scLg / 100 > area.height * params.maxHeightFraction) scLg = area.height * params.maxHeightFraction / Math.max(h0, 1) * 100;
      lgL.resize(scLg, scLg, AnchorPosition.MIDDLECENTER);
      var b1 = lgL.bounds;
      var w1 = b1[2].as("px") - b1[0].as("px"), h1 = b1[3].as("px") - b1[1].as("px");
      var mg = typeof params.margin === "number" ? params.margin : shortSide * (typeof params.marginFraction === "number" ? params.marginFraction : 0.06);
      var cornerLg = String(params.corner || "bottom-right");
      var tx = area.x + mg, ty = area.y + mg;
      if (cornerLg.indexOf("right") >= 0) tx = area.x + area.width - mg - w1;
      else if (cornerLg.indexOf("center") >= 0) tx = area.x + (area.width - w1) / 2;
      if (cornerLg.indexOf("bottom") >= 0) ty = area.y + area.height - mg - h1;
      else if (cornerLg.indexOf("middle") >= 0) ty = area.y + (area.height - h1) / 2;
      lgL.translate(UnitValue(tx - b1[0].as("px"), "px"), UnitValue(ty - b1[1].as("px"), "px"));
      if (typeof params.opacity === "number") lgL.opacity = params.opacity;
      var lgName = String(lgL.name), lgId = lgL.id;
      if (abSet) {
        // LAST step: after a move the reference is stale and the layer has a new id (see __psAddTextLayer)
        var inside = false;
        try {
          inside = lgL.parent === abSet || String(lgL.parent.name) === String(abSet.name);
        } catch (_ePar) {}
        if (!inside) {
          try {
            lgL.move(abSet, ElementPlacement.INSIDE);
            var topL = abSet.layers[0];
            if (String(topL.name) === lgName) lgId = topL.id;
          } catch (_eMvL) {}
        }
      }
      return { document: docLg.name, layer: lgName, id: lgId, corner: cornerLg, rect: { x: Math.round(tx), y: Math.round(ty), width: Math.round(w1), height: Math.round(h1) }, margin: Math.round(mg) };
    } finally {
      app.preferences.rulerUnits = prevUnitsLg;
    }
  }

  if (action === "ps.layer.blendIf") {
    var docBi = params.documentName ? app.documents.getByName(params.documentName) : __psRequireDoc();
    app.activeDocument = docBi;
    var cBi = charIDToTypeID;
    var layBi = __psFindLayerByName(docBi, params.layerName);
    if (!layBi) __mcpFail("LAYER_NOT_FOUND", "Layer not found: " + params.layerName);
    docBi.activeLayer = layBi;
    var ub = params.underlyingBlack || [0, 0], uw = params.underlyingWhite || [255, 255];
    var tb = params.thisBlack || [0, 0], tw = params.thisWhite || [255, 255];
    var dBi = new ActionDescriptor();
    var rBi = new ActionReference();
    rBi.putEnumerated(cBi("Lyr "), cBi("Ordn"), cBi("Trgt"));
    dBi.putReference(cBi("null"), rBi);
    var ldBi = new ActionDescriptor();
    var blBi = new ActionList();
    var brBi = new ActionDescriptor();
    var crBi = new ActionReference();
    crBi.putEnumerated(cBi("Chnl"), cBi("Chnl"), cBi("Gry "));
    brBi.putReference(cBi("Chnl"), crBi);
    brBi.putInteger(cBi("SrcB"), tb[0]);
    brBi.putInteger(cBi("Srcl"), tb[1]);
    brBi.putInteger(cBi("SrcW"), tw[0]);
    brBi.putInteger(cBi("Srcm"), tw[1]);
    brBi.putInteger(cBi("DstB"), ub[0]);
    brBi.putInteger(cBi("Dstl"), ub[1]);
    brBi.putInteger(cBi("DstW"), uw[0]);
    brBi.putInteger(cBi("Dstt"), uw[1]);
    blBi.putObject(cBi("Blnd"), brBi);
    ldBi.putList(cBi("Blnd"), blBi);
    dBi.putObject(cBi("T   "), cBi("Lyr "), ldBi);
    executeAction(cBi("setd"), dBi, DialogModes.NO);
    if (typeof params.opacity === "number") layBi.opacity = params.opacity;
    return { layer: String(layBi.name), underlyingBlack: ub, underlyingWhite: uw, thisBlack: tb, thisWhite: tw, opacity: layBi.opacity };
  }

  if (action === "ps.shape.create") {
    var docS = params.documentName ? app.documents.getByName(params.documentName) : __psRequireDoc();
    var prevS = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;
    try {
      var x = params.x, y = params.y;
      var LS = __psShapeLayer(docS, params.shape || "rounded", [x, y, x + params.width, y + params.height], params.radius, params.color || "#000000", params.name || "Forma");
      if (typeof params.opacity === "number") LS.opacity = params.opacity;
      return { layer: String(LS.name), kind: __psKindName(LS), shape: params.shape || "rounded", bounds: [x, y, x + params.width, y + params.height], radius: params.shape === "rounded" || !params.shape ? Math.min(params.radius || 0, params.width / 2, params.height / 2) : 0 };
    } finally {
      app.preferences.rulerUnits = prevS;
    }
  }

  if (action === "ps.template.socialPost") {
    // Social post template for ps_batch_variants: layers named like the CSV columns (Titulo, Apoio, CTA = text;
    // Foto, Logo = Smart Objects to replace; Botao, Fundo = brand colour). Saved as .psdt (a PSD opened as a copy).
    var Wt = params.width, Ht = params.height;
    var Ct = params.colors, Ft = params.fonts || {};
    var sf = params.safe || { top: 60, right: 60, bottom: 60, left: 60 };
    var prevUnitsT = app.preferences.rulerUnits;
    var prevTypeT = app.preferences.typeUnits;
    app.preferences.rulerUnits = Units.PIXELS;
    app.preferences.typeUnits = TypeUnits.PIXELS;
    var DT = null;
    var warnT = [];
    try {
      DT = app.documents.add(UnitValue(Wt, "px"), UnitValue(Ht, "px"), 72, params.name || "template", NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
      var firstT = DT.layers[0];
      var u = Math.min(Wt, Ht) / 1080;
      var photoH = Math.round(Ht * 0.58);
      __psSolidFillLayer(DT, Ct.fundo, "Fundo");
      var placeholder = function (name, rect, hex) {
        var L = DT.artLayers.add();
        L.name = name;
        DT.activeLayer = L;
        DT.selection.select([[rect[0], rect[1]], [rect[2], rect[1]], [rect[2], rect[3]], [rect[0], rect[3]]]);
        DT.selection.fill(__psMakeSolidColor(hex));
        DT.selection.deselect();
        var so = __psToSmartObject(DT, L);
        so.name = name;
        return so;
      };
      placeholder("Foto", [0, 0, Wt, photoH], Ct.superficie);
      var textBox = function (name, text, font, size, hex, rect) {
        var L = DT.artLayers.add();
        L.kind = LayerKind.TEXT;
        L.name = name;
        var ti = L.textItem;
        ti.kind = TextType.PARAGRAPHTEXT;
        ti.contents = text;
        try {
          ti.font = font;
        } catch (_eFt) {
          warnT.push("font not applied: " + font);
        }
        ti.size = UnitValue(size, "px");
        ti.color = __psMakeSolidColor(hex);
        ti.position = [UnitValue(rect[0], "px"), UnitValue(rect[1], "px")];
        ti.width = UnitValue(rect[2] - rect[0], "px");
        ti.height = UnitValue(rect[3] - rect[1], "px");
        return L;
      };
      var x0 = sf.left, x1 = Wt - sf.right;
      var y = photoH + Math.round(48 * u);
      var titleSize = Math.round(64 * u), supSize = Math.round(30 * u), ctaSize = Math.round(28 * u);
      textBox("Titulo", "T\u00EDtulo da pe\u00E7a em at\u00E9 duas linhas", Ft.titulo, titleSize, Ct.texto, [x0, y, x1, y + titleSize * 2.6]);
      y += Math.round(titleSize * 2.7);
      textBox("Apoio", "Frase de apoio com o benef\u00EDcio principal.", Ft.corpo, supSize, Ct.textoSecundario, [x0, y, x1, y + supSize * 2.8]);
      var btnH = Math.round(ctaSize * 2.6), btnW = Math.round((x1 - x0) * 0.55);
      var by0 = Ht - sf.bottom - btnH;
      // live rounded rectangle: size, corner radius and colour stay editable
      __psShapeLayer(DT, "rounded", [x0, by0, x0 + btnW, by0 + btnH], btnH / 2, Ct.destaque, "Botao");
      textBox("CTA", "Saiba mais", Ft.rotulo, ctaSize, Ct.fundo, [x0 + ctaSize, by0 + (btnH - ctaSize * 1.25) / 2 + ctaSize * 0.25, x0 + btnW - ctaSize, by0 + btnH]);
      var logoW = Math.round(180 * u), logoH = Math.round(70 * u);
      placeholder("Logo", [x1 - logoW, Ht - sf.bottom - logoH, x1, Ht - sf.bottom], Ct.textoSecundario);
      try {
        if (firstT && __psKindOf(firstT) === LayerKind.NORMAL) firstT.remove();
      } catch (_eFirst) {}
      var outT = String(params.outputPath).replace(/\.psdt?$/i, "");
      var psdF = __mcpPrepareOutputFile(outT + ".psd");
      DT.saveAs(psdF, new PhotoshopSaveOptions(), true, Extension.LOWERCASE);
      var tplF = new File(outT + ".psdt");
      if (tplF.exists) tplF.remove();
      new File(outT + ".psd").rename(tplF.name);
      var names = [];
      for (var li = 0; li < DT.layers.length; li++) names.push(String(DT.layers[li].name));
      return { file: tplF.fsName, width: Wt, height: Ht, layers: names, warnings: warnT };
    } finally {
      if (DT) {
        try {
          DT.close(SaveOptions.DONOTSAVECHANGES);
        } catch (_eCl) {}
      }
      app.preferences.rulerUnits = prevUnitsT;
      app.preferences.typeUnits = prevTypeT;
    }
  }

  if (action === "ps.recipe.removeBackground") {
    // Cut-out on a duplicate of the whole document (the original is not changed): one layer, converted to a
    // Smart Object, with Photoshop's Remove Background (or Select Subject) as an editable layer mask.
    var src0 = __psRecipeSource(params);
    var RB = src0.doc;
    var prevUnitsB = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;
    var warnB = [];
    try {
      var baseB = String(RB.name).replace(/\.[^.]+$/, "");
      var DB = RB.duplicate(baseB + "_recorte", false);
      app.activeDocument = DB;
      var LB = __psSingleLayer(DB);
      LB.name = "Recorte";
      if (params.smartObject !== false) LB = __psToSmartObject(DB, LB);
      var usedB = __psCutout(DB, LB, params.method);
      var sbB = __psMaskBounds(DB);
      if (!sbB) __mcpFail("NO_SUBJECT", "Photoshop found no subject to keep. Try method 'selectSubject', or cut out by hand with ps_selection_and_masks.");
      var WB = DB.width.as("px"), HB = DB.height.as("px");
      var covB = ((sbB[2] - sbB[0]) * (sbB[3] - sbB[1])) / (WB * HB);
      if (covB > 0.97) warnB.push("The subject box fills the whole image: the background may not have been removed. Check the preview.");
      if (covB < 0.02) warnB.push("The subject is tiny (" + Math.round(covB * 1000) / 10 + " % of the image): check that the right object was kept.");
      if (params.background) {
        var fillB = __psSolidFillLayer(DB, params.background, "Fundo");
        fillB.move(LB, ElementPlacement.PLACEAFTER);
      }
      if (params.cropToSubject) {
        var padB = typeof params.padding === "number" ? params.padding : 0;
        DB.crop([
          UnitValue(Math.max(0, sbB[0] - padB), "px"),
          UnitValue(Math.max(0, sbB[1] - padB), "px"),
          UnitValue(Math.min(WB, sbB[2] + padB), "px"),
          UnitValue(Math.min(HB, sbB[3] + padB), "px")
        ]);
      }
      var outB = __psRecipeWrite(DB, params, warnB, !params.background);
      var nameB = String(DB.name);
      var sizeB = [DB.width.as("px"), DB.height.as("px")];
      if (params.closeAfter === true && outB.file) {
        DB.close(SaveOptions.DONOTSAVECHANGES);
        return {
          document: null,
          source: RB.name,
          method: usedB,
          subject: { x: sbB[0], y: sbB[1], width: sbB[2] - sbB[0], height: sbB[3] - sbB[1] },
          coverage: Math.round(covB * 1000) / 1000,
          size: sizeB,
          background: params.background || "transparent",
          file: outB.file,
          psd: outB.psd,
          warnings: warnB
        };
      }
      return {
        document: DB.name,
        source: RB.name,
        method: usedB,
        subject: { x: sbB[0], y: sbB[1], width: sbB[2] - sbB[0], height: sbB[3] - sbB[1] },
        coverage: Math.round(covB * 1000) / 1000,
        size: [DB.width.as("px"), DB.height.as("px")],
        background: params.background || "transparent",
        file: outB.file,
        psd: outB.psd,
        warnings: warnB
      };
    } finally {
      app.preferences.rulerUnits = prevUnitsB;
      __psRecipeCloseSource(src0);
    }
  }

  if (action === "ps.recipe.popOut") {
    // "Out of bounds" / pop-out portrait on a duplicate of the document (the original is not changed):
    //   Shape        a circle (or ellipse / rectangle / rounded rectangle) behind the subject
    //   Subject      the cut-out, clipped to the shape: the shape crops the body
    //   Subject top  the same cut-out, not clipped, with its mask painted black below the cut line:
    //                only the part above the line shows, so the head and shoulders stick out of the shape
    // All three inside one group; everything stays editable (move the shape, repaint the masks).
    // inPlace (or a named layer): build it on that layer of the open document, e.g. the photo inside a layout in
    // progress; nothing else in the document is touched. Otherwise: on a duplicate of the whole document.
    var inPlaceO = params.inPlace === true || !!params.layerName || typeof params.layerId === "number";
    if (inPlaceO && params.filePath) __mcpFail("INVALID_PARAMS", "inPlace works on an open document: open the file first, or leave inPlace out to work on a duplicate.");
    var srcO = __psRecipeSource(params);
    var RO = srcO.doc;
    var prevUnitsO = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;
    var warnO = [];
    try {
      var baseO = String(RO.name).replace(/\.[^.]+$/, "");
      var DO, subjO;
      if (inPlaceO) {
        DO = RO;
        subjO = __psTargetLayer(DO, params);
        if (subjO.typename !== "ArtLayer") __mcpFail("INVALID_PARAMS", "The pop-out needs a photo layer, not a group. Name the layer with the person (layerName).");
        if (subjO.isBackgroundLayer) subjO.isBackgroundLayer = false;
      } else {
        DO = RO.duplicate(baseO + "_popout", false);
        app.activeDocument = DO;
        subjO = __psSingleLayer(DO);
        subjO.name = "Subject";
      }
      DO.activeLayer = subjO;
      // cutout: auto keeps a layer mask that is already there; "no" takes the layer as it is (transparent PNG).
      var cutModeO = params.cutout || "auto";
      var hadMaskO = __psHasUserMask();
      var usedO;
      if (cutModeO === "no" || (cutModeO === "auto" && hadMaskO)) usedO = hadMaskO ? "existingMask" : "none";
      else usedO = __psCutout(DO, subjO, params.method);
      var sbO = __psHasUserMask() ? __psMaskBounds(DO) : __psTransparencyBounds(DO);
      if (!sbO) __mcpFail("NO_SUBJECT", "Photoshop found no subject to keep. Try method 'selectSubject', or cut out by hand with ps_selection_and_masks.");
      var WO = DO.width.as("px"), HO = DO.height.as("px");
      var sW = sbO[2] - sbO[0], sH = sbO[3] - sbO[1];
      if ((sW * sH) / (WO * HO) > 0.97) warnO.push("The subject box fills the whole image: the background may not have been removed. Check the preview.");

      // Shape box: explicit, or derived from the subject (wider than the subject, its top below the subject's top).
      var kindO = params.shape || "circle";
      var overO = typeof params.overflow === "number" ? params.overflow : 0.22;
      var rectO;
      if (params.shapeBounds) {
        var sbp = params.shapeBounds;
        rectO = [sbp.x, sbp.y, sbp.x + sbp.width, sbp.y + sbp.height];
      } else {
        var scaleO = typeof params.shapeScale === "number" ? params.shapeScale : 1.5;
        var shW = Math.min(WO * 0.94, sW * scaleO);
        var shH = kindO === "circle" ? shW : Math.min(shW * (typeof params.shapeAspect === "number" ? params.shapeAspect : 1), HO);
        var cxO = (sbO[0] + sbO[2]) / 2;
        var leftO = Math.max(0, Math.min(WO - shW, cxO - shW / 2));
        var topO = sbO[1] + overO * shH;
        if (topO + shH > HO) topO = Math.max(0, HO - shH);
        rectO = [Math.round(leftO), Math.round(topO), Math.round(leftO + shW), Math.round(topO + shH)];
      }
      if (rectO[1] <= sbO[1]) warnO.push("The shape starts at or above the top of the subject: nothing sticks out. Lower the shape (shapeBounds) or raise overflow.");
      var cutO = typeof params.cutAt === "number" ? params.cutAt : 0.5;
      var cutY = Math.round(rectO[1] + (rectO[3] - rectO[1]) * cutO);

      var grpO = DO.layerSets.add();
      grpO.name = params.groupName || "Pop-out";
      if (inPlaceO) grpO.move(subjO, ElementPlacement.PLACEBEFORE); // keep the layer's place in the stack
      subjO.move(grpO, ElementPlacement.INSIDE);
      var psShapeO = "ellipse";
      if (kindO === "rectangle") psShapeO = "rectangle";
      else if (kindO === "roundedRectangle") psShapeO = "rounded";
      var shapeO = __psShapeLayer(DO, psShapeO, rectO, params.radius, params.shapeColor || "#C8783C", "Shape");
      shapeO.move(subjO, ElementPlacement.PLACEAFTER);
      subjO.grouped = true; // clipping mask: the subject shows only inside the shape

      var topLO = subjO.duplicate(subjO, ElementPlacement.PLACEBEFORE);
      topLO.name = inPlaceO ? String(subjO.name) + " top" : "Subject top";
      topLO.grouped = false;
      if (!subjO.grouped) subjO.grouped = true;
      DO.activeLayer = topLO;
      if (cutY < HO) {
        if (!__psHasUserMask()) {
          var mkAll = new ActionDescriptor();
          mkAll.putClass(charIDToTypeID("Nw  "), charIDToTypeID("Chnl"));
          var mkAllRef = new ActionReference();
          mkAllRef.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("Msk "));
          mkAll.putReference(charIDToTypeID("At  "), mkAllRef);
          mkAll.putEnumerated(charIDToTypeID("Usng"), charIDToTypeID("UsrM"), charIDToTypeID("RvlA"));
          executeAction(charIDToTypeID("Mk  "), mkAll, DialogModes.NO);
        }
        var selMk = new ActionDescriptor();
        var refMk = new ActionReference();
        refMk.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("Msk "));
        selMk.putReference(charIDToTypeID("null"), refMk);
        selMk.putBoolean(charIDToTypeID("MkVs"), false);
        executeAction(charIDToTypeID("slct"), selMk, DialogModes.NO);
        DO.selection.select([[0, cutY], [WO, cutY], [WO, HO], [0, HO]]);
        DO.selection.fill(__psMakeSolidColor("#000000"));
        DO.selection.deselect();
        var selRgb = new ActionDescriptor();
        var refRgb = new ActionReference();
        refRgb.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("RGB "));
        selRgb.putReference(charIDToTypeID("null"), refRgb);
        executeAction(charIDToTypeID("slct"), selRgb, DialogModes.NO);
      }
      if (params.keepBackground === true) {
        // The clipped layer loses its mask: the original photo, background included, shows inside the shape.
        DO.activeLayer = subjO;
        if (__psHasUserMask()) {
          var delMk = new ActionDescriptor();
          var delRef = new ActionReference();
          delRef.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("Msk "));
          delMk.putReference(charIDToTypeID("null"), delRef);
          executeAction(charIDToTypeID("Dlt "), delMk, DialogModes.NO);
        } else {
          warnO.push("keepBackground: the layer has no mask, so there is no separate background to keep.");
        }
      }
      if (params.background) {
        var fillO = __psSolidFillLayer(DO, params.background, "Background");
        fillO.move(grpO, ElementPlacement.PLACEAFTER);
      }
      var outO = __psRecipeWrite(DO, params, warnO, !params.background);
      return {
        document: DO.name,
        source: RO.name,
        method: usedO,
        group: grpO.name,
        inPlace: inPlaceO,
        keepBackground: params.keepBackground === true,
        layers: [String(topLO.name), String(subjO.name), "Shape"],
        subject: { x: sbO[0], y: sbO[1], width: sW, height: sH },
        shape: { kind: kindO, x: rectO[0], y: rectO[1], width: rectO[2] - rectO[0], height: rectO[3] - rectO[1] },
        cutY: cutY,
        clipped: subjO.grouped,
        size: [WO, HO],
        file: outO.file,
        psd: outO.psd,
        warnings: warnO
      };
    } finally {
      app.preferences.rulerUnits = prevUnitsO;
      __psRecipeCloseSource(srcO);
    }
  }

  if (action === "ps.recipe.productShot") {
    // Product photo -> cut-out (unless the file already has transparency) -> new document in the format with a
    // solid or radial-gradient background, the product as a Smart Object fitted inside the safe area, and a
    // soft contact shadow. Every part stays editable; the source file is not changed.
    var src1 = __psRecipeSource(params);
    var RP = src1.doc;
    var prevUnitsP = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;
    var warnP = [];
    var CP = null;
    try {
      var baseP = String(RP.name).replace(/\.[^.]+$/, "");
      CP = RP.duplicate(baseP + "_mcp_tmp", false);
      app.activeDocument = CP;
      var LP = __psSingleLayer(CP);
      var cutMode = params.cutout || "auto";
      var hadAlpha = __psHasTransparency(CP);
      var cutUsed = "none";
      if (cutMode === "yes" || (cutMode === "auto" && !hadAlpha)) cutUsed = __psCutout(CP, LP, params.method);
      var sbP = cutUsed === "none" ? __psTransparencyBounds(CP) : __psMaskBounds(CP);
      if (!sbP) __mcpFail("NO_SUBJECT", "No product found in the image (empty cut-out). Try method 'selectSubject' or cutout 'no' with a ready PNG.");
      CP.crop([UnitValue(sbP[0], "px"), UnitValue(sbP[1], "px"), UnitValue(sbP[2], "px"), UnitValue(sbP[3], "px")]);
      var srcW = sbP[2] - sbP[0], srcH = sbP[3] - sbP[1];
      LP = __psToSmartObject(CP, CP.layers[0]);
      LP.name = "Produto";
      var W = params.width, H = params.height;
      var P = app.documents.add(UnitValue(W, "px"), UnitValue(H, "px"), 72, params.documentTitle || baseP + "_produto", NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
      app.activeDocument = CP;
      var prodP = LP.duplicate(P, ElementPlacement.PLACEATBEGINNING);
      CP.close(SaveOptions.DONOTSAVECHANGES);
      CP = null;
      app.activeDocument = P;
      var bgL;
      if (params.backgroundStyle === "gradient") bgL = __psGradientFillLayer(P, "Fundo", params.backgroundCenter, params.background, "radial");
      else bgL = __psSolidFillLayer(P, params.background || "#F2F2F2", "Fundo");
      bgL.move(P.layers[P.layers.length - 1], ElementPlacement.PLACEAFTER);
      // remove the empty transparent layer the new document starts with
      for (var el = P.layers.length - 1; el >= 0; el--) {
        var cand = P.layers[el];
        if (cand.typename === "ArtLayer" && __psKindOf(cand) === LayerKind.NORMAL && cand.name !== "Produto" && cand.name !== "Sombra") {
          try {
            var cb = cand.bounds;
            if (cb[2].as("px") - cb[0].as("px") <= 0) cand.remove();
          } catch (_eEmpty) {}
        }
      }
      var safe = params.safe || { top: 0, right: 0, bottom: 0, left: 0 };
      var boxW = W - safe.left - safe.right, boxH = H - safe.top - safe.bottom;
      var fillK = typeof params.fill === "number" ? params.fill : 0.72;
      var k = Math.min((boxW * fillK) / srcW, (boxH * fillK) / srcH);
      if (k > 1.02) warnP.push("UPSCALED: the product is enlarged " + Math.round(k * 100) + " %: use a larger photo for print or zoom.");
      prodP.resize(k * 100, k * 100, AnchorPosition.MIDDLECENTER);
      var pb = prodP.bounds;
      var pw = pb[2].as("px") - pb[0].as("px"), ph = pb[3].as("px") - pb[1].as("px");
      var tx = safe.left + (boxW - pw) / 2;
      var ty = params.anchor === "center" ? safe.top + (boxH - ph) / 2 : safe.top + boxH * 0.88 - ph;
      if (ty < safe.top) ty = safe.top;
      prodP.translate(tx - pb[0].as("px"), ty - pb[1].as("px"));
      var shadow = null;
      if (params.shadow !== "none") {
        var cx = tx + pw / 2, by = ty + ph;
        var sw = pw * 0.86, sh = Math.max(6, pw * 0.07);
        shadow = P.artLayers.add();
        shadow.name = "Sombra";
        shadow.move(prodP, ElementPlacement.PLACEAFTER);
        P.activeLayer = shadow;
        __psEllipseSelect(by - sh / 2, cx - sw / 2, by + sh / 2, cx + sw / 2);
        P.selection.fill(__psMakeSolidColor(params.shadowColor || "#000000"));
        P.selection.deselect();
        shadow.applyGaussianBlur(Math.max(2, sh * 0.55));
        shadow.blendMode = BlendMode.MULTIPLY;
        shadow.opacity = typeof params.shadowOpacity === "number" ? params.shadowOpacity : 45;
      }
      P.activeLayer = prodP;
      var outP = __psRecipeWrite(P, params, warnP, false);
      return {
        document: P.name,
        source: RP.name,
        cutout: cutUsed,
        sourceHadTransparency: hadAlpha,
        size: [W, H],
        product: { x: Math.round(tx), y: Math.round(ty), width: Math.round(pw), height: Math.round(ph), scale: Math.round(k * 1000) / 10 },
        background: params.backgroundStyle === "gradient" ? "gradient " + params.backgroundCenter + " -> " + params.background : params.background || "#F2F2F2",
        shadow: !!shadow,
        layers: ["Produto", shadow ? "Sombra" : null, "Fundo"],
        file: outP.file,
        psd: outP.psd,
        warnings: warnP
      };
    } finally {
      if (CP) {
        try {
          CP.close(SaveOptions.DONOTSAVECHANGES);
        } catch (_eCp) {}
      }
      app.preferences.rulerUnits = prevUnitsP;
      __psRecipeCloseSource(src1);
    }
  }

  if (action === "ps.recipe.socialSet") {
    // Key art → one new document with an artboard per format. Layers that fill the canvas (background, photo)
    // are scaled to cover each artboard; the others (titles, logo, CTA) keep the edge or centre they sat on,
    // scale with the format and are pulled inside its safe zone. The key art is not changed.
    var S = params.documentName ? app.documents.getByName(params.documentName) : __psRequireDoc();
    app.activeDocument = S;
    // Optional step log (diagnosis: the line before a crash shows the step that brought the app down).
    var logF = params.logPath ? new File(params.logPath) : null;
    var step = function (msg) {
      if (!logF) return;
      logF.encoding = "UTF-8";
      logF.open("a");
      logF.writeln(new Date().getTime() + " " + msg);
      logF.close();
    };
    step("start " + S.name);
    var prevPlayback = __psSetPlayback("accelerated");
    var prevUnitsR = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;
    try {
      var W0 = S.width.as("px"), H0 = S.height.as("px");
      var fmts = params.formats || [];
      if (!fmts.length) __mcpFail("INVALID_PARAMS", "No formats.");
      var gap = params.gap || 120;
      var totalW = 0, maxH = 0;
      for (var fi = 0; fi < fmts.length; fi++) {
        totalW += fmts[fi].width + (fi ? gap : 0);
        maxH = Math.max(maxH, fmts[fi].height);
      }
      var baseName = String(S.name).replace(/\.[^.]+$/, "");
      // Variants rule (16/11/2026): duplicate the whole document / group once and adapt it. Copying layer by
      // layer between documents cost 1–2.5 s per layer (3+ min for two formats of a 19-layer key art).
      step("duplicate document");
      var D = S.duplicate(baseName + "_social", false);
      app.activeDocument = D;
      try {
        if (D.layers[D.layers.length - 1].isBackgroundLayer) D.layers[D.layers.length - 1].isBackgroundLayer = false;
      } catch (_eBg) {}
      step("group key art");
      var src = __psGroupAllLayers(D, "MCP origem");
      if (D.layers.length !== 1 || D.layers[0].typename !== "LayerSet") __mcpFail("INTERNAL", "Could not group the key art layers (" + D.layers.length + " left at the top level).");
      D.resizeCanvas(UnitValue(totalW, "px"), UnitValue(maxH, "px"), AnchorPosition.TOPLEFT);
      var boards = [];
      var xo = 0;
      for (var fb = 0; fb < fmts.length; fb++) {
        var rect = { x: xo, y: 0, width: fmts[fb].width, height: fmts[fb].height };
        step("artboard " + fmts[fb].name);
        var abSet = __psMakeArtboard(D, fmts[fb].name, rect);
        boards.push({ set: abSet, rect: rect, f: fmts[fb] });
        xo += fmts[fb].width + gap;
      }
      var coverRe = /^(fundo|background|plano de fundo|hintergrund|bg|foto|photo|imagem|image|bild)/i;
      var report = [];
      for (var bi = 0; bi < boards.length; bi++) {
        var A = boards[bi];
        var Aw = A.rect.width, Ah = A.rect.height, Ax = A.rect.x, Ay = A.rect.y;
        var safe = A.f.safe || { top: 0, right: 0, bottom: 0, left: 0 };
        var sOverlay = Math.min(Aw / W0, Ah / H0) * (params.overlayScale || 1);
        var kCover = Math.max(Aw / W0, Ah / H0);
        var placed = [];
        // Pass 1: one copy of the whole key art group into the artboard (same document: fast), then pair each
        // copied layer with its key-art layer (same order) to read the original geometry.
        var items = [];
        step(A.f.name + " duplicate group");
        // DOM refuses to duplicate or move a group INSIDE another group/artboard ("Illegal Argument"), but a
        // group can be placed BEFORE a layer that is already inside: use a temporary layer as the anchor.
        var g = src.duplicate();
        var anchorL = A.set.artLayers.add();
        g.move(anchorL, ElementPlacement.PLACEBEFORE);
        try {
          anchorL.remove();
        } catch (_eAnc) {}
        g.name = "Arte";
        var srcLayers = [];
        for (var sl = 0; sl < S.layers.length; sl++) srcLayers.push(S.layers[sl]);
        var gLayers = [];
        for (var gl = 0; gl < g.layers.length; gl++) gLayers.push(g.layers[gl]);
        if (gLayers.length !== srcLayers.length) __mcpFail("INTERNAL", "Copied group has " + gLayers.length + " layers, key art has " + srcLayers.length + ".");
        // pair by name, preferring the same position (a fallback move may have changed the order of hidden layers)
        var taken = [];
        var pairOf = function (idx) {
          var nm = String(srcLayers[idx].name);
          if (!taken[idx] && String(gLayers[idx].name) === nm) {
            taken[idx] = true;
            return gLayers[idx];
          }
          for (var q = 0; q < gLayers.length; q++) {
            if (!taken[q] && String(gLayers[q].name) === nm) {
              taken[q] = true;
              return gLayers[q];
            }
          }
          return null;
        };
        var unused = [];
        for (var li = srcLayers.length - 1; li >= 0; li--) {
          var L = srcLayers[li];
          var dupL = pairOf(li);
          if (!dupL) continue;
          var lb;
          try {
            lb = [L.bounds[0].as("px"), L.bounds[1].as("px"), L.bounds[2].as("px"), L.bounds[3].as("px")];
          } catch (_eB) {
            unused.push(dupL);
            continue;
          }
          var bw = lb[2] - lb[0], bh = lb[3] - lb[1];
          var noGeometry = false;
          if (L.typename === "ArtLayer") {
            var kd = __psKindOf(L);
            noGeometry = kd !== LayerKind.NORMAL && kd !== LayerKind.TEXT && kd !== LayerKind.SMARTOBJECT;
          } else if (!__psGroupHasPixels(L)) {
            // 19/11/2026: a group made only of adjustment / fill layers (ps_recolor_object) has nothing to
            // transform: resize stopped the whole recipe with "initial bounding rectangle is empty".
            noGeometry = true;
          }
          if (!noGeometry && (bw <= 0 || bh <= 0)) {
            unused.push(dupL);
            continue;
          }
          var isCover = !noGeometry && (L.isBackgroundLayer || bw * bh >= 0.85 * W0 * H0 || coverRe.test(String(L.name)));
          items.push({ dup: dupL, name: String(L.name), lb: lb, cover: isCover, fill: noGeometry });
        }
        for (var un = 0; un < unused.length; un++) {
          try {
            unused[un].remove();
          } catch (_eUn) {}
        }
        step(A.f.name + " paired " + items.length + " layers");
        // Focal point: the upper third of a cut-out subject layer (face, product top), else the canvas centre.
        // It keeps the same relative place in the artboard, as far as the cover still fills the artboard.
        var fx = W0 / 2, fy = H0 / 2;
        if (params.focus && typeof params.focus.x === "number") {
          fx = params.focus.x * W0;
          fy = params.focus.y * H0;
        } else {
          for (var fq = 0; fq < items.length; fq++) {
            if (/motiv|sujeito|subject|pessoa|person|produto|product|modelo|model/i.test(items[fq].name)) {
              fx = (items[fq].lb[0] + items[fq].lb[2]) / 2;
              fy = items[fq].lb[1] + (items[fq].lb[3] - items[fq].lb[1]) * 0.3;
              break;
            }
          }
        }
        var coverOx = Aw * (fx / W0) - fx * kCover;
        var coverOy = Ah * (fy / H0) - fy * kCover;
        coverOx = Math.min(0, Math.max(Aw - W0 * kCover, coverOx));
        coverOy = Math.min(0, Math.max(Ah - H0 * kCover, coverOy));
        // Pass 2: covers fill the artboard; the other layers move as blocks (top / middle / bottom), so the
        // distances between title, number, text and CTA stay as designed and only the block meets the safe zone.
        var blocks = { top: [], middle: [], bottom: [] };
        for (var ii = 0; ii < items.length; ii++) {
          var it = items[ii];
          if (it.fill) {
            placed.push({ name: it.name, role: "fill", scale: 100, upscaledPixels: false });
            continue;
          }
          if (it.cover) {
            // All covers move together (same canvas mapping), so photo and cut-out subject stay aligned.
            it.k = kCover;
            it.tl = Ax + coverOx + it.lb[0] * kCover;
            it.tt = Ay + coverOy + it.lb[1] * kCover;
            continue;
          }
          var cy0 = (it.lb[1] + it.lb[3]) / 2;
          blocks[cy0 < H0 / 3 ? "top" : (cy0 > (2 * H0) / 3 ? "bottom" : "middle")].push(it);
        }
        var safeW = Aw - safe.left - safe.right, safeH = Ah - safe.top - safe.bottom;
        for (var bk in blocks) {
          if (!blocks.hasOwnProperty(bk) || !blocks[bk].length) continue;
          var grp = blocks[bk];
          var BB = [1e9, 1e9, -1e9, -1e9];
          for (var gi = 0; gi < grp.length; gi++) {
            BB[0] = Math.min(BB[0], grp[gi].lb[0]);
            BB[1] = Math.min(BB[1], grp[gi].lb[1]);
            BB[2] = Math.max(BB[2], grp[gi].lb[2]);
            BB[3] = Math.max(BB[3], grp[gi].lb[3]);
          }
          var gw = BB[2] - BB[0], gh = BB[3] - BB[1];
          var kb = sOverlay;
          if (gw * kb > safeW) kb = safeW / gw;
          if (gh * kb > safeH / (bk === "middle" ? 1 : 2)) kb = Math.min(kb, safeH / (bk === "middle" ? 1 : 2) / gh);
          var gcx = (BB[0] + BB[2]) / 2;
          var bl;
          if (gcx < W0 / 3) bl = Ax + Math.max(safe.left, BB[0] * kb);
          else if (gcx > (2 * W0) / 3) bl = Ax + Aw - Math.max(safe.right, (W0 - BB[2]) * kb) - gw * kb;
          else bl = Ax + Aw / 2 + (gcx - W0 / 2) * kb - (gw * kb) / 2;
          var bt;
          if (bk === "top") bt = Ay + Math.max(safe.top, BB[1] * kb);
          else if (bk === "bottom") bt = Ay + Ah - Math.max(safe.bottom, (H0 - BB[3]) * kb) - gh * kb;
          else bt = Ay + Ah / 2 + ((BB[1] + BB[3]) / 2 - H0 / 2) * kb - (gh * kb) / 2;
          bl = Math.min(Math.max(bl, Ax + safe.left), Ax + Aw - safe.right - gw * kb);
          bt = Math.min(Math.max(bt, Ay + safe.top), Ay + Ah - safe.bottom - gh * kb);
          for (var gj = 0; gj < grp.length; gj++) {
            grp[gj].k = kb;
            grp[gj].tl = bl + (grp[gj].lb[0] - BB[0]) * kb;
            grp[gj].tt = bt + (grp[gj].lb[1] - BB[1]) * kb;
            grp[gj].block = bk;
          }
        }
        for (var pj = 0; pj < items.length; pj++) {
          var P = items[pj];
          if (P.fill) continue;
          step(A.f.name + " place " + P.name + " " + Math.round(P.k * 1000) / 10 + "%");
          try {
            if (Math.abs(P.k - 1) > 0.001) P.dup.resize(P.k * 100, P.k * 100, AnchorPosition.TOPLEFT);
            var db = P.dup.bounds;
            P.dup.translate(P.tl - db[0].as("px"), P.tt - db[1].as("px"));
          } catch (ePlace) {
            // One layer that cannot be transformed must not lose the whole set: report it and go on.
            placed.push({ name: P.name, role: "not-placed", scale: 100, upscaledPixels: false, warning: String(ePlace.message || ePlace).substring(0, 160) });
            continue;
          }
          var pixelUp = P.k > 1.02 && P.dup.typename === "ArtLayer" && __psKindOf(P.dup) === LayerKind.NORMAL;
          placed.push({ name: P.name, role: P.cover ? "cover" : "overlay-" + P.block, scale: Math.round(P.k * 1000) / 10, upscaledPixels: pixelUp });
        }
        step(A.f.name + " audit");
        // audit data, relative to the artboard
        var layersAu = [];
        __psAuditWalk(D, A.set, layersAu, 0, A.f.name);
        // Photoshop 2027 puts the key art group inside the first artboard it makes, even with no layer selected
        // (live 21/11/2026). That group is removed before export: keep it out of the audit, or the original,
        // unscaled title is reported outside the safe zone.
        var srcPath = A.f.name + " / " + String(src.name);
        var keptAu = [];
        for (var ka = 0; ka < layersAu.length; ka++) {
          var kp = layersAu[ka].path;
          if (kp !== srcPath && kp.indexOf(srcPath + " / ") !== 0) keptAu.push(layersAu[ka]);
        }
        layersAu = keptAu;
        var sampled = 0;
        for (var la = 0; la < layersAu.length; la++) {
          var rec = layersAu[la];
          if (rec.bounds) rec.bounds = [rec.bounds[0] - Ax, rec.bounds[1] - Ay, rec.bounds[2] - Ax, rec.bounds[3] - Ay];
          if (!rec.text || !rec.visible || !rec.bounds || sampled >= 8 || params.sampleBackground === false) continue;
          var x0 = Math.max(0, rec.bounds[0]) + Ax, y0 = Math.max(0, rec.bounds[1]) + Ay;
          var x1 = Math.min(Aw - 1, rec.bounds[2]) + Ax, y1 = Math.min(Ah - 1, rec.bounds[3]) + Ay;
          if (x1 <= x0 || y1 <= y0) continue;
          var lyr = __psFindLayer(D, rec.id, null);
          if (!lyr) continue;
          lyr.visible = false;
          var pts = [[0.5, 0.5], [0.15, 0.3], [0.85, 0.3], [0.15, 0.75], [0.85, 0.75]];
          var smp = [];
          try {
            for (var sp = 0; sp < pts.length; sp++) {
              var c = __psSample(D, x0 + (x1 - x0) * pts[sp][0], y0 + (y1 - y0) * pts[sp][1]);
              if (c) smp.push(c);
            }
          } finally {
            lyr.visible = true;
          }
          rec.text.background = smp;
          sampled++;
        }
        report.push({ name: A.f.name, format: A.f.key, rect: A.rect, layers: layersAu, placed: placed });
      }
      try {
        src.remove();
      } catch (_eSrc) {}
      step("done");
      return { document: D.name, source: S.name, sourceSize: [W0, H0], artboards: report };
    } finally {
      app.preferences.rulerUnits = prevUnitsR;
      __psSetPlayback(prevPlayback);
    }
  }

  if (action === "ps.action.play") {
    app.doAction(String(params.actionName), String(params.setName));
    return { played: true, setName: params.setName, actionName: params.actionName };
  }

  if (action === "ps.raw.executeExtendScript") {
    var r = __mcpEvalUserCode(params.code);
    return {
      executed: true,
      result: typeof r === "undefined" ? null : r
    };
  }

  if (action === "adobe.inspectDom") {
    return __mcpInspectDomObject(params.targetExpression || "app", params.maxProperties || 150);
  }

  __mcpUnsupported("Action '" + action + "' requires the Photoshop UXP plugin bridge or ps_execute_extendscript.");
}

/**
 * Entry point. Every action runs with pixel ruler units and with dialogs suppressed, so numeric
 * params always mean pixels and Photoshop never blocks waiting for a click; both are restored afterwards.
 */
/**
 * Playback Options "performance" (accelerated | stepByStep | pause): accelerated skips the redraw between script
 * steps. Returns the previous value so it can be restored; null if it could not be read.
 */
function __psSetPlayback(mode) {
  if (!mode) return null;
  var prev = null;
  try {
    var r = new ActionReference();
    r.putProperty(charIDToTypeID("Prpr"), charIDToTypeID("PbkO"));
    r.putEnumerated(charIDToTypeID("capp"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
    var cur = executeActionGet(r).getObjectValue(charIDToTypeID("PbkO"));
    prev = typeIDToStringID(cur.getEnumerationValue(stringIDToTypeID("performance")));
  } catch (_eG) {}
  try {
    var d = new ActionDescriptor();
    var ref = new ActionReference();
    ref.putProperty(charIDToTypeID("Prpr"), charIDToTypeID("PbkO"));
    ref.putEnumerated(charIDToTypeID("capp"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
    d.putReference(charIDToTypeID("null"), ref);
    var o = new ActionDescriptor();
    o.putEnumerated(stringIDToTypeID("performance"), stringIDToTypeID("performance"), stringIDToTypeID(mode));
    d.putObject(charIDToTypeID("T   "), charIDToTypeID("PbkO"), o);
    executeAction(charIDToTypeID("setd"), d, DialogModes.NO);
  } catch (_eS) {}
  return prev;
}

function __mcpDispatch(action, params, options) {
  var prevUnits = null;
  var prevDialogs = null;
  try {
    prevUnits = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;
  } catch (_eU) {
    prevUnits = null;
  }
  try {
    prevDialogs = app.displayDialogs;
    app.displayDialogs = DialogModes.NO;
  } catch (_eD) {
    prevDialogs = null;
  }
  try {
    return __psDispatch(action, params, options);
  } finally {
    try {
      if (prevUnits !== null) app.preferences.rulerUnits = prevUnits;
      if (prevDialogs !== null) app.displayDialogs = prevDialogs;
    } catch (_eR) {}
  }
}
