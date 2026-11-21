/*
 * ae-handlers.jsx
 * Pure ECMAScript 3 ExtendScript handlers for Adobe After Effects (CEP + CLI Fallback).
 * Provides structured operations AND 100% DOM access via ae.raw.executeExtendScript / ae.anim.getPropertyTree.
 */

function __aeCountTextAnimators(layer) {
  try {
    var tp = layer.property("ADBE Text Properties");
    var an = tp ? tp.property("ADBE Text Animators") : null;
    return an ? an.numProperties : 0;
  } catch (_e) {
    return 0;
  }
}

/** Number of keyframed properties under a property group (to report what a preset animated). */
function __aeCountKeyed(group, depth) {
  var n = 0;
  if (!group || depth > 8 || typeof group.numProperties === "undefined") return 0;
  for (var i = 1; i <= group.numProperties; i++) {
    var pr;
    try { pr = group.property(i); } catch (_e) { continue; }
    if (!pr) continue;
    if (pr.propertyType === PropertyType.PROPERTY) {
      if (pr.numKeys > 0) n++;
    } else {
      n += __aeCountKeyed(pr, depth + 1);
    }
  }
  return n;
}

function __aeFindComp(compName, compIndex) {
  if (!app.project) {
    throw new Error("No After Effects project is open.");
  }
  if (typeof compIndex === "number" && compIndex >= 1 && compIndex <= app.project.numItems) {
    var byIdx = app.project.item(compIndex);
    if (byIdx instanceof CompItem) {
      return byIdx;
    }
  }
  if (compName) {
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if ((it instanceof CompItem) && it.name === compName) {
        return it;
      }
    }
  }
  var active = app.project.activeItem;
  if (active && (active instanceof CompItem)) {
    return active;
  }
  for (var j = 1; j <= app.project.numItems; j++) {
    var firstComp = app.project.item(j);
    if (firstComp instanceof CompItem) {
      return firstComp;
    }
  }
  throw new Error("Composition not found (compName=" + String(compName || "") + ", compIndex=" + String(compIndex || "") + ").");
}

function __aeFindLayer(comp, layerIndex, layerName) {
  if (typeof layerIndex === "number" && layerIndex >= 1 && layerIndex <= comp.numLayers) {
    return comp.layer(layerIndex);
  }
  if (layerName) {
    for (var i = 1; i <= comp.numLayers; i++) {
      if (comp.layer(i).name === layerName) {
        return comp.layer(i);
      }
    }
  }
  throw new Error("Layer not found in composition '" + comp.name + "' (layerIndex=" + String(layerIndex || "") + ", layerName=" + String(layerName || "") + ").");
}

function __aeResolveProperty(rootGroup, propertyPath) {
  if (!propertyPath || !(propertyPath instanceof Array) || propertyPath.length === 0) {
    throw new Error("propertyPath must be a non-empty array of matchNames, names, or 1-based indices.");
  }
  var current = rootGroup;
  for (var i = 0; i < propertyPath.length; i++) {
    var seg = propertyPath[i];
    if (!current || typeof current.property !== "function") {
      throw new Error("Cannot traverse property segment '" + String(seg) + "' at index " + i);
    }
    var nextProp = current.property(seg);
    if (!nextProp && typeof seg === "string") {
      // Friendly aliases for Transform properties
      var aliases = {
        "Position": "ADBE Position",
        "Scale": "ADBE Scale",
        "Rotation": "ADBE Rotate Z",
        "Opacity": "ADBE Opacity",
        "Anchor Point": "ADBE Anchor Point",
        "Transform": "ADBE Transform Group",
        "Effects": "ADBE Effect Parade",
        "Masks": "ADBE Mask Parade",
        "Text": "ADBE Text Properties",
        "Source Text": "ADBE Text Document",
        "Contents": "ADBE Root Vectors Group"
      };
      if (aliases[seg]) {
        nextProp = current.property(aliases[seg]);
      }
      if (!nextProp && i === 0 && current.property("ADBE Transform Group")) {
        nextProp = current.property("ADBE Transform Group").property(aliases[seg] || seg);
      }
    }
    if (!nextProp) {
      throw new Error("Property '" + String(seg) + "' not found at path index " + i);
    }
    current = nextProp;
  }
  return current;
}

function __aeSerializePropertyValue(prop) {
  try {
    if (!prop || typeof prop.value === "undefined") {
      return null;
    }
    var v = prop.value;
    if (v && v.typename === "TextDocument") {
      return {
        text: String(v.text || ""),
        font: String(v.font || ""),
        fontSize: v.fontSize || 0,
        fillColor: v.applyFill ? v.fillColor : null
      };
    }
    if (v && v.typename === "Shape") {
      return {
        closed: Boolean(v.closed),
        numVertices: v.vertices ? v.vertices.length : 0,
        vertices: v.vertices
      };
    }
    if (v instanceof Array || typeof v === "number" || typeof v === "boolean" || typeof v === "string") {
      return v;
    }
    return String(v);
  } catch (_e) {
    return null;
  }
}

function __aeWalkPropertyTree(group, currentPath, depth, maxDepth) {
  var node = {
    name: String(group.name || ""),
    matchName: String(group.matchName || ""),
    propertyIndex: group.propertyIndex || 0,
    path: currentPath,
    numProperties: group.numProperties || 0
  };

  if (typeof group.numKeys === "number") {
    node.numKeys = group.numKeys;
    node.value = __aeSerializePropertyValue(group);
    if (group.canSetExpression) {
      node.expression = group.expression || "";
      node.expressionEnabled = Boolean(group.expressionEnabled);
      node.expressionError = group.expressionError || "";
    }
  }

  if (group.numProperties && depth < maxDepth) {
    node.children = [];
    for (var i = 1; i <= group.numProperties; i++) {
      var child = group.property(i);
      if (child) {
        var childSeg = child.matchName || child.name || i;
        var nextPath = currentPath.slice(0);
        nextPath.push(childSeg);
        node.children.push(__aeWalkPropertyTree(child, nextPath, depth + 1, maxDepth));
      }
    }
  }

  return node;
}

function __aeEnumName(enumObj, value) {
  try {
    for (var k in enumObj) {
      if (enumObj[k] === value) {
        return k;
      }
    }
  } catch (_e) {}
  return String(value);
}

function __aeLayerId(layer) {
  try {
    return typeof layer.id === "number" ? layer.id : null;
  } catch (_e) {
    return null;
  }
}

function __aeFindChildProperty(group, key) {
  var direct = null;
  try {
    direct = group.property(key);
  } catch (_e) {
    direct = null;
  }
  if (direct) {
    return direct;
  }
  var lower = String(key).toLowerCase();
  for (var i = 1; i <= group.numProperties; i++) {
    var child = group.property(i);
    if (child && (String(child.name).toLowerCase() === lower || String(child.matchName).toLowerCase() === lower)) {
      return child;
    }
  }
  return null;
}

/** Sets a nested property if value is defined; failures become warnings instead of aborting. */
function __aeTrySet(group, path, value, warnings) {
  if (typeof value === "undefined" || value === null) {
    return;
  }
  try {
    var p = group;
    for (var i = 0; i < path.length; i++) {
      p = p.property(path[i]);
      if (!p) {
        throw new Error("property not found");
      }
    }
    p.setValue(value);
  } catch (e) {
    warnings.push(path.join(" > ") + ": " + String(e.message || e));
  }
}

function __aeEffectCatalog() {
  var list = [];
  var effects = app.effects;
  for (var i = 0; i < effects.length; i++) {
    var e = effects[i];
    list.push({
      displayName: String(e.displayName),
      matchName: String(e.matchName),
      category: String(e.category || ""),
      version: String(e.version || "")
    });
  }
  return list;
}

/** Accepts a matchName or a display name (any letter case) and returns an applicable matchName. */
function __aeResolveEffectMatchName(parade, nameOrMatch) {
  var wanted = String(nameOrMatch || "");
  if (wanted && parade.canAddProperty(wanted)) {
    return wanted;
  }
  var lower = wanted.toLowerCase();
  var effects = app.effects;
  for (var i = 0; i < effects.length; i++) {
    if (String(effects[i].displayName).toLowerCase() === lower || String(effects[i].matchName).toLowerCase() === lower) {
      if (parade.canAddProperty(String(effects[i].matchName))) {
        return String(effects[i].matchName);
      }
    }
  }
  var err = new Error("Effect '" + wanted + "' is not installed or cannot be applied to this layer. Use ae_list_effects to find the matchName.");
  err.name = "EFFECT_NOT_FOUND";
  throw err;
}

/** Effect readback: every parameter with name, matchName, current value and range. */
function __aeDescribeEffect(effect) {
  var parameters = [];
  for (var i = 1; i <= effect.numProperties; i++) {
    var p = effect.property(i);
    if (!p) {
      continue;
    }
    var item = { index: i, name: String(p.name), matchName: String(p.matchName) };
    if (p.propertyType === PropertyType.PROPERTY) {
      if (p.propertyValueType === PropertyValueType.NO_VALUE) {
        continue;
      }
      item.value = __aeSerializePropertyValue(p);
      item.numKeys = p.numKeys;
      try {
        if (p.hasMin) item.min = p.minValue;
        if (p.hasMax) item.max = p.maxValue;
      } catch (_eR) {}
    } else {
      item.group = true;
      item.numProperties = p.numProperties;
    }
    parameters.push(item);
  }
  return {
    effectName: String(effect.name),
    effectMatchName: String(effect.matchName),
    effectIndex: effect.propertyIndex,
    enabled: effect.enabled,
    parameters: parameters
  };
}

function __aePresetRoots(extraFolders) {
  var roots = [];
  try {
    var appPresets = new Folder(Folder.appPackage.fsName + "/Presets");
    if (appPresets.exists) roots.push(appPresets);
  } catch (_eA) {}
  try {
    var docsAdobe = new Folder(Folder.myDocuments.fsName + "/Adobe");
    if (docsAdobe.exists) {
      var subs = docsAdobe.getFiles();
      for (var i = 0; i < subs.length; i++) {
        if ((subs[i] instanceof Folder) && /^After Effects/i.test(decodeURI(subs[i].name))) {
          var userPresets = new Folder(subs[i].fsName + "/User Presets");
          if (userPresets.exists) roots.push(userPresets);
        }
      }
    }
  } catch (_eD) {}
  for (var j = 0; j < extraFolders.length; j++) {
    var extra = new Folder(extraFolders[j]);
    if (extra.exists) roots.push(extra);
  }
  return roots;
}

function __aeCollectPresets(folder, depth, maxDepth, out, limit) {
  var items = folder.getFiles();
  for (var i = 0; i < items.length && out.length < limit; i++) {
    var it = items[i];
    if (it instanceof Folder) {
      if (depth < maxDepth) {
        __aeCollectPresets(it, depth + 1, maxDepth, out, limit);
      }
    } else if (/\.ffx$/i.test(it.name)) {
      out.push({
        name: decodeURI(it.name).replace(/\.ffx$/i, ""),
        category: decodeURI(it.parent.name),
        path: it.fsName
      });
    }
  }
}


/* ---------- easing on existing keyframes ---------- */

var __AE_EASE_PRESETS = {
  easyEase: [33.33, 33.33],
  smooth: [60, 60],
  strong: [85, 85],
  snappy: [95, 20],
  gentle: [45, 45]
};

/** Animated leaf properties under a group (property with keyframes, not markers or plain text documents). */
function __aeAnimatedProps(group, out, depth) {
  if (depth > 12) return out;
  for (var i = 1; i <= group.numProperties; i++) {
    var p = group.property(i);
    if (!p) continue;
    if (p.propertyType === PropertyType.PROPERTY) {
      if (p.numKeys > 0 && p.matchName !== "ADBE Marker") out.push(p);
    } else {
      __aeAnimatedProps(p, out, depth + 1);
    }
  }
  return out;
}

function __aePropPath(p) {
  var parts = [];
  var cur = p;
  var guard = 0;
  while (cur && cur.parentProperty && guard++ < 20) {
    parts.unshift(String(cur.name));
    cur = cur.parentProperty;
  }
  return parts.join(" > ");
}

/** Ease arrays: one entry per dimension for non-spatial multi-value properties (Scale), one otherwise. */
function __aeEaseDims(p) {
  if (p.propertyValueType === PropertyValueType.TwoD) return 2;
  if (p.propertyValueType === PropertyValueType.ThreeD) return 3;
  return 1;
}

function __aeEaseKey(p, k, mode, inInf, outInf, speed, side) {
  var KIT = KeyframeInterpolationType;
  var curIn = p.keyInInterpolationType(k);
  var curOut = p.keyOutInterpolationType(k);
  var doIn = side !== "out";
  var doOut = side !== "in";
  if (mode === "linear" || mode === "hold") {
    var t = mode === "linear" ? KIT.LINEAR : KIT.HOLD;
    p.setInterpolationTypeAtKey(k, doIn ? t : curIn, doOut ? t : curOut);
    return;
  }
  p.setInterpolationTypeAtKey(k, doIn ? KIT.BEZIER : curIn, doOut ? KIT.BEZIER : curOut);
  var dims = __aeEaseDims(p);
  var oldIn = p.keyInTemporalEase(k);
  var oldOut = p.keyOutTemporalEase(k);
  var inArr = [];
  var outArr = [];
  for (var d = 0; d < dims; d++) {
    inArr.push(doIn ? new KeyframeEase(speed, inInf) : oldIn[Math.min(d, oldIn.length - 1)]);
    outArr.push(doOut ? new KeyframeEase(speed, outInf) : oldOut[Math.min(d, oldOut.length - 1)]);
  }
  p.setTemporalEaseAtKey(k, inArr, outArr);
}

function __aeMarkerProp(comp, params) {
  if (params.layerName || typeof params.layerIndex === "number") {
    var L = __aeFindLayer(comp, params.layerIndex, params.layerName);
    return { prop: L.property("ADBE Marker"), owner: "layer " + L.name };
  }
  if (!comp.markerProperty) throw new Error("This After Effects version has no composition markers in scripting (CompItem.markerProperty); use layer markers.");
  return { prop: comp.markerProperty, owner: "comp " + comp.name };
}

function __aeDescribeMarkers(prop) {
  var out = [];
  for (var k = 1; k <= prop.numKeys; k++) {
    var mv = prop.keyValue(k);
    out.push({ index: k, time: Math.round(prop.keyTime(k) * 1000) / 1000, comment: String(mv.comment || ""), duration: mv.duration, chapter: String(mv.chapter || ""), url: String(mv.url || ""), label: mv.label });
  }
  return out;
}


/* ---------- recipes (phase 3) ---------- */

function __aeRecipeText(comp, name, text, font, size, color, justify, tracking) {
  var L = comp.layers.addText(String(text));
  L.name = name;
  var prop = L.property("ADBE Text Properties").property("ADBE Text Document");
  var td = prop.value;
  td.resetCharStyle();
  try {
    td.font = font;
  } catch (_eF) {}
  td.fontSize = size;
  td.applyFill = true;
  td.fillColor = color;
  td.applyStroke = false;
  td.justification = justify === "center" ? ParagraphJustification.CENTER_JUSTIFY : (justify === "right" ? ParagraphJustification.RIGHT_JUSTIFY : ParagraphJustification.LEFT_JUSTIFY);
  if (typeof tracking === "number") td.tracking = tracking;
  prop.setValue(td);
  var applied = "";
  try {
    applied = String(prop.value.font);
  } catch (_eA) {}
  return { layer: L, fontApplied: applied };
}

function __aeRecipeKeys(prop, keys, inf) {
  for (var i = 0; i < keys.length; i++) prop.setValueAtTime(keys[i][0], keys[i][1]);
  for (var k = 1; k <= prop.numKeys; k++) {
    try {
      __aeEaseKey(prop, k, "custom", inf || 85, inf || 85, 0, "both");
    } catch (_eE) {}
  }
}

function __aeRecipeSlider(layer, name) {
  var fx = layer.property("ADBE Effect Parade").addProperty("ADBE Slider Control");
  fx.name = name;
  return layer.property("ADBE Effect Parade").property(name).property(1);
}

/** Shape layer with one rectangle (size/position driven by expressions) and a fill. */
function __aeRecipeRect(comp, name, color, opacity) {
  var L = comp.layers.addShape();
  L.name = name;
  var grp = L.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
  grp.name = "Retangulo";
  var vecs = grp.property("ADBE Vectors Group");
  vecs.addProperty("ADBE Vector Shape - Rect");
  var fill = vecs.addProperty("ADBE Vector Graphic - Fill");
  fill.property("ADBE Vector Fill Color").setValue(color);
  if (typeof opacity === "number") fill.property("ADBE Vector Fill Opacity").setValue(opacity);
  L.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([0, 0]);
  L.property("ADBE Transform Group").property("ADBE Position").setValue([0, 0]);
  return L;
}

function __aeRectProp(L, which) {
  return L.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group").property(1).property(which);
}

function __aeRecipeComp(name, w, h, dur, fps) {
  var c = app.project.items.addComp(name, w, h, 1, dur, fps);
  c.bgColor = [0, 0, 0];
  return c;
}

function __aeEncodeFileToBase64(fileObj) {
  if (!fileObj || !fileObj.exists) {
    return null;
  }
  // ExtendScript builds this string one character at a time: a photo-sized file blocks the app for minutes.
  // Past 300 KB return nothing; the server reads the file from disk (outputPath) instead.
  if (fileObj.length > 300000) return null;
  fileObj.encoding = "BINARY";
  if (!fileObj.open("r")) {
    return null;
  }
  var bin = fileObj.read();
  fileObj.close();

  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var out = "";
  var i = 0;
  var len = bin.length;
  while (i < len) {
    var c1 = bin.charCodeAt(i++) & 0xff;
    if (i === len) {
      out += chars.charAt(c1 >> 2);
      out += chars.charAt((c1 & 0x3) << 4);
      out += "==";
      break;
    }
    var c2 = bin.charCodeAt(i++) & 0xff;
    if (i === len) {
      out += chars.charAt(c1 >> 2);
      out += chars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xf0) >> 4));
      out += chars.charAt((c2 & 0xf) << 2);
      out += "=";
      break;
    }
    var c3 = bin.charCodeAt(i++) & 0xff;
    out += chars.charAt(c1 >> 2);
    out += chars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xf0) >> 4));
    out += chars.charAt(((c2 & 0xf) << 2) | ((c3 & 0xc0) >> 6));
    out += chars.charAt(c3 & 0x3f);
  }
  return out;
}

/** PostScript names of the fonts used by text layers of a comp, split by Adobe Fonts vs local. */
function __aeMogrtFontCheck(comp) {
  var seen = {}, local = [], adobe = [];
  for (var i = 1; i <= comp.numLayers; i++) {
    var L = comp.layer(i);
    if (typeof TextLayer !== "undefined" && !(L instanceof TextLayer)) continue;
    var ps = "";
    try { ps = String(L.property("ADBE Text Properties").property("ADBE Text Document").value.font); } catch (_eF) { continue; }
    if (!ps || seen[ps]) continue;
    seen[ps] = true;
    var fromAdobe = null;
    try {
      var fo = app.fonts.getFontsByPostScriptName(ps);
      if (fo && fo.length) fromAdobe = fo[0].isFromAdobeFonts === true;
    } catch (_eA) {}
    if (fromAdobe === false) local.push(ps);
    else if (fromAdobe === true) adobe.push(ps);
  }
  return { local: local, adobe: adobe };
}

function __mcpDispatch(action, params, _options) {
  if (action === "adobe.ping") {
    return { pong: true, app: "after-effects", version: String(app.version), projectFile: app.project.file ? app.project.file.fsName : null };
  }
  if (action === "adobe.checkpoint") {
    var cpP = app.project;
    var cpPOrig = cpP.file;
    var cpPDest = __mcpCheckpointFile(cpPOrig ? cpPOrig.name : "untitled-project", "aep", params.label, params.folder, cpPOrig);
    if (cpPOrig) {
      var cpPDirty = cpP.dirty !== false;
      if (cpPDirty) cpP.save();
      __mcpCopyFile(cpPOrig, cpPDest);
      return {
        app: "after-effects",
        project: cpPOrig.name,
        checkpointPath: cpPDest.fsName,
        method: cpPDirty ? "saved the project, then copied the .aep" : "copied the saved .aep",
        savedOriginal: cpPDirty,
        documentPathChanged: false
      };
    }
    cpP.save(cpPDest);
    return {
      app: "after-effects",
      project: cpPDest.name,
      checkpointPath: cpPDest.fsName,
      method: "saved the never-saved project as the checkpoint",
      savedOriginal: false,
      documentPathChanged: true,
      note: "The project was never saved; it now lives at the checkpoint path."
    };
  }
  params = params || {};

  if (action === "ae.batch") {
    return __mcpBatch(params, "ae");
  }

  if (action === "ae.project.getInfo") {
    var proj = app.project;
    var comps = [];
    var folders = 0;
    var footage = 0;
    if (proj) {
      for (var i = 1; i <= proj.numItems; i++) {
        var it = proj.item(i);
        if (it instanceof CompItem) {
          comps.push({
            index: i,
            id: it.id,
            name: it.name,
            width: it.width,
            height: it.height,
            duration: it.duration,
            frameRate: it.frameRate,
            numLayers: it.numLayers
          });
        } else if (it instanceof FolderItem) {
          folders++;
        } else {
          footage++;
        }
      }
    }
    return {
      version: app.version,
      projectFile: (proj && proj.file) ? proj.file.fsName : null,
      bitsPerChannel: proj ? proj.bitsPerChannel : 8,
      numItems: proj ? proj.numItems : 0,
      counts: { compositions: comps.length, folders: folders, footage: footage },
      compositions: comps,
      renderQueueCount: (proj && proj.renderQueue) ? proj.renderQueue.numItems : 0
    };
  }

  if (action === "ae.project.manage") {
    var op = params.operation || "save";
    if (op === "new" || op === "open") {
      // With unsaved changes After Effects asks "save changes?" in a modal dialog that blocks the app.
      if (app.project && app.project.dirty) {
        if (params.discardChanges === true) {
          app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
        } else {
          __mcpFail(
            "PROJECT_DIRTY",
            "The current project has unsaved changes. Save it first (operation 'save') or pass discardChanges: true."
          );
        }
      }
    }
    if (op === "new" || op === "open") {
      // Switching projects inside an open undo group also triggers "Undo group mismatch".
      if (typeof __mcpCloseUndoGroup === "function") __mcpCloseUndoGroup();
    }
    if (op === "new") {
      app.newProject();
      if (params.bitsPerChannel) app.project.bitsPerChannel = Number(params.bitsPerChannel);
      return { operation: "new", created: true, bitsPerChannel: app.project.bitsPerChannel };
    }
    if (op === "settings") {
      // 16 bpc removes banding in soft gradients and feathered masks; 32 bpc is linear float.
      if (params.bitsPerChannel) app.project.bitsPerChannel = Number(params.bitsPerChannel);
      return { operation: "settings", bitsPerChannel: app.project.bitsPerChannel };
    }
    if (op === "open") {
      var openF = new File(params.filePath);
      if (!openF.exists) throw new Error("Project file does not exist: " + params.filePath);
      app.open(openF);
      return { operation: "open", filePath: openF.fsName };
    }
    if (op === "save") {
      // A save into a missing folder raises a modal warning that blocks After Effects.
      app.beginSuppressDialogs();
      try {
        if (params.filePath) {
          var saveF = __mcpPrepareOutputFile(params.filePath);
          app.project.save(saveF);
          __mcpVerifySaved(saveF, app.project.file ? app.project.file.fsName : null);
          return { operation: "save", filePath: saveF.fsName };
        }
        if (!app.project.file) {
          __mcpFail("INVALID_PARAMS", "This project was never saved: pass filePath.");
        }
        app.project.save();
        return { operation: "save", filePath: app.project.file.fsName };
      } finally {
        app.endSuppressDialogs(false);
      }
    }
    if (op === "import") {
      var impFile = new File(params.filePath);
      if (!impFile.exists) throw new Error("File to import does not exist: " + params.filePath);
      var io = new ImportOptions(impFile);
      if (params.sequence === true) {
        io.sequence = true;
      }
      if (params.importAs === "comp" && io.canImportAs(ImportAsType.COMP)) {
        io.importAs = ImportAsType.COMP;
      } else if (params.importAs === "compCroppedLayers" && io.canImportAs(ImportAsType.COMP_CROPPED_LAYERS)) {
        io.importAs = ImportAsType.COMP_CROPPED_LAYERS;
      }
      var imported = app.project.importFile(io);
      return {
        operation: "import",
        itemId: imported.id,
        name: imported.name,
        typename: imported.typename
      };
    }
    if (op === "createFolder") {
      var folder = app.project.items.addFolder(params.folderName || "New Folder");
      return { operation: "createFolder", itemId: folder.id, name: folder.name };
    }
    if (op === "purge") {
      app.purge(PurgeTarget.ALL_CACHES);
      return { operation: "purge", purged: true };
    }
    throw new Error("Unsupported ae.project.manage operation: " + op);
  }

  if (action === "ae.comp.list") {
    var list = [];
    for (var c = 1; c <= app.project.numItems; c++) {
      var item = app.project.item(c);
      if (item instanceof CompItem) {
        list.push({
          index: c,
          id: item.id,
          name: item.name,
          width: item.width,
          height: item.height,
          pixelAspect: item.pixelAspect,
          duration: item.duration,
          frameRate: item.frameRate,
          bgColor: item.bgColor,
          numLayers: item.numLayers,
          time: item.time,
          workAreaStart: item.workAreaStart,
          workAreaDuration: item.workAreaDuration,
          active: app.project.activeItem === item
        });
      }
    }
    return { count: list.length, compositions: list };
  }

  if (action === "ae.comp.create") {
    var cName = params.name || "MCP Composition";
    var w = params.width || 1920;
    var h = params.height || 1080;
    var pa = params.pixelAspect || 1.0;
    var dur = params.duration || 10.0;
    var fps = params.frameRate || 30.0;
    var newComp = app.project.items.addComp(cName, w, h, pa, dur, fps);
    if (params.bgColor && params.bgColor.length === 3) {
      newComp.bgColor = params.bgColor;
    }
    if (params.openInViewer !== false && typeof newComp.openInViewer === "function") {
      newComp.openInViewer();
    }
    return {
      id: newComp.id,
      name: newComp.name,
      width: newComp.width,
      height: newComp.height,
      duration: newComp.duration,
      frameRate: newComp.frameRate
    };
  }

  if (action === "ae.comp.modify") {
    var compM = __aeFindComp(params.compName, params.compIndex);
    if (params.newName) compM.name = params.newName;
    if (typeof params.width === "number") compM.width = params.width;
    if (typeof params.height === "number") compM.height = params.height;
    if (typeof params.duration === "number") compM.duration = params.duration;
    if (typeof params.frameRate === "number") compM.frameRate = params.frameRate;
    if (params.bgColor && params.bgColor.length === 3) compM.bgColor = params.bgColor;
    if (typeof params.workAreaStart === "number") compM.workAreaStart = params.workAreaStart;
    if (typeof params.workAreaDuration === "number") compM.workAreaDuration = params.workAreaDuration;
    if (typeof params.motionBlur === "boolean") compM.motionBlur = params.motionBlur;
    if (params.precomposeLayerNames && params.precomposeLayerNames.length > 0) {
      params.precomposeLayerIndices = [];
      for (var pn = 0; pn < params.precomposeLayerNames.length; pn++) {
        params.precomposeLayerIndices.push(__aeFindLayer(compM, null, params.precomposeLayerNames[pn]).index);
      }
    }
    if (params.precomposeLayerIndices && params.precomposeLayerIndices.length > 0) {
      var precomp = compM.layers.precompose(
        params.precomposeLayerIndices,
        params.precompName || "Pre-comp 1",
        params.moveAllAttributes !== false
      );
      return {
        compName: compM.name,
        precomposed: true,
        precompName: precomp.name,
        precompId: precomp.id
      };
    }
    return {
      id: compM.id,
      name: compM.name,
      width: compM.width,
      height: compM.height,
      duration: compM.duration,
      frameRate: compM.frameRate
    };
  }

  if (action === "ae.comp.getFramePreview") {
    var compP = __aeFindComp(params.compName, params.compIndex);
    var t = typeof params.time === "number" ? params.time : compP.time;
    var outPath = params.outputPath || (Folder.temp.fsName + "/ae_preview_" + new Date().getTime() + ".png");
    var pngFile = __mcpPrepareOutputFile(outPath);
    if (pngFile.exists) {
      pngFile.remove();
    }
    if (typeof compP.saveFrameToPng !== "function") {
      throw new Error("This After Effects version has no CompItem.saveFrameToPng.");
    }
    compP.saveFrameToPng(t, pngFile);
    // Newer After Effects versions write the PNG asynchronously, on the main thread. Sleeping here
    // blocks that thread, so the file may never be written and the app hangs (campaign test, 2026-11-12).
    // The MCP server passes noWait and waits for the file itself, outside After Effects.
    if (params.noWait) {
      return { compName: compP.name, time: t, outputPath: pngFile.fsName, pending: true };
    }
    var waited = 0;
    var lastSize = -1;
    while (waited < 15000) {
      var probe = new File(pngFile.fsName);
      if (probe.exists && probe.length > 0 && probe.length === lastSize) {
        break;
      }
      lastSize = probe.exists ? probe.length : -1;
      $.sleep(150);
      waited += 150;
    }
    if (!new File(pngFile.fsName).exists) {
      throw new Error("After Effects did not write the preview PNG within 15 s: " + pngFile.fsName);
    }
    var b64 = __aeEncodeFileToBase64(new File(pngFile.fsName));
    return {
      compName: compP.name,
      time: t,
      outputPath: pngFile.fsName,
      previewBase64: b64,
      previewMimeType: "image/png"
    };
  }

  if (action === "ae.layer.list") {
    var compL = __aeFindComp(params.compName, params.compIndex);
    var layers = [];
    for (var li = 1; li <= compL.numLayers; li++) {
      var lyr = compL.layer(li);
      var lType = "AVLayer";
      if (lyr instanceof TextLayer) lType = "TextLayer";
      else if (lyr instanceof ShapeLayer) lType = "ShapeLayer";
      else if (lyr instanceof CameraLayer) lType = "CameraLayer";
      else if (lyr instanceof LightLayer) lType = "LightLayer";
      else if (lyr.nullLayer) lType = "NullLayer";
      else if (lyr.adjustmentLayer) lType = "AdjustmentLayer";

      layers.push({
        index: lyr.index,
        name: lyr.name,
        type: lType,
        enabled: lyr.enabled,
        solo: lyr.solo,
        locked: lyr.locked,
        threeDLayer: Boolean(lyr.threeDLayer),
        inPoint: lyr.inPoint,
        outPoint: lyr.outPoint,
        startTime: lyr.startTime,
        stretch: lyr.stretch,
        parentIndex: lyr.parent ? lyr.parent.index : null,
        numEffects: lyr.property("ADBE Effect Parade") ? lyr.property("ADBE Effect Parade").numProperties : 0
      });
    }
    return { compName: compL.name, numLayers: compL.numLayers, layers: layers };
  }

  if (action === "ae.layer.create") {
    var compC = __aeFindComp(params.compName, params.compIndex);
    var kind = params.layerType || "text";
    var createdLayer = null;

    if (kind === "text") {
      createdLayer = params.boxSize
        ? compC.layers.addBoxText(params.boxSize, params.text || "Text")
        : compC.layers.addText(params.text || "Text");
      var textProp = createdLayer.property("ADBE Text Properties").property("ADBE Text Document");
      var textDoc = textProp.value;
      if (params.fontSize) textDoc.fontSize = params.fontSize;
      if (params.font) textDoc.font = params.font;
      if (params.fillColor && params.fillColor.length === 3) {
        textDoc.applyFill = true;
        textDoc.fillColor = params.fillColor;
      }
      if (typeof params.tracking === "number") textDoc.tracking = params.tracking;
      if (params.justification) {
        var J = ParagraphJustification;
        textDoc.justification = params.justification === "center" ? J.CENTER_JUSTIFY : (params.justification === "right" ? J.RIGHT_JUSTIFY : J.LEFT_JUSTIFY);
      }
      if (typeof params.leading === "number") {
        textDoc.autoLeading = false;
        textDoc.leading = params.leading;
      }
      textProp.setValue(textDoc);
    } else if (kind === "solid" || kind === "adjustment") {
      var color = params.color || [0.5, 0.5, 0.5];
      var sW = params.width || compC.width;
      var sH = params.height || compC.height;
      var sDur = params.duration || compC.duration;
      createdLayer = compC.layers.addSolid(color, params.name || (kind === "adjustment" ? "Adjustment Layer" : "Solid"), sW, sH, compC.pixelAspect, sDur);
      if (kind === "adjustment") {
        createdLayer.adjustmentLayer = true;
      }
    } else if (kind === "null") {
      createdLayer = compC.layers.addNull(params.duration || compC.duration);
    } else if (kind === "camera") {
      var center = [compC.width / 2, compC.height / 2];
      createdLayer = compC.layers.addCamera(params.name || "Camera 1", center);
    } else if (kind === "light") {
      var lCenter = [compC.width / 2, compC.height / 2];
      createdLayer = compC.layers.addLight(params.name || "Light 1", lCenter);
    } else if (kind === "shape") {
      createdLayer = compC.layers.addShape();
    } else {
      throw new Error("Unsupported layerType: " + kind);
    }

    if (params.name) createdLayer.name = params.name;
    if (params.position) {
      createdLayer.property("ADBE Transform Group").property("ADBE Position").setValue(params.position);
    }
    if (typeof params.inPoint === "number") createdLayer.inPoint = params.inPoint;
    if (typeof params.outPoint === "number") createdLayer.outPoint = params.outPoint;
    if (typeof params.threeDLayer === "boolean" && typeof createdLayer.threeDLayer !== "undefined") {
      createdLayer.threeDLayer = params.threeDLayer;
    }

    return {
      compName: compC.name,
      layerIndex: createdLayer.index,
      name: createdLayer.name,
      layerType: kind
    };
  }

  if (action === "ae.layer.createShape") {
    var compS = __aeFindComp(params.compName, params.compIndex);
    var shapeLayer = compS.layers.addShape();
    shapeLayer.name = params.name || "Shape Layer 1";
    var rootVectors = shapeLayer.property("ADBE Root Vectors Group");
    var group = rootVectors.addProperty("ADBE Vector Group");
    group.name = params.groupName || "Shape Group 1";
    var vectors = group.property("ADBE Vectors Group");

    var shapeType = params.shapeType || "rectangle";
    if (shapeType === "rectangle") {
      var rect = vectors.addProperty("ADBE Vector Shape - Rect");
      if (params.size) rect.property("ADBE Vector Rect Size").setValue(params.size);
      if (typeof params.roundness === "number") rect.property("ADBE Vector Rect Roundness").setValue(params.roundness);
    } else if (shapeType === "ellipse") {
      var ell = vectors.addProperty("ADBE Vector Shape - Ellipse");
      if (params.size) ell.property("ADBE Vector Ellipse Size").setValue(params.size);
    } else if (shapeType === "polystar") {
      var star = vectors.addProperty("ADBE Vector Shape - Star");
      if (typeof params.points === "number") star.property("ADBE Vector Star Points").setValue(params.points);
      if (typeof params.outerRadius === "number") star.property("ADBE Vector Star Outer Radius").setValue(params.outerRadius);
      if (typeof params.innerRadius === "number") star.property("ADBE Vector Star Inner Radius").setValue(params.innerRadius);
    } else if (shapeType === "path" && params.vertices) {
      var pathGroup = vectors.addProperty("ADBE Vector Shape - Group");
      var myShape = new Shape();
      myShape.vertices = params.vertices;
      if (params.inTangents) myShape.inTangents = params.inTangents;
      if (params.outTangents) myShape.outTangents = params.outTangents;
      myShape.closed = params.closed !== false;
      pathGroup.property("ADBE Vector Shape").setValue(myShape);
    }

    if (params.fillColor) {
      var fill = vectors.addProperty("ADBE Vector Graphic - Fill");
      fill.property("ADBE Vector Fill Color").setValue(params.fillColor);
      if (typeof params.fillOpacity === "number") {
        fill.property("ADBE Vector Fill Opacity").setValue(params.fillOpacity);
      }
    }

    if (params.strokeColor || params.strokeWidth) {
      var stroke = vectors.addProperty("ADBE Vector Graphic - Stroke");
      if (params.strokeColor) stroke.property("ADBE Vector Stroke Color").setValue(params.strokeColor);
      if (typeof params.strokeWidth === "number") stroke.property("ADBE Vector Stroke Width").setValue(params.strokeWidth);
    }

    if (params.trimPaths) {
      var trim = vectors.addProperty("ADBE Vector Filter - Trim");
      if (typeof params.trimPaths.start === "number") trim.property("ADBE Vector Trim Start").setValue(params.trimPaths.start);
      if (typeof params.trimPaths.end === "number") trim.property("ADBE Vector Trim End").setValue(params.trimPaths.end);
      if (typeof params.trimPaths.offset === "number") trim.property("ADBE Vector Trim Offset").setValue(params.trimPaths.offset);
    }

    if (params.position) {
      shapeLayer.property("ADBE Transform Group").property("ADBE Position").setValue(params.position);
    }

    return {
      compName: compS.name,
      layerIndex: shapeLayer.index,
      name: shapeLayer.name,
      shapeType: shapeType
    };
  }

  if (action === "ae.layer.modify") {
    var compMod = __aeFindComp(params.compName, params.compIndex);
    var lyrMod = __aeFindLayer(compMod, params.layerIndex, params.layerName);
    var opL = params.operation || "update";

    if (opL === "delete") {
      var deletedName = lyrMod.name;
      lyrMod.remove();
      return { deleted: true, layerName: deletedName };
    }
    if (opL === "duplicate") {
      var dup = lyrMod.duplicate();
      if (params.newName) dup.name = params.newName;
      return { duplicated: true, newLayerIndex: dup.index, name: dup.name };
    }

    if (params.newName) lyrMod.name = params.newName;
    if (typeof params.enabled === "boolean") lyrMod.enabled = params.enabled;
    if (typeof params.solo === "boolean") lyrMod.solo = params.solo;
    if (typeof params.locked === "boolean") lyrMod.locked = params.locked;
    if (typeof params.threeDLayer === "boolean" && typeof lyrMod.threeDLayer !== "undefined") {
      lyrMod.threeDLayer = params.threeDLayer;
    }
    if (typeof params.inPoint === "number") lyrMod.inPoint = params.inPoint;
    if (typeof params.outPoint === "number") lyrMod.outPoint = params.outPoint;
    if (typeof params.startTime === "number") lyrMod.startTime = params.startTime;
    if (typeof params.stretch === "number") lyrMod.stretch = params.stretch;
    if (typeof params.parentLayerIndex === "number") {
      lyrMod.parent = params.parentLayerIndex === 0 ? null : compMod.layer(params.parentLayerIndex);
    }
    if (typeof params.motionBlur === "boolean") lyrMod.motionBlur = params.motionBlur;
    if (typeof params.adjustmentLayer === "boolean") lyrMod.adjustmentLayer = params.adjustmentLayer;
    if (params.blendMode) {
      var blendKey = String(params.blendMode).replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
      if (typeof BlendingMode[blendKey] === "undefined") {
        throw new Error("Unknown blend mode '" + params.blendMode + "'.");
      }
      lyrMod.blendingMode = BlendingMode[blendKey];
    }
    if (params.trackMatte) {
      var tmType = {
        alpha: "ALPHA",
        alphaInverted: "ALPHA_INVERTED",
        luma: "LUMA",
        lumaInverted: "LUMA_INVERTED",
        none: "NO_TRACK_MATTE"
      }[params.trackMatte.type || "alpha"];
      if (!tmType) {
        throw new Error("Unknown track matte type '" + params.trackMatte.type + "'.");
      }
      if (tmType === "NO_TRACK_MATTE") {
        if (typeof lyrMod.removeTrackMatte === "function") {
          lyrMod.removeTrackMatte();
        } else {
          lyrMod.trackMatteType = TrackMatteType.NO_TRACK_MATTE;
        }
      } else if (typeof lyrMod.setTrackMatte === "function") {
        var matteLayer = __aeFindLayer(compMod, params.trackMatte.matteLayerIndex, params.trackMatte.matteLayerName);
        lyrMod.setTrackMatte(matteLayer, TrackMatteType[tmType]);
      } else {
        lyrMod.trackMatteType = TrackMatteType[tmType];
      }
    }

    var tr = lyrMod.property("ADBE Transform Group");
    if (tr) {
      if (params.position) tr.property("ADBE Position").setValue(params.position);
      if (params.scale) tr.property("ADBE Scale").setValue(params.scale);
      if (typeof params.rotation === "number") {
        var rotProp = tr.property("ADBE Rotate Z") || tr.property("ADBE Orientation");
        if (rotProp) rotProp.setValue(params.rotation);
      }
      if (typeof params.opacity === "number") tr.property("ADBE Opacity").setValue(params.opacity);
      if (params.anchorPoint) tr.property("ADBE Anchor Point").setValue(params.anchorPoint);
    }

    var trOut = lyrMod.property("ADBE Transform Group");
    return {
      compName: compMod.name,
      layerIndex: lyrMod.index,
      layerId: __aeLayerId(lyrMod),
      name: lyrMod.name,
      updated: true,
      position: trOut ? trOut.property("ADBE Position").value : null,
      scale: trOut ? trOut.property("ADBE Scale").value : null,
      opacity: trOut ? trOut.property("ADBE Opacity").value : null,
      blendMode: __aeEnumName(BlendingMode, lyrMod.blendingMode),
      inPoint: lyrMod.inPoint,
      outPoint: lyrMod.outPoint
    };
  }

  if (action === "ae.anim.getPropertyTree") {
    var compTree = __aeFindComp(params.compName, params.compIndex);
    var lyrTree = __aeFindLayer(compTree, params.layerIndex, params.layerName);
    var maxD = params.maxDepth || 3;
    var startRoot = lyrTree;
    var basePath = [];
    if (params.rootPath && params.rootPath.length > 0) {
      startRoot = __aeResolveProperty(lyrTree, params.rootPath);
      basePath = params.rootPath;
    }
    return __aeWalkPropertyTree(startRoot, basePath, 0, maxD);
  }

  if (action === "ae.anim.setProperty") {
    var compProp = __aeFindComp(params.compName, params.compIndex);
    var lyrProp = __aeFindLayer(compProp, params.layerIndex, params.layerName);
    var targetProp = __aeResolveProperty(lyrProp, params.propertyPath);
    targetProp.setValue(params.value);
    return {
      compName: compProp.name,
      layerIndex: lyrProp.index,
      propertyName: targetProp.name,
      matchName: targetProp.matchName,
      newValue: __aeSerializePropertyValue(targetProp)
    };
  }

  if (action === "ae.anim.setKeyframes") {
    var compKf = __aeFindComp(params.compName, params.compIndex);
    var lyrKf = __aeFindLayer(compKf, params.layerIndex, params.layerName);
    var propKf = __aeResolveProperty(lyrKf, params.propertyPath);
    if (params.clearExisting === true) {
      while (propKf.numKeys > 0) {
        propKf.removeKey(1);
      }
    }
    var kfs = params.keyframes || [];
    for (var k = 0; k < kfs.length; k++) {
      var kf = kfs[k];
      propKf.setValueAtTime(kf.time, kf.value);
      var keyIdx = propKf.nearestKeyIndex(kf.time);
      var easing = kf.easing || "linear";
      if (easing === "hold") {
        propKf.setInterpolationTypeAtKey(keyIdx, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
      } else if (easing === "easeIn" || easing === "easeOut" || easing === "easeInOut" || easing === "bezier") {
        propKf.setInterpolationTypeAtKey(keyIdx, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        var influenceIn = (easing === "easeIn" || easing === "easeInOut") ? (kf.influence || 66) : 33;
        var influenceOut = (easing === "easeOut" || easing === "easeInOut") ? (kf.influence || 66) : 33;
        if (typeof kf.influenceIn === "number") influenceIn = kf.influenceIn;
        if (typeof kf.influenceOut === "number") influenceOut = kf.influenceOut;
        var speedIn = typeof kf.speedIn === "number" ? kf.speedIn : 0;
        var speedOut = typeof kf.speedOut === "number" ? kf.speedOut : 0;
        var dims = 1;
        if (propKf.propertyValueType === PropertyValueType.TwoD) dims = 2;
        else if (propKf.propertyValueType === PropertyValueType.ThreeD) dims = 3;
        var inEaseArr = [];
        var outEaseArr = [];
        for (var d = 0; d < dims; d++) {
          inEaseArr.push(new KeyframeEase(speedIn, influenceIn));
          outEaseArr.push(new KeyframeEase(speedOut, influenceOut));
        }
        try {
          propKf.setTemporalEaseAtKey(keyIdx, inEaseArr, outEaseArr);
        } catch (_eEase) {}
      }
      if (kf.spatial && propKf.isSpatial) {
        try {
          if (kf.spatial === "linear") {
            propKf.setSpatialAutoBezierAtKey(keyIdx, false);
            propKf.setSpatialContinuousAtKey(keyIdx, false);
            var zero = propKf.propertyValueType === PropertyValueType.ThreeD_SPATIAL ? [0, 0, 0] : [0, 0];
            propKf.setSpatialTangentsAtKey(keyIdx, zero, zero);
          } else if (kf.spatial === "autoBezier") {
            propKf.setSpatialAutoBezierAtKey(keyIdx, true);
          } else if (kf.spatial === "continuous") {
            propKf.setSpatialAutoBezierAtKey(keyIdx, false);
            propKf.setSpatialContinuousAtKey(keyIdx, true);
          }
        } catch (_eSp) {}
      }
    }
    for (var rv = 0; rv < kfs.length; rv++) {
      if (kfs[rv].roving === true) {
        var rvIdx = propKf.nearestKeyIndex(kfs[rv].time);
        if (rvIdx > 1 && rvIdx < propKf.numKeys) {
          try {
            propKf.setRovingAtKey(rvIdx, true);
          } catch (_eRv) {}
        }
      }
    }
    var keysOut = [];
    for (var ko = 1; ko <= propKf.numKeys; ko++) {
      var kv = propKf.keyValue(ko);
      keysOut.push({ index: ko, time: propKf.keyTime(ko), value: (typeof kv === "number" || kv instanceof Array) ? kv : String(kv) });
    }
    return {
      compName: compKf.name,
      layerIndex: lyrKf.index,
      layerId: __aeLayerId(lyrKf),
      propertyName: propKf.name,
      matchName: propKf.matchName,
      numKeys: propKf.numKeys,
      keys: keysOut
    };
  }


  if (action === "ae.anim.ease") {
    var compE = __aeFindComp(params.compName, params.compIndex);
    var mode = params.preset || "easyEase";
    var pr = __AE_EASE_PRESETS[mode];
    if (!pr && mode !== "linear" && mode !== "hold" && mode !== "custom") {
      throw new Error("Unknown preset '" + mode + "'. Use easyEase, smooth, strong, snappy, gentle, linear, hold or custom.");
    }
    var inInf = typeof params.influenceIn === "number" ? params.influenceIn : (pr ? pr[0] : 33.33);
    var outInf = typeof params.influenceOut === "number" ? params.influenceOut : (pr ? pr[1] : 33.33);
    if (inInf < 0.1 || inInf > 100 || outInf < 0.1 || outInf > 100) throw new Error("Influence must be between 0.1 and 100.");
    var speed = typeof params.speed === "number" ? params.speed : 0;
    var layersE = [];
    if (params.layerNames && params.layerNames.length) {
      for (var ln = 0; ln < params.layerNames.length; ln++) layersE.push(__aeFindLayer(compE, null, params.layerNames[ln]));
    } else if (params.layerIndices && params.layerIndices.length) {
      for (var li = 0; li < params.layerIndices.length; li++) layersE.push(__aeFindLayer(compE, params.layerIndices[li], null));
    } else if (compE.selectedLayers && compE.selectedLayers.length) {
      for (var sl = 0; sl < compE.selectedLayers.length; sl++) layersE.push(compE.selectedLayers[sl]);
    } else {
      for (var al = 1; al <= compE.numLayers; al++) layersE.push(compE.layer(al));
    }
    var touched = [];
    var skipped = [];
    var keysDone = 0;
    for (var le = 0; le < layersE.length; le++) {
      var props = [];
      if (params.propertyPath && params.propertyPath.length) props.push(__aeResolveProperty(layersE[le], params.propertyPath));
      else __aeAnimatedProps(layersE[le], props, 0);
      for (var pp = 0; pp < props.length; pp++) {
        var P = props[pp];
        if (P.numKeys === 0) continue;
        var n = 0;
        for (var k = 1; k <= P.numKeys; k++) {
          var tk = P.keyTime(k);
          if (typeof params.fromTime === "number" && tk < params.fromTime - 0.0005) continue;
          if (typeof params.toTime === "number" && tk > params.toTime + 0.0005) continue;
          if (params.keyIndices && params.keyIndices.length) {
            var want = false;
            for (var ki = 0; ki < params.keyIndices.length; ki++) if (params.keyIndices[ki] === k) want = true;
            if (!want) continue;
          }
          try {
            __aeEaseKey(P, k, mode, inInf, outInf, speed, params.side || "both");
            n++;
          } catch (eK) {
            skipped.push(layersE[le].name + " > " + __aePropPath(P) + " #" + k + ": " + eK.message);
          }
        }
        if (n) {
          keysDone += n;
          touched.push({ layer: String(layersE[le].name), property: __aePropPath(P), keys: n });
        }
      }
    }
    return {
      compName: compE.name,
      preset: mode,
      influenceIn: inInf,
      influenceOut: outInf,
      speed: speed,
      keys: keysDone,
      properties: touched,
      skipped: skipped.slice(0, 20),
      note: keysDone ? "Check the motion with ae_get_comp_frame_preview or ae_contact_sheet." : "No keyframes matched (layers, propertyPath, time range)."
    };
  }

  if (action === "ae.marker.manage") {
    var compMk = __aeFindComp(params.compName, params.compIndex);
    var tgt = __aeMarkerProp(compMk, params);
    var opMk = params.operation || "list";
    if (opMk === "add") {
      var list = params.markers || [];
      for (var mi = 0; mi < list.length; mi++) {
        var m = list[mi];
        var mv = new MarkerValue(String(m.comment || ""));
        if (typeof m.duration === "number") mv.duration = m.duration;
        if (m.chapter) mv.chapter = String(m.chapter);
        if (m.url) mv.url = String(m.url);
        if (typeof m.label === "number") mv.label = m.label;
        tgt.prop.setValueAtTime(m.time, mv);
      }
    } else if (opMk === "remove") {
      if (params.all === true) {
        while (tgt.prop.numKeys > 0) tgt.prop.removeKey(1);
      } else {
        var times = params.times || [];
        for (var ti2 = 0; ti2 < times.length; ti2++) {
          if (tgt.prop.numKeys === 0) break;
          var near = tgt.prop.nearestKeyIndex(times[ti2]);
          if (Math.abs(tgt.prop.keyTime(near) - times[ti2]) < 0.05) tgt.prop.removeKey(near);
        }
      }
    } else if (opMk !== "list") {
      throw new Error("Unknown marker operation '" + opMk + "'. Use list, add or remove.");
    }
    return { owner: tgt.owner, count: tgt.prop.numKeys, markers: __aeDescribeMarkers(tgt.prop) };
  }


  if (action === "ae.vector.importAsShapes") {
    // Illustrator/PDF/EPS file → comp with one layer per AI layer → "Create Shapes from Vector Layer" on each,
    // so the artwork becomes editable shape layers (paths, fills, strokes, Trim Paths…).
    var vf = new File(params.filePath);
    if (!vf.exists) throw new Error("File not found: " + params.filePath);
    var io = new ImportOptions(vf);
    if (!io.canImportAs(ImportAsType.COMP_CROPPED_LAYERS)) throw new Error("After Effects cannot import this file as layers (save the .ai with PDF compatibility and real layers).");
    io.importAs = ImportAsType.COMP_CROPPED_LAYERS;
    var compV = app.project.importFile(io);
    if (!(compV instanceof CompItem)) throw new Error("The import did not produce a composition.");
    if (params.compName) compV.name = String(params.compName);
    compV.openInViewer();
    var cmd = 0;
    try {
      cmd = app.findMenuCommandId("Create Shapes from Vector Layer");
    } catch (_eF) {}
    if (!cmd) cmd = 3973;
    var made = [];
    var failed = [];
    var originals = [];
    for (var vi = 1; vi <= compV.numLayers; vi++) originals.push(compV.layer(vi));
    for (var oi = 0; oi < originals.length; oi++) {
      var src = originals[oi];
      if (!(src.source instanceof FootageItem)) continue;
      for (var dsl = 1; dsl <= compV.numLayers; dsl++) compV.layer(dsl).selected = false;
      src.selected = true;
      var before = compV.numLayers;
      app.executeCommand(cmd);
      if (compV.numLayers > before) {
        var shape = compV.layer(src.index - 1);
        made.push({ source: String(src.name), shapeLayer: String(shape.name), index: shape.index });
      } else {
        failed.push(String(src.name));
      }
    }
    // An .ai saved without "Create PDF Compatible File" imports as Illustrator's warning page, not the artwork.
    for (var pw = 0; pw < made.length; pw++) {
      if (/^This is an Adobe/i.test(made[pw].shapeLayer) || /^This is an Adobe/i.test(made[pw].source)) {
        throw new Error("This .ai was saved without PDF compatibility, so After Effects sees only Illustrator's warning page. In Illustrator: Save As, tick 'Create PDF Compatible File', then import that copy.");
      }
    }
    var removed = 0;
    if (params.deleteOriginals !== false) {
      for (var ri = 0; ri < originals.length; ri++) {
        var still = false;
        for (var mi = 0; mi < made.length; mi++) if (made[mi].source === String(originals[ri].name)) still = true;
        if (still) {
          originals[ri].remove();
          removed++;
        }
      }
    }
    // Indices change once the originals are gone: report where the shape layers ended up.
    for (var fi = 0; fi < made.length; fi++) {
      for (var fl = 1; fl <= compV.numLayers; fl++) if (String(compV.layer(fl).name) === made[fi].shapeLayer) made[fi].index = fl;
    }
    return {
      compName: compV.name,
      width: compV.width,
      height: compV.height,
      shapeLayers: made,
      failed: failed,
      removedOriginals: removed,
      note: failed.length ? "Some layers did not convert (raster, linked images or text): they stay as footage." : "Shape layers keep the vector paths; animate them with Trim Paths, ae_set_keyframes and ae_set_easing."
    };
  }


  if (action === "ae.audit") {
    var compAu = __aeFindComp(params.compName, params.compIndex);
    var layersAu = [];
    for (var li = 1; li <= compAu.numLayers; li++) {
      var L = compAu.layer(li);
      var rec = { index: li, name: String(L.name), enabled: !!L.enabled, inPoint: L.inPoint, outPoint: L.outPoint, isText: L instanceof TextLayer, words: 0, linear: [], expressionErrors: [], missingFootage: false, effects: [] };
      if (rec.isText) {
        try {
          var txt = String(L.property("ADBE Text Properties").property("ADBE Text Document").value.text);
          rec.words = txt.replace(/^\s+|\s+$/g, "") === "" ? 0 : txt.replace(/^\s+|\s+$/g, "").split(/\s+/).length;
          rec.text = txt.substring(0, 60);
        } catch (_eT) {}
      }
      try {
        rec.missingFootage = !!(L.source && L.source.footageMissing);
      } catch (_eM) {}
      var props = [];
      __aeAnimatedProps(L, props, 0);
      for (var pi = 0; pi < props.length; pi++) {
        var P = props[pi];
        if (P.numKeys < 2) continue;
        var lin = 0;
        for (var k = 1; k < P.numKeys; k++) {
          if (P.keyOutInterpolationType(k) === KeyframeInterpolationType.LINEAR && P.keyInInterpolationType(k + 1) === KeyframeInterpolationType.LINEAR) lin++;
        }
        if (lin) rec.linear.push({ property: __aePropPath(P), matchName: String(P.matchName), segments: lin, of: P.numKeys - 1 });
      }
      var collectExpr = function (group, depth) {
        if (depth > 12) return;
        for (var i = 1; i <= group.numProperties; i++) {
          var q = group.property(i);
          if (!q) continue;
          if (q.propertyType === PropertyType.PROPERTY) {
            try {
              if (q.expressionEnabled && q.expressionError) rec.expressionErrors.push({ property: __aePropPath(q), error: String(q.expressionError).substring(0, 160) });
            } catch (_eE) {}
          } else collectExpr(q, depth + 1);
        }
      };
      collectExpr(L, 0);
      try {
        var fx = L.property("ADBE Effect Parade");
        for (var e = 1; fx && e <= fx.numProperties; e++) rec.effects.push(String(fx.property(e).matchName));
      } catch (_eFx) {}
      layersAu.push(rec);
    }
    return { compName: compAu.name, width: compAu.width, height: compAu.height, duration: compAu.duration, frameRate: compAu.frameRate, bitsPerChannel: app.project.bitsPerChannel, layers: layersAu };
  }


  if (action === "ae.recipe.lowerThird") {
    var w = params.width || 1920, h = params.height || 1080, dur = params.duration || 5, fps = params.frameRate || 30;
    var u = Math.min(w, h) / 1080;
    var C = params.colors, F = params.fonts;
    var comp = __aeRecipeComp(params.compName || "Lower Third", w, h, dur, fps);
    var x0 = Math.round(w * 0.08);
    var yName = Math.round(h * (h > w ? 0.68 : 0.78));
    var nameSize = Math.round(64 * u * (params.scale || 1)), roleSize = Math.round(38 * u * (params.scale || 1));
    var pad = Math.round(26 * u * (params.scale || 1)), barW = Math.round(10 * u * (params.scale || 1));
    var settle = 1.0;
    var caixa = __aeRecipeRect(comp, "Caixa", C.superficie, 92);
    var barra = __aeRecipeRect(comp, "Barra", C.destaque, 100);
    var role = __aeRecipeText(comp, "Funcao", params.role || "Fun\u00E7\u00E3o", F.corpo, roleSize, C.textoSecundario, "left");
    var nm = __aeRecipeText(comp, "Nome", params.name || "Nome Sobrenome", F.titulo, nameSize, C.texto, "left");
    var tx = x0 + barW + pad;
    var yRole = yName + Math.round(roleSize * 1.45);
    var texts = [[nm.layer, yName, 0.35], [role.layer, yRole, 0.45]];
    for (var ti = 0; ti < texts.length; ti++) {
      var T = texts[ti][0], ty = texts[ti][1], t0 = texts[ti][2];
      var pos = T.property("ADBE Transform Group").property("ADBE Position");
      // Enter from the right so the text stays inside the opening box; leave by fading only.
      __aeRecipeKeys(pos, [[t0, [tx + 24 * u, ty]], [t0 + 0.45, [tx, ty]]], 85);
      var op = T.property("ADBE Transform Group").property("ADBE Opacity");
      __aeRecipeKeys(op, [[t0, 0], [t0 + 0.3, 100], [dur - 0.5, 100], [dur - 0.25, 0]], 60);
    }
    var geom =
      "var a=thisComp.layer(\"Nome\"), b=thisComp.layer(\"Funcao\"), T=" + settle + ", pad=" + pad + ";\n" +
      "var ra=a.sourceRectAtTime(T,false), rb=b.sourceRectAtTime(T,false);\n" +
      "var p1=a.toComp([ra.left,ra.top],T), p2=b.toComp([rb.left,rb.top+rb.height],T);\n" +
      "var p3=a.toComp([ra.left+ra.width,0],T), p4=b.toComp([rb.left+rb.width,0],T);\n" +
      "var L=p1[0]-pad, Tp=p1[1]-pad, W=Math.max(p3[0],p4[0])-p1[0]+pad*2, H=p2[1]-p1[1]+pad*2;\n" +
      "var r=effect(\"Revelar\")(1)/100;\n";
    var sCx = __aeRecipeSlider(caixa, "Revelar");
    __aeRecipeKeys(sCx, [[0.15, 0], [0.65, 100], [dur - 0.45, 100], [dur - 0.1, 0]], 85);
    __aeRectProp(caixa, "ADBE Vector Rect Size").expression = geom + "[W*r, H]";
    __aeRectProp(caixa, "ADBE Vector Rect Position").expression = geom + "[L + W*r/2, Tp + H/2]";
    var sBr = __aeRecipeSlider(barra, "Revelar");
    __aeRecipeKeys(sBr, [[0, 0], [0.4, 100], [dur - 0.3, 100], [dur, 0]], 85);
    __aeRectProp(barra, "ADBE Vector Rect Size").expression = geom + "[" + barW + ", H*r]";
    __aeRectProp(barra, "ADBE Vector Rect Position").expression = geom + "[L - " + barW / 2 + ", Tp + H*r/2]";
    var errs = [];
    var chk = [__aeRectProp(caixa, "ADBE Vector Rect Size"), __aeRectProp(barra, "ADBE Vector Rect Size")];
    for (var ce = 0; ce < chk.length; ce++) if (chk[ce].expressionError) errs.push(String(chk[ce].expressionError).substring(0, 160));
    comp.openInViewer();
    return { compName: comp.name, width: w, height: h, duration: dur, layers: ["Nome", "Funcao", "Barra", "Caixa"], fonts: { titulo: nm.fontApplied, corpo: role.fontApplied }, expressionErrors: errs, mogrtFields: [{ layerName: "Nome", name: "Nome" }, { layerName: "Funcao", name: "Funcao" }] };
  }

  if (action === "ae.recipe.titleCard") {
    var w2 = params.width || 1920, h2 = params.height || 1080, dur2 = params.duration || 4, fps2 = params.frameRate || 30;
    var u2 = Math.min(w2, h2) / 1080;
    var C2 = params.colors, F2 = params.fonts;
    var comp2 = __aeRecipeComp(params.compName || "Titulo", w2, h2, dur2, fps2);
    if (params.background !== false) {
      var bg = comp2.layers.addSolid(C2.fundo, "Fundo", w2, h2, 1, dur2);
      bg.locked = true;
    }
    var cx = w2 / 2, cy = h2 / 2;
    var titleSize = Math.round((params.titleSize || 110) * u2), kickerSize = Math.round(34 * u2);
    var title = __aeRecipeText(comp2, "Titulo", params.title || "T\u00EDtulo", F2.titulo, titleSize, C2.texto, "center");
    var kicker = __aeRecipeText(comp2, "Chamada", (params.kicker || "").toUpperCase() || " ", F2.rotulo, kickerSize, C2.destaque, "center", 120);
    title.layer.property("ADBE Transform Group").property("ADBE Position").setValue([cx, cy + titleSize * 0.35]);
    kicker.layer.property("ADBE Transform Group").property("ADBE Position").setValue([cx, cy - titleSize * 0.75]);
    // Title: words rise and fade in, one after the other.
    var anim = title.layer.property("ADBE Text Properties").property("ADBE Text Animators").addProperty("ADBE Text Animator");
    anim.name = "Entrada";
    var ap = anim.property("ADBE Text Animator Properties");
    ap.addProperty("ADBE Text Position 3D").setValue([0, 40 * u2, 0]);
    ap.addProperty("ADBE Text Opacity").setValue(0);
    var sel = anim.property("ADBE Text Selectors").addProperty("ADBE Text Selector");
    try {
      sel.property("ADBE Text Range Advanced").property("ADBE Text Range Type2").setValue(3);
      sel.property("ADBE Text Range Advanced").property("ADBE Text Range Shape").setValue(2);
      sel.property("ADBE Text Range Advanced").property("ADBE Text Levels Min Ease").setValue(60);
    } catch (_eSel) {}
    var off = sel.property("ADBE Text Percent Offset");
    __aeRecipeKeys(off, [[0.3, -100], [1.3, 100]], 75);
    var kop = kicker.layer.property("ADBE Transform Group").property("ADBE Opacity");
    __aeRecipeKeys(kop, [[0.1, 0], [0.5, 100], [dur2 - 0.4, 100], [dur2 - 0.1, 0]], 60);
    var top = title.layer.property("ADBE Transform Group").property("ADBE Opacity");
    __aeRecipeKeys(top, [[dur2 - 0.4, 100], [dur2 - 0.1, 0]], 60);
    var line = __aeRecipeRect(comp2, "Linha", C2.destaque, 100);
    var sLn = __aeRecipeSlider(line, "Revelar");
    __aeRecipeKeys(sLn, [[0.2, 0], [0.9, 100], [dur2 - 0.4, 100], [dur2 - 0.1, 0]], 85);
    var lineW = Math.round(160 * u2), lineH = Math.max(3, Math.round(6 * u2));
    __aeRectProp(line, "ADBE Vector Rect Size").expression = "var r=effect(\"Revelar\")(1)/100; [" + lineW + "*r, " + lineH + "]";
    __aeRectProp(line, "ADBE Vector Rect Position").setValue([cx, cy + titleSize * 0.75]);
    comp2.openInViewer();
    return { compName: comp2.name, width: w2, height: h2, duration: dur2, layers: ["Chamada", "Titulo", "Linha"], fonts: { titulo: title.fontApplied, rotulo: kicker.fontApplied }, mogrtFields: [{ layerName: "Titulo", name: "Titulo" }, { layerName: "Chamada", name: "Chamada" }] };
  }

  if (action === "ae.recipe.counter") {
    var w3 = params.width || 1080, h3 = params.height || 1080, dur3 = params.duration || 4, fps3 = params.frameRate || 30;
    var u3 = Math.min(w3, h3) / 1080;
    var C3 = params.colors, F3 = params.fonts;
    var comp3 = __aeRecipeComp(params.compName || "Contador", w3, h3, dur3, fps3);
    if (params.background !== false) {
      var bg3 = comp3.layers.addSolid(C3.fundo, "Fundo", w3, h3, 1, dur3);
      bg3.locked = true;
    }
    var label = __aeRecipeText(comp3, "Legenda", params.label || " ", F3.corpo, Math.round(44 * u3), C3.textoSecundario, "center");
    var num = __aeRecipeText(comp3, "Numero", "0", F3.titulo, Math.round((params.numberSize || 220) * u3), C3.destaque, "center");
    num.layer.property("ADBE Transform Group").property("ADBE Position").setValue([w3 / 2, h3 / 2 + 60 * u3]);
    label.layer.property("ADBE Transform Group").property("ADBE Position").setValue([w3 / 2, h3 / 2 + 150 * u3]);
    var ctl = num.layer.property("ADBE Effect Parade").addProperty("ADBE Slider Control");
    ctl.name = "Valor";
    var val = num.layer.property("ADBE Effect Parade").property("Valor").property(1);
    var to = Number(params.to || 100), from = Number(params.from || 0), runEnd = Math.min(dur3 - 0.8, params.countSeconds || 2.2);
    __aeRecipeKeys(val, [[0.2, from], [runEnd, to]], 90);
    var dec = params.decimals || 0;
    var sepT = params.thousands === undefined ? "." : String(params.thousands);
    var sepD = params.decimal === undefined ? "," : String(params.decimal);
    num.layer.property("ADBE Text Properties").property("ADBE Text Document").expression =
      "var v=Number(effect(\"Valor\")(1).value); var d=" + dec + "; var s=v.toFixed(d).split('.');\n" +
      "var i=s[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g, " + JSON.stringify(sepT) + ");\n" +
      JSON.stringify(String(params.prefix || "")) + " + i + (d>0 ? " + JSON.stringify(sepD) + " + s[1] : '') + " + JSON.stringify(String(params.suffix || ""));
    var lop = label.layer.property("ADBE Transform Group").property("ADBE Opacity");
    __aeRecipeKeys(lop, [[runEnd - 0.4, 0], [runEnd, 100]], 60);
    var nsc = num.layer.property("ADBE Transform Group").property("ADBE Scale");
    __aeRecipeKeys(nsc, [[0, [85, 85, 100]], [0.5, [100, 100, 100]]], 85);
    var exprErr = "";
    try {
      exprErr = String(num.layer.property("ADBE Text Properties").property("ADBE Text Document").expressionError || "");
    } catch (_eX) {}
    comp3.openInViewer();
    return { compName: comp3.name, width: w3, height: h3, duration: dur3, layers: ["Numero", "Legenda"], expressionError: exprErr, mogrtFields: [{ layerName: "Legenda", name: "Legenda" }, { layerName: "Numero", name: "Valor", propertyPath: ["ADBE Effect Parade", "Valor", "ADBE Slider Control-0001"] }] };
  }

  if (action === "ae.recipe.logoReveal") {
    var lf = new File(params.logoPath);
    if (!lf.exists) throw new Error("Logo not found: " + params.logoPath);
    var w4 = params.width || 1920, h4 = params.height || 1080, dur4 = params.duration || 3, fps4 = params.frameRate || 30;
    var C4 = params.colors;
    var comp4 = __aeRecipeComp(params.compName || "Logo Reveal", w4, h4, dur4, fps4);
    if (params.background !== false) {
      var bg4 = comp4.layers.addSolid(C4.fundo, "Fundo", w4, h4, 1, dur4);
      bg4.locked = true;
    }
    var io = new ImportOptions(lf);
    var foot = app.project.importFile(io);
    var cx4 = w4 / 2, cy4 = h4 / 2;
    var circle = comp4.layers.addShape();
    circle.name = "Circulo";
    var cg = circle.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
    var cv = cg.property("ADBE Vectors Group");
    var el = cv.addProperty("ADBE Vector Shape - Ellipse");
    var cf = cv.addProperty("ADBE Vector Graphic - Fill");
    cf.property("ADBE Vector Fill Color").setValue(C4.destaque);
    var diam = Math.round(Math.min(w4, h4) * 0.55);
    // Adding the fill invalidated `el`: read the ellipse again by index.
    circle.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group").property(1).property("ADBE Vector Ellipse Size").setValue([diam, diam]);
    circle.property("ADBE Transform Group").property("ADBE Position").setValue([cx4, cy4]);
    __aeRecipeKeys(circle.property("ADBE Transform Group").property("ADBE Scale"), [[0, [0, 0, 100]], [0.6, [100, 100, 100]]], 85);
    __aeRecipeKeys(circle.property("ADBE Transform Group").property("ADBE Opacity"), [[0.6, 100], [1.2, params.keepCircle ? 100 : 0]], 60);
    var logo = comp4.layers.add(foot);
    logo.name = "Logo";
    var fitW = (params.logoWidthPct || 40) / 100 * w4;
    var fitH = 0.5 * h4;
    var k = Math.min(fitW / foot.width, fitH / foot.height) * 100;
    logo.property("ADBE Transform Group").property("ADBE Position").setValue([cx4, cy4]);
    __aeRecipeKeys(logo.property("ADBE Transform Group").property("ADBE Scale"), [[0.35, [k * 0.82, k * 0.82, 100]], [1.1, [k, k, 100]]], 85);
    __aeRecipeKeys(logo.property("ADBE Transform Group").property("ADBE Opacity"), [[0.35, 0], [0.7, 100]], 60);
    try {
      logo.motionBlur = true;
      comp4.motionBlur = true;
    } catch (_eMb) {}
    comp4.openInViewer();
    return { compName: comp4.name, width: w4, height: h4, duration: dur4, layers: ["Logo", "Circulo"], logoScale: Math.round(k * 10) / 10, note: "The logo holds still from 1.1 s to the end (\u2265 1 s)." };
  }

  if (action === "ae.recipe.transition") {
    // Transition kit: scene A (precomp) -> scene B (precomp) with one of five moves in the brand colours.
    // Replace the content of the two precomps (or use the comp as a template); the move stays.
    var w6 = params.width || 1920, h6 = params.height || 1080, fps6 = params.frameRate || 30;
    var td6 = params.transitionSeconds || 0.8;
    var dur6 = params.duration || Math.max(2, td6 + 2);
    var t0 = Math.max(0.2, (dur6 - td6) / 2), t1 = t0 + td6, tm = (t0 + t1) / 2;
    var C6 = params.colors, F6 = params.fonts;
    var style6 = params.style || "wipe";
    var name6 = params.compName || "Transicao " + style6;
    var font6 = "";
    var makeScene = function (label, color, textColor) {
      var sc = app.project.items.addComp(name6 + " - Cena " + label, w6, h6, 1, dur6, fps6);
      sc.layers.addSolid(color, "Placeholder " + label, w6, h6, 1, dur6);
      var tx = __aeRecipeText(sc, "Rotulo " + label, "CENA " + label, F6.titulo, Math.round(Math.min(w6, h6) * 0.12), textColor, "center", 80);
      tx.layer.property("ADBE Transform Group").property("ADBE Position").setValue([w6 / 2, h6 / 2 + Math.min(w6, h6) * 0.04]);
      font6 = tx.fontApplied;
      return sc;
    };
    var sceneA = makeScene("A", C6.superficie, C6.texto);
    var sceneB = makeScene("B", C6.fundo, C6.destaque);
    var comp6 = __aeRecipeComp(name6, w6, h6, dur6, fps6);
    var LB6 = comp6.layers.add(sceneB);
    LB6.name = "Cena B";
    var LA6 = comp6.layers.add(sceneA);
    LA6.name = "Cena A";
    var pA = LA6.property("ADBE Transform Group"), pB = LB6.property("ADBE Transform Group");
    var cx6 = w6 / 2, cy6 = h6 / 2;
    var layers6 = ["Cena A", "Cena B"];
    var cover = null;
    if (style6 === "push") {
      __aeRecipeKeys(pA.property("ADBE Position"), [[t0, [cx6, cy6]], [t1, [cx6 - w6, cy6]]], 90);
      __aeRecipeKeys(pB.property("ADBE Position"), [[t0, [cx6 + w6, cy6]], [t1, [cx6, cy6]]], 90);
    } else if (style6 === "zoom") {
      __aeRecipeKeys(pA.property("ADBE Scale"), [[t0, [100, 100, 100]], [tm, [150, 150, 100]]], 85);
      __aeRecipeKeys(pA.property("ADBE Opacity"), [[tm - td6 * 0.15, 100], [tm, 0]], 50);
      __aeRecipeKeys(pB.property("ADBE Scale"), [[tm, [70, 70, 100]], [t1, [100, 100, 100]]], 85);
      __aeRecipeKeys(pB.property("ADBE Opacity"), [[tm - td6 * 0.15, 0], [tm, 100]], 50);
      var blur = LA6.property("ADBE Effect Parade").addProperty("ADBE Gaussian Blur 2");
      __aeRecipeKeys(blur.property(1), [[t0, 0], [tm, Math.round(Math.min(w6, h6) * 0.03)]], 60);
    } else if (style6 === "fade") {
      __aeRecipeKeys(pA.property("ADBE Opacity"), [[t0, 100], [t1, 0]], 40);
    } else {
      // wipe (a brand-colour band crosses the frame) and circle (a brand-colour circle covers, then uncovers)
      cover = comp6.layers.addShape();
      cover.name = style6 === "circle" ? "Circulo" : "Faixa";
      var vg = cover.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
      var vv = vg.property("ADBE Vectors Group");
      var diag = Math.ceil(Math.sqrt(w6 * w6 + h6 * h6)) + 8;
      if (style6 === "circle") vv.addProperty("ADBE Vector Shape - Ellipse");
      else vv.addProperty("ADBE Vector Shape - Rect");
      vv.addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue(C6.destaque);
      var shapeP = cover.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group").property(1);
      var ct = cover.property("ADBE Transform Group");
      if (style6 === "circle") {
        shapeP.property("ADBE Vector Ellipse Size").setValue([diag, diag]);
        ct.property("ADBE Position").setValue([cx6, cy6]);
        __aeRecipeKeys(ct.property("ADBE Scale"), [[t0, [0, 0, 100]], [tm, [100, 100, 100]], [t1, [0, 0, 100]]], 85);
      } else {
        var bandW = Math.round(w6 * 1.15);
        shapeP.property("ADBE Vector Rect Size").setValue([bandW, h6 * 1.5]);
        ct.property("ADBE Rotation").setValue(params.angle === undefined ? 12 : params.angle);
        __aeRecipeKeys(ct.property("ADBE Position"), [[t0, [-bandW / 2 - w6 * 0.1, cy6]], [tm, [cx6, cy6]], [t1, [w6 + bandW / 2 + w6 * 0.1, cy6]]], 88);
      }
      LA6.outPoint = tm;
      layers6.push(cover.name);
    }
    try {
      comp6.motionBlur = true;
      LA6.motionBlur = true;
      LB6.motionBlur = true;
      if (cover) cover.motionBlur = true;
    } catch (_eMb6) {}
    var mk6 = comp6.markerProperty;
    try {
      mk6.setValueAtTime(t0, new MarkerValue("Transicao inicio"));
      mk6.setValueAtTime(t1, new MarkerValue("Transicao fim"));
    } catch (_eMk6) {}
    comp6.openInViewer();
    return {
      compName: comp6.name,
      width: w6,
      height: h6,
      duration: dur6,
      style: style6,
      transition: { start: Math.round(t0 * 100) / 100, end: Math.round(t1 * 100) / 100 },
      layers: layers6,
      placeholders: [sceneA.name, sceneB.name],
      fonts: { titulo: font6 },
      note: "Replace the content of the two scene precomps (or drop the comp between two clips). The move uses strong eases and motion blur."
    };
  }

  if (action === "ae.anim.setExpression") {
    var compEx = __aeFindComp(params.compName, params.compIndex);
    var lyrEx = __aeFindLayer(compEx, params.layerIndex, params.layerName);
    var propEx = __aeResolveProperty(lyrEx, params.propertyPath);
    if (!propEx.canSetExpression) {
      throw new Error("Property '" + propEx.name + "' does not support expressions.");
    }
    propEx.expression = params.expression || "";
    if (typeof params.enabled === "boolean") {
      propEx.expressionEnabled = params.enabled;
    }
    return {
      compName: compEx.name,
      layerIndex: lyrEx.index,
      propertyName: propEx.name,
      expression: propEx.expression,
      expressionEnabled: propEx.expressionEnabled,
      expressionError: propEx.expressionError || ""
    };
  }

  if (action === "ae.effect.list") {
    return { aeVersion: String(app.version), effects: __aeEffectCatalog() };
  }

  if (action === "ae.effect.apply") {
    var compEf = __aeFindComp(params.compName, params.compIndex);
    var lyrEf = __aeFindLayer(compEf, params.layerIndex, params.layerName);
    var parade = lyrEf.property("ADBE Effect Parade");
    if (!parade) {
      throw new Error("Layer '" + lyrEf.name + "' does not accept effects.");
    }
    var effectMatch = __aeResolveEffectMatchName(parade, params.effectMatchNameOrName);
    var addedEf = parade.addProperty(effectMatch);
    if (params.effectCustomName) {
      addedEf.name = params.effectCustomName;
    }
    var ignoredProps = [];
    if (params.properties) {
      for (var pKey in params.properties) {
        if (Object.prototype.hasOwnProperty.call(params.properties, pKey)) {
          var subP = __aeFindChildProperty(addedEf, pKey);
          if (subP && typeof subP.setValue === "function") {
            try {
              subP.setValue(params.properties[pKey]);
            } catch (eSet) {
              ignoredProps.push({ key: pKey, reason: String(eSet.message || eSet) });
            }
          } else {
            ignoredProps.push({ key: pKey, reason: "parameter not found on this effect" });
          }
        }
      }
    }
    var described = __aeDescribeEffect(addedEf);
    described.compName = compEf.name;
    described.layerIndex = lyrEf.index;
    described.layerId = __aeLayerId(lyrEf);
    described.ignoredProperties = ignoredProps;
    return described;
  }

  if (action === "ae.effect.manage") {
    var compEm = __aeFindComp(params.compName, params.compIndex);
    var lyrEm = __aeFindLayer(compEm, params.layerIndex, params.layerName);
    var paradeEm = lyrEm.property("ADBE Effect Parade");
    var opEm = params.operation || "list";
    if (opEm === "list") {
      var listed = [];
      for (var le = 1; le <= paradeEm.numProperties; le++) {
        listed.push(params.includeParameters === true ? __aeDescribeEffect(paradeEm.property(le)) : {
          index: le,
          name: String(paradeEm.property(le).name),
          matchName: String(paradeEm.property(le).matchName),
          enabled: paradeEm.property(le).enabled
        });
      }
      return { compName: compEm.name, layerIndex: lyrEm.index, layerId: __aeLayerId(lyrEm), effects: listed };
    }
    var targetEf = null;
    if (typeof params.effectIndex === "number") {
      targetEf = paradeEm.property(params.effectIndex);
    } else if (params.effectName) {
      targetEf = __aeFindChildProperty(paradeEm, params.effectName);
    }
    if (!targetEf) {
      throw new Error("Effect not found on layer '" + lyrEm.name + "' (effectIndex=" + String(params.effectIndex || "") + ", effectName=" + String(params.effectName || "") + "). Use operation 'list'.");
    }
    if (opEm === "describe") {
      return __aeDescribeEffect(targetEf);
    }
    if (opEm === "remove") {
      var removedName = String(targetEf.name);
      targetEf.remove();
      return { removed: true, effectName: removedName };
    }
    if (opEm === "enable" || opEm === "disable") {
      targetEf.enabled = opEm === "enable";
      return { effectName: String(targetEf.name), enabled: targetEf.enabled };
    }
    if (opEm === "rename") {
      targetEf.name = String(params.newName || targetEf.name);
      return { effectName: String(targetEf.name) };
    }
    if (opEm === "duplicate") {
      var dupEf = targetEf.duplicate();
      if (params.newName) dupEf.name = String(params.newName);
      return __aeDescribeEffect(dupEf);
    }
    if (opEm === "move") {
      targetEf.moveTo(params.newIndex);
      return { effectName: String(targetEf.name), index: targetEf.propertyIndex };
    }
    throw new Error("Unknown effect operation: " + opEm);
  }

  if (action === "ae.preset.list") {
    var roots = __aePresetRoots(params.folders || []);
    var found = [];
    var limitPr = params.limit || 2000;
    for (var r = 0; r < roots.length && found.length < limitPr; r++) {
      __aeCollectPresets(roots[r], 0, params.maxDepth || 6, found, limitPr);
    }
    var rootNames = [];
    for (var rn = 0; rn < roots.length; rn++) rootNames.push(roots[rn].fsName);
    return { roots: rootNames, count: found.length, truncated: found.length >= limitPr, presets: found };
  }

  if (action === "ae.mogrt.export") {
    // Exposes properties in the Essential Graphics panel and exports a .mogrt for Premiere.
    var compMg = __aeFindComp(params.compName, params.compIndex);
    var props = params.properties || [];
    var added = [];
    // Controllers already in Essential Graphics (a re-export must not add duplicates).
    var existing = {};
    try {
      for (var ec = 1; ec <= compMg.motionGraphicsTemplateControllerCount; ec++) existing[compMg.getMotionGraphicsTemplateControllerName(ec)] = true;
    } catch (_eEx) {}
    for (var pi = 0; pi < props.length; pi++) {
      var spec = props[pi];
      var lyr = __aeFindLayer(compMg, spec.layerIndex, spec.layerName);
      var path = spec.propertyPath && spec.propertyPath.length ? spec.propertyPath : ["ADBE Text Properties", "ADBE Text Document"];
      var prop = __aeResolveProperty(lyr, path);
      var label = spec.name || lyr.name;
      // Read names first: adding to Essential Graphics invalidates the property reference.
      var layerNameMg = lyr.name;
      var propNameMg = prop.name;
      var okAdd;
      if (existing[label]) {
        added.push({ name: label, layer: layerNameMg, property: propNameMg, already: true });
        continue;
      }
      if (typeof prop.addToMotionGraphicsTemplateAs === "function") okAdd = prop.addToMotionGraphicsTemplateAs(compMg, label);
      else okAdd = prop.addToMotionGraphicsTemplate(compMg);
      if (!okAdd) {
        __mcpFail(
          "INVALID_PARAMS",
          "'" + label + "' (" + layerNameMg + " > " + path.join(" > ") + ") cannot go into Essential Graphics: only text, colour, " +
            "checkbox, slider, angle, point and dropdown properties can (canAddToMotionGraphicsTemplate)."
        );
      }
      added.push({ name: label, layer: layerNameMg, property: propNameMg });
    }
    if (params.templateName) compMg.motionGraphicsTemplateName = String(params.templateName);
    var outMg = __mcpPrepareOutputFile(params.outputPath);
    // After Effects stops the export with modal dialogs the script cannot answer (16/11/2026, fluxo A):
    // "The project needs to be saved first" and "fonts were not synced from Adobe". Clear both before exporting.
    var mgFonts = __aeMogrtFontCheck(compMg);
    if (mgFonts.local.length && params.allowLocalFonts !== true) {
      __mcpFail(
        "MOGRT_LOCAL_FONTS",
        "Fonts not from Adobe Fonts in this comp: " + mgFonts.local.join(", ") + ". After Effects would stop the export with a " +
          "confirmation dialog. Use Adobe Fonts in the brand kit, or pass allowLocalFonts: true and click OK in After Effects " +
          "(Premiere will flag the template as needing those fonts)."
      );
    }
    if (!app.project.file) {
      __mcpFail("PROJECT_NOT_SAVED", "Save the project once (ae_manage_project operation 'save' with filePath) before exporting a .mogrt.");
    }
    if (app.project.dirty) app.project.save();
    // The export invalidates object references (14/11: "Object is invalid" right after it): read first.
    var tplName = String(compMg.motionGraphicsTemplateName || compMg.name);
    var ctrlCount = compMg.motionGraphicsTemplateControllerCount;
    // exportAsMotionGraphicsTemplate takes a FOLDER and names the file after the template
    // (passing "x.mogrt" created a folder "x.mogrt"): export to the parent, then rename.
    var folderMg = outMg.parent;
    var producedMg = new File(folderMg.fsName + "/" + tplName + ".mogrt");
    if (typeof __mcpCloseUndoGroup === "function") __mcpCloseUndoGroup();
    var exported = compMg.exportAsMotionGraphicsTemplate(true, folderMg.fsName);
    if (producedMg.exists && producedMg.fsName.toLowerCase() !== outMg.fsName.toLowerCase()) {
      var targetMg = new File(outMg.fsName);
      if (targetMg.exists) targetMg.remove();
      producedMg.rename(outMg.name);
    }
    var fileMg = new File(outMg.fsName);
    if (!exported || !fileMg.exists) {
      __mcpFail("EXPORT_FAILED", "After Effects did not write " + outMg.fsName + ". Save the project first and check the comp has Essential Graphics properties.");
    }
    return {
      exported: true,
      outputPath: fileMg.fsName,
      bytes: fileMg.length,
      templateName: tplName,
      controllers: added,
      controllerCount: ctrlCount
    };
  }

  if (action === "ae.preset.apply") {
    var compPa = __aeFindComp(params.compName, params.compIndex);
    var lyrPa = __aeFindLayer(compPa, params.layerIndex, params.layerName);
    var presetFile = null;
    if (params.presetPath) {
      presetFile = new File(params.presetPath);
    } else if (params.presetName) {
      var candidates = [];
      var proots = __aePresetRoots(params.folders || []);
      for (var pr = 0; pr < proots.length; pr++) {
        __aeCollectPresets(proots[pr], 0, 6, candidates, 5000);
      }
      var wantPreset = String(params.presetName).toLowerCase().replace(/\.ffx$/, "");
      for (var pc = 0; pc < candidates.length; pc++) {
        if (candidates[pc].name.toLowerCase() === wantPreset) {
          presetFile = new File(candidates[pc].path);
          break;
        }
      }
    }
    if (!presetFile || !presetFile.exists) {
      throw new Error("Preset not found (" + String(params.presetPath || params.presetName) + "). Use ae_list_presets to get the full path.");
    }
    var effectsBefore = lyrPa.property("ADBE Effect Parade") ? lyrPa.property("ADBE Effect Parade").numProperties : 0;
    for (var sl = 1; sl <= compPa.numLayers; sl++) {
      compPa.layer(sl).selected = false;
    }
    lyrPa.selected = true;
    var textAnimBefore = __aeCountTextAnimators(lyrPa);
    // Presets place their keyframes at the current time indicator: move it first when asked.
    var prevTime = compPa.time;
    if (typeof params.time === "number") compPa.time = params.time;
    lyrPa.applyPreset(presetFile);
    var textAnimAfter = __aeCountTextAnimators(lyrPa);
    var effectsAfter = [];
    var paradePa = lyrPa.property("ADBE Effect Parade");
    if (paradePa) {
      for (var ea = 1; ea <= paradePa.numProperties; ea++) {
        effectsAfter.push({ index: ea, name: String(paradePa.property(ea).name), matchName: String(paradePa.property(ea).matchName) });
      }
    }
    return {
      applied: true,
      preset: presetFile.fsName,
      compName: compPa.name,
      layerIndex: lyrPa.index,
      layerId: __aeLayerId(lyrPa),
      appliedAt: compPa.time,
      previousTime: prevTime,
      effectsAdded: effectsAfter.length - effectsBefore,
      effects: effectsAfter,
      textAnimatorsAdded: textAnimAfter - textAnimBefore,
      keyframedProperties: __aeCountKeyed(lyrPa, 0)
    };
  }

  if (action === "ae.text.addAnimator") {
    var compTa = __aeFindComp(params.compName, params.compIndex);
    var lyrTa = __aeFindLayer(compTa, params.layerIndex, params.layerName);
    var textProps = lyrTa.property("ADBE Text Properties");
    if (!textProps) {
      throw new Error("Layer '" + lyrTa.name + "' is not a text layer.");
    }
    var animators = textProps.property("ADBE Text Animators");
    var animator = animators.addProperty("ADBE Text Animator");
    if (params.name) animator.name = String(params.name);
    var warnings = [];
    var animProps = animator.property("ADBE Text Animator Properties");
    var propMap = {
      position: "ADBE Text Position 3D",
      anchorPoint: "ADBE Text Anchor Point 3D",
      scale: "ADBE Text Scale 3D",
      skew: "ADBE Text Skew",
      rotation: "ADBE Text Rotation",
      opacity: "ADBE Text Opacity",
      fillColor: "ADBE Text Fill Color",
      strokeColor: "ADBE Text Stroke Color",
      tracking: "ADBE Text Tracking Amount",
      blur: "ADBE Text Blur"
    };
    var setProps = [];
    var values = params.properties || {};
    for (var key in values) {
      if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
      if (!propMap[key]) {
        warnings.push("Unknown animator property '" + key + "'.");
        continue;
      }
      try {
        var added = animProps.addProperty(propMap[key]);
        var v = values[key];
        if ((key === "position" || key === "anchorPoint" || key === "scale") && v instanceof Array && v.length === 2) {
          v = [v[0], v[1], key === "scale" ? 100 : 0];
        }
        added.setValue(v);
        setProps.push(key);
      } catch (eAp) {
        warnings.push(key + ": " + String(eAp.message || eAp));
      }
    }
    var selector = animator.property("ADBE Text Selectors").addProperty("ADBE Text Selector");
    var sel = params.selector || {};
    __aeTrySet(selector, ["ADBE Text Percent Start"], sel.start, warnings);
    __aeTrySet(selector, ["ADBE Text Percent End"], sel.end, warnings);
    __aeTrySet(selector, ["ADBE Text Percent Offset"], sel.offset, warnings);
    var basedOnMap = { characters: 1, charactersExcludingSpaces: 2, words: 3, lines: 4 };
    var shapeMap = { square: 1, rampUp: 2, rampDown: 3, triangle: 4, round: 5, smooth: 6 };
    if (sel.basedOn) __aeTrySet(selector, ["ADBE Text Range Advanced", "ADBE Text Range Type2"], basedOnMap[sel.basedOn], warnings);
    if (sel.shape) __aeTrySet(selector, ["ADBE Text Range Advanced", "ADBE Text Range Shape"], shapeMap[sel.shape], warnings);
    __aeTrySet(selector, ["ADBE Text Range Advanced", "ADBE Text Levels Max Ease"], sel.easeHigh, warnings);
    __aeTrySet(selector, ["ADBE Text Range Advanced", "ADBE Text Levels Min Ease"], sel.easeLow, warnings);
    if (typeof sel.randomizeOrder === "boolean") {
      __aeTrySet(selector, ["ADBE Text Range Advanced", "ADBE Text Randomize Order"], sel.randomizeOrder ? 1 : 0, warnings);
    }
    var anim = params.animate;
    if (anim && anim.property) {
      var animMatch = { start: "ADBE Text Percent Start", end: "ADBE Text Percent End", offset: "ADBE Text Percent Offset" }[anim.property];
      var animProp = selector.property(animMatch);
      if (animProp) {
        var t0 = typeof anim.startTime === "number" ? anim.startTime : lyrTa.inPoint;
        var t1 = t0 + (anim.duration || 1);
        animProp.setValueAtTime(t0, anim.from);
        animProp.setValueAtTime(t1, anim.to);
        if (anim.easing !== "linear") {
          var easeIn = [new KeyframeEase(0, anim.influence || 75)];
          var easeOut = [new KeyframeEase(0, anim.influence || 75)];
          animProp.setTemporalEaseAtKey(1, easeOut, easeOut);
          animProp.setTemporalEaseAtKey(2, easeIn, easeIn);
        }
      } else {
        warnings.push("Selector property '" + anim.property + "' not found for animation.");
      }
    }
    return {
      compName: compTa.name,
      layerIndex: lyrTa.index,
      layerId: __aeLayerId(lyrTa),
      animatorName: String(animator.name),
      animatorIndex: animator.propertyIndex,
      propertiesSet: setProps,
      warnings: warnings
    };
  }

  if (action === "ae.layer.addMask") {
    var compMk = __aeFindComp(params.compName, params.compIndex);
    var lyrMk = __aeFindLayer(compMk, params.layerIndex, params.layerName);
    var maskParade = lyrMk.property("ADBE Mask Parade");
    if (!maskParade) {
      throw new Error("Layer '" + lyrMk.name + "' does not accept masks.");
    }
    var mask = maskParade.addProperty("ADBE Mask Atom");
    if (params.name) mask.name = String(params.name);
    var shp = new Shape();
    var kind = params.shape || "rectangle";
    if (kind === "path") {
      if (!(params.vertices instanceof Array) || params.vertices.length < 2) {
        throw new Error("shape 'path' needs at least 2 vertices.");
      }
      shp.vertices = params.vertices;
      if (params.inTangents) shp.inTangents = params.inTangents;
      if (params.outTangents) shp.outTangents = params.outTangents;
      shp.closed = params.closed !== false;
    } else {
      var rect = params.rect || [0, 0, lyrMk.width || compMk.width, lyrMk.height || compMk.height];
      var x = rect[0], y = rect[1], w = rect[2], h = rect[3];
      if (kind === "ellipse") {
        var k = 0.5523;
        var cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2;
        shp.vertices = [[cx, y], [x + w, cy], [cx, y + h], [x, cy]];
        shp.inTangents = [[-rx * k, 0], [0, -ry * k], [rx * k, 0], [0, ry * k]];
        shp.outTangents = [[rx * k, 0], [0, ry * k], [-rx * k, 0], [0, -ry * k]];
      } else {
        shp.vertices = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
      }
      shp.closed = true;
    }
    mask.property("ADBE Mask Shape").setValue(shp);
    var modeMap = { none: "NONE", add: "ADD", subtract: "SUBTRACT", intersect: "INTERSECT", lighten: "LIGHTEN", darken: "DARKEN", difference: "DIFFERENCE" };
    if (params.mode && modeMap[params.mode]) mask.maskMode = MaskMode[modeMap[params.mode]];
    if (params.feather) mask.property("ADBE Mask Feather").setValue(params.feather instanceof Array ? params.feather : [params.feather, params.feather]);
    if (typeof params.expansion === "number") mask.property("ADBE Mask Offset").setValue(params.expansion);
    if (typeof params.opacity === "number") mask.property("ADBE Mask Opacity").setValue(params.opacity);
    if (typeof params.inverted === "boolean") mask.inverted = params.inverted;
    return {
      compName: compMk.name,
      layerIndex: lyrMk.index,
      layerId: __aeLayerId(lyrMk),
      maskName: String(mask.name),
      maskIndex: mask.propertyIndex,
      numMasks: maskParade.numProperties
    };
  }

  // 18/11/2026 — word-by-word animated captions: one text layer per block; the spoken word changes colour
  // (text animator + expression selector by word), words not yet said are dimmed, optional pill sized by
  // sourceRectAtTime and centred on the cap height, pop on entry, width limited to the safe area.
  if (action === "ae.captions.words") {
    var compW = __aeFindComp(params.compName, params.compIndex);
    var blocksW = params.blocks || [];
    var fontW = params.font || "Arial-BoldMT";
    var sizeW = params.fontSize || 84;
    var cxW = typeof params.x === "number" ? params.x : compW.width / 2;
    var byW = typeof params.y === "number" ? params.y : Math.round(compW.height * 0.72);
    var safeW = params.safeWidth || Math.round(compW.width * 0.88);
    var popAmp = typeof params.pop === "number" ? params.pop : 0.1;
    function mkTextW(str) {
      var l = compW.layers.addText(str);
      var p = l.property("ADBE Text Properties").property("ADBE Text Document");
      var d = p.value;
      d.resetCharStyle();
      d.font = fontW;
      d.fontSize = sizeW;
      d.fillColor = params.baseColor;
      d.applyFill = true;
      if (params.strokeWidth > 0) {
        d.applyStroke = true;
        d.strokeColor = params.strokeColor || [0, 0, 0];
        d.strokeWidth = params.strokeWidth;
        d.strokeOverFill = false;
      } else {
        d.applyStroke = false;
      }
      d.justification = ParagraphJustification.CENTER_JUSTIFY;
      d.tracking = params.tracking || 0;
      p.setValue(d);
      return l;
    }
    var probe = mkTextW("H");
    var capW = probe.sourceRectAtTime(0, false).height;
    probe.remove();
    var padX = typeof params.pillPadX === "number" ? params.pillPadX : Math.round(sizeW * 0.42);
    var padY = typeof params.pillPadY === "number" ? params.pillPadY : Math.round(sizeW * 0.36);
    // 18/11/2026: one layer for the whole video (singleLayer). Source Text picks the block by time and the
    // selectors read the word times of the block on screen, so the style is edited in ONE place.
    if (params.singleLayer && blocksW.length) {
      var tx = [], bS = [], bE = [], wS = [];
      for (var sb = 0; sb < blocksW.length; sb++) {
        tx.push('"' + String(blocksW[sb].text).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r|\n/g, "\\r") + '"');
        bS.push(blocksW[sb].start);
        bE.push(blocksW[sb].end);
        var ws1 = [];
        for (var sw = 0; sw < blocksW[sb].words.length; sw++) ws1.push(blocksW[sb].words[sw].s);
        wS.push("[" + ws1.join(",") + "]");
      }
      var headS = "var S=[" + bS.join(",") + "],E=[" + bE.join(",") + "];var b=-1;for(var k=0;k<S.length;k++){if(time>=S[k]&&time<E[k]){b=k;}}";
      var one = mkTextW(blocksW[0].text);
      one.name = "Legendas (camada unica)";
      one.inPoint = Math.max(0, blocksW[0].start);
      one.outPoint = Math.min(compW.duration, blocksW[blocksW.length - 1].end);
      one.motionBlur = true;
      var trO = one.property("ADBE Transform Group");
      trO.property("ADBE Anchor Point").setValue([0, -capW / 2]);
      trO.property("ADBE Position").setValue([cxW, byW - capW / 2]);
      one.property("ADBE Text Properties").property("ADBE Text Document").expression = headS + "var X=[" + tx.join(",") + "];(b<0)?\"\":X[b];";
      var animsO = one.property("ADBE Text Properties").property("ADBE Text Animators");
      var wordHead = headS + "var W=[" + wS.join(",") + "];var a=0;if(b>=0){var s=W[b];var i=Math.min(Math.max(Math.round(textIndex)-1,0),s.length-1);var e=(i+1<s.length)?s[i+1]:E[b]+10;";
      var o1 = animsO.addProperty("ADBE Text Animator");
      o1.name = "Palavra falada";
      o1.property("ADBE Text Animator Properties").addProperty("ADBE Text Fill Color").setValue([params.activeColor[0], params.activeColor[1], params.activeColor[2], 1]);
      if (params.wordScale && params.wordScale !== 100) {
        o1.property("ADBE Text Animator Properties").addProperty("ADBE Text Scale 3D").setValue([params.wordScale, params.wordScale, 100]);
      }
      var os1 = o1.property("ADBE Text Selectors").addProperty("ADBE Text Expressible Selector");
      os1.property("ADBE Text Range Type2").setValue(3);
      os1.property("ADBE Text Expressible Amount").expression = wordHead + "a=(time>=s[i]&&time<e)?100:0;}a;";
      if (typeof params.futureOpacity === "number" && params.futureOpacity < 100) {
        var o2 = animsO.addProperty("ADBE Text Animator");
        o2.name = "Ainda nao dita";
        o2.property("ADBE Text Animator Properties").addProperty("ADBE Text Opacity").setValue(params.futureOpacity);
        var os2 = o2.property("ADBE Text Selectors").addProperty("ADBE Text Expressible Selector");
        os2.property("ADBE Text Range Type2").setValue(3);
        os2.property("ADBE Text Expressible Amount").expression = wordHead + "a=(time<s[i])?100:0;}a;";
      }
      var popO = headS + "var v=100;if(b>=0){var t=time-S[b];var d=0.32;if(t<d){var p=Math.max(t,0)/d;var q=1-Math.pow(1-p,3);v=100*(q+Math.sin(p*Math.PI)*" + popAmp + ");}}";
      trO.property("ADBE Scale").expression = popO + "var r=sourceRectAtTime(time,false);var kf=Math.min(1," + safeW + "/Math.max(r.width,1));[v*kf,v*kf];";
      if (params.shadow) {
        try {
          var dsO = one.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");
          dsO.property(2).setValue(55);
          dsO.property(3).setValue(180);
          dsO.property(4).setValue(6);
          dsO.property(5).setValue(24);
        } catch (_eShO) {}
      }
      if (params.pillColor) {
        var shO = compW.layers.addShape();
        shO.name = "Legendas fundo";
        var gO = shO.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
        var rcO = gO.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
        rcO.property("ADBE Vector Rect Size").expression = 'var r=thisComp.layer("' + one.name + '").sourceRectAtTime(time,false);(r.width<1)?[0,0]:[r.width+' + padX * 2 + "," + (capW + padY * 2) + "];";
        rcO.property("ADBE Vector Rect Roundness").setValue(typeof params.pillRadius === "number" ? params.pillRadius : Math.round((capW + padY * 2) * 0.28));
        var flO = gO.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
        flO.property("ADBE Vector Fill Color").setValue([params.pillColor[0], params.pillColor[1], params.pillColor[2], 1]);
        var trSO = shO.property("ADBE Transform Group");
        trSO.property("ADBE Position").setValue([cxW, byW - capW / 2]);
        trSO.property("ADBE Scale").expression = popO + 'var r=thisComp.layer("' + one.name + '").sourceRectAtTime(time,false);var kf=Math.min(1,' + safeW + "/Math.max(r.width,1));[v*kf,v*kf];";
        if (typeof params.pillOpacity === "number") trSO.property("ADBE Opacity").setValue(params.pillOpacity);
        shO.inPoint = one.inPoint;
        shO.outPoint = one.outPoint;
        shO.motionBlur = true;
        shO.moveAfter(one);
      }
      return { compName: compW.name, blocks: blocksW.length, singleLayer: true, layer: one.name, capHeight: capW, baselineY: byW, note: "One layer: change font, colour or size once. Check 3-4 frames: the highlighted word must be the spoken one." };
    }
    var created = [];
    for (var bi = 0; bi < blocksW.length; bi++) {
      var B = blocksW[bi];
      var nm = "Legenda " + ("000" + (bi + 1)).slice(-3);
      var tl = mkTextW(B.text);
      tl.name = nm;
      tl.inPoint = B.start;
      tl.outPoint = B.end;
      tl.motionBlur = true;
      var tr = tl.property("ADBE Transform Group");
      tr.property("ADBE Anchor Point").setValue([0, -capW / 2]);
      tr.property("ADBE Position").setValue([cxW, byW - capW / 2]);
      var st = [], en = [];
      for (var wi = 0; wi < B.words.length; wi++) {
        st.push(B.words[wi].s);
        en.push(wi + 1 < B.words.length ? B.words[wi + 1].s : B.words[wi].e + 10);
      }
      var arrS = "[" + st.join(",") + "]", arrE = "[" + en.join(",") + "]";
      var anims = tl.property("ADBE Text Properties").property("ADBE Text Animators");
      // spoken word: colour (and optional scale)
      var a1 = anims.addProperty("ADBE Text Animator");
      a1.name = "Palavra falada";
      a1.property("ADBE Text Animator Properties").addProperty("ADBE Text Fill Color").setValue([params.activeColor[0], params.activeColor[1], params.activeColor[2], 1]);
      if (params.wordScale && params.wordScale !== 100) {
        a1.property("ADBE Text Animator Properties").addProperty("ADBE Text Scale 3D").setValue([params.wordScale, params.wordScale, 100]);
      }
      var s1 = a1.property("ADBE Text Selectors").addProperty("ADBE Text Expressible Selector");
      s1.property("ADBE Text Range Type2").setValue(3);
      s1.property("ADBE Text Expressible Amount").expression = "var s=" + arrS + ",e=" + arrE + ";var i=Math.min(Math.max(Math.round(textIndex)-1,0),s.length-1);(time>=s[i]&&time<e[i])?100:0;";
      // words not said yet: dimmed
      if (typeof params.futureOpacity === "number" && params.futureOpacity < 100) {
        var a2 = anims.addProperty("ADBE Text Animator");
        a2.name = "Ainda nao dita";
        a2.property("ADBE Text Animator Properties").addProperty("ADBE Text Opacity").setValue(params.futureOpacity);
        var s2 = a2.property("ADBE Text Selectors").addProperty("ADBE Text Expressible Selector");
        s2.property("ADBE Text Range Type2").setValue(3);
        s2.property("ADBE Text Expressible Amount").expression = "var s=" + arrS + ";var i=Math.min(Math.max(Math.round(textIndex)-1,0),s.length-1);(time<s[i])?100:0;";
      }
      var popExpr = "var t=time-inPoint;var d=0.32;var v=100;if(t<d){var p=Math.max(t,0)/d;var q=1-Math.pow(1-p,3);v=100*(q+Math.sin(p*Math.PI)*" + popAmp + ");}";
      tr.property("ADBE Scale").expression = popExpr + "var r=sourceRectAtTime(time,false);var k=Math.min(1," + safeW + "/Math.max(r.width,1));[v*k,v*k];";
      if (params.shadow) {
        try {
          var ds = tl.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");
          ds.property(2).setValue(55);
          ds.property(3).setValue(180);
          ds.property(4).setValue(6);
          ds.property(5).setValue(24);
        } catch (_eSh) {}
      }
      if (params.pillColor) {
        var sh = compW.layers.addShape();
        sh.name = nm + " fundo";
        var g = sh.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
        var rc = g.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
        var tn = tl.name.replace(/"/g, "");
        rc.property("ADBE Vector Rect Size").expression = 'var r=thisComp.layer("' + tn + '").sourceRectAtTime(time,false);[r.width+' + padX * 2 + "," + (capW + padY * 2) + "];";
        rc.property("ADBE Vector Rect Roundness").setValue(typeof params.pillRadius === "number" ? params.pillRadius : Math.round((capW + padY * 2) * 0.28));
        var fl = g.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
        fl.property("ADBE Vector Fill Color").setValue([params.pillColor[0], params.pillColor[1], params.pillColor[2], 1]);
        var trS = sh.property("ADBE Transform Group");
        trS.property("ADBE Position").setValue([cxW, byW - capW / 2]);
        trS.property("ADBE Scale").expression = popExpr + 'var r=thisComp.layer("' + tn + '").sourceRectAtTime(time,false);var k=Math.min(1,' + safeW + "/Math.max(r.width,1));[v*k,v*k];";
        if (typeof params.pillOpacity === "number") trS.property("ADBE Opacity").setValue(params.pillOpacity);
        sh.inPoint = B.start;
        sh.outPoint = B.end;
        sh.motionBlur = true;
        sh.moveAfter(tl);
      }
      created.push(nm);
    }
    return { compName: compW.name, blocks: created.length, capHeight: capW, baselineY: byW, first: created.slice(0, 3), note: "Check 3-4 frames: the highlighted word must be the spoken one." };
  }

  // 18/11/2026: camera-style transition over a cut (whip pan, zoom blur, spin blur, shake, flash), built
  // non-destructively: one adjustment layer across the cut, effects driven by an "Intensidade" slider,
  // extreme eases. Property indices are validated before any keyframe is written; on failure the layer is removed.
  if (action === "ae.transition.paper") {
    // Paper tear / burn between a layer and whatever is below it, made inside After Effects:
    // Linear Wipe + Roughen Edges on the outgoing layer, and a paper-coloured (or ember) strip that lags behind.
    var cpP = __aeFindComp(params.compName, params.compIndex);
    var lyP = __aeFindLayer(cpP, params.layerIndex, params.layerName);
    var stP = Number(params.startSeconds) || 0;
    var duP = Number(params.durationSeconds) || 0.8;
    var styleP = params.style === "burn" ? "burn" : "tear";
    var angP = typeof params.angle === "number" ? params.angle : 90;
    var colP = params.edgeColor || (styleP === "burn" ? [1, 0.45, 0.05] : [0.96, 0.95, 0.92]);
    var seedP = Number(params.seed) || 0;
    var fdP = cpP.frameDuration;
    var lagP = Math.max(2 * fdP, duP * (styleP === "burn" ? 0.1 : 0.07));
    var borderP = typeof params.roughness === "number" ? params.roughness : (styleP === "burn" ? 30 : 16);
    var scaleP = styleP === "burn" ? 90 : 28;
    var stripP = styleP === "burn" ? 5 : 3.5; // width of the paper / ember strip, in % of the wipe
    var wipeOnP = function (L, t0, t1, border, scale, evo, sd, endValue, tail) {
      // Motion Tile first: the layer grows past the frame, so Roughen Edges does not eat the frame edges.
      L.property("ADBE Effect Parade").addProperty("ADBE Tile");
      var fxT = L.property("ADBE Effect Parade");
      fxT.property(fxT.numProperties).name = "MCP Margem";
      var tP = L.property("ADBE Effect Parade").property("MCP Margem");
      tP.property("ADBE Tile-0004").setValue(116);
      tP.property("ADBE Tile-0005").setValue(116);
      tP.property("ADBE Tile-0006").setValue(1);
      L.property("ADBE Effect Parade").addProperty("ADBE Linear Wipe");
      var fxA = L.property("ADBE Effect Parade");
      fxA.property(fxA.numProperties).name = "MCP Rasgo";
      var wP = L.property("ADBE Effect Parade").property("MCP Rasgo");
      wP.property("ADBE Linear Wipe-0002").setValue(angP);
      var cP = wP.property("ADBE Linear Wipe-0001");
      cP.setValueAtTime(t0, 0);
      cP.setValueAtTime(t1, endValue);
      if (tail > 0) cP.setValueAtTime(t1 + tail, 100);
      try {
        __aeEaseKey(cP, 1, "custom", 45, 45, 0, "out");
        __aeEaseKey(cP, 2, "custom", 70, 70, 0, "in");
      } catch (_eEaP) {}
      L.property("ADBE Effect Parade").addProperty("ADBE Roughen Edges");
      var fxB = L.property("ADBE Effect Parade");
      fxB.property(fxB.numProperties).name = "MCP Borda";
      var rP = L.property("ADBE Effect Parade").property("MCP Borda");
      // Border 0 outside the transition: Roughen Edges would also eat the frame edges of the layer.
      var bP = rP.property("ADBE Roughen Edges-0002");
      bP.setValueAtTime(Math.max(0, t0 - fdP), 0);
      bP.setValueAtTime(t0, border);
      bP.setInterpolationTypeAtKey(1, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
      rP.property("ADBE Roughen Edges-0003").setValue(styleP === "burn" ? 0.8 : 2.2);
      rP.property("ADBE Roughen Edges-0008").setValue(styleP === "burn" ? 3 : 5);
      rP.property("ADBE Roughen Edges-0005").setValue(scale);
      rP.property("ADBE Roughen Edges-0007").setValue([sd * 137, sd * 311]);
      rP.property("ADBE Roughen Edges-0009").setValue(evo);
    };
    var edgeP = cpP.layers.addSolid([colP[0], colP[1], colP[2]], styleP === "burn" ? "MCP Brasa" : "MCP Papel", cpP.width, cpP.height, cpP.pixelAspect, cpP.duration);
    edgeP.moveAfter(lyP);
    edgeP.startTime = 0;
    edgeP.inPoint = stP;
    edgeP.outPoint = Math.min(cpP.duration, stP + duP + lagP + fdP);
    wipeOnP(lyP, stP, stP + duP, borderP, scaleP, 0, seedP, 100, 0);
    // Same times, a few % behind: the strip keeps a steady width, then closes in the tail.
    wipeOnP(edgeP, stP, stP + duP, borderP * 1.3, scaleP * 0.75, 120, seedP + 1, 100 - stripP, lagP);
    var charName = null;
    if (styleP === "burn") {
      // Burnt paper: intact layer > dark charred band > glowing ember > next scene (19/11/2026, to validate live:
      // the first version was only a straight yellow band).
      var charP = cpP.layers.addSolid([0.07, 0.035, 0.02], "MCP Carvao", cpP.width, cpP.height, cpP.pixelAspect, cpP.duration);
      charP.moveAfter(lyP);
      charP.startTime = 0;
      charP.inPoint = stP;
      charP.outPoint = Math.min(cpP.duration, stP + duP + lagP + fdP);
      wipeOnP(charP, stP, stP + duP, borderP * 1.6, scaleP * 0.5, 240, seedP + 2, 100 - stripP * 0.45, lagP * 0.5);
      charName = charP.name;
    }
    if (styleP === "burn") {
      edgeP.property("ADBE Effect Parade").addProperty("ADBE Glo2");
      var gP = edgeP.property("ADBE Effect Parade").property(edgeP.property("ADBE Effect Parade").numProperties);
      gP.property("ADBE Glo2-0002").setValue(60);
      gP.property("ADBE Glo2-0003").setValue(Math.round(cpP.height * 0.03));
      gP.property("ADBE Glo2-0004").setValue(0.7);
    } else {
      edgeP.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");
      var dP = edgeP.property("ADBE Effect Parade").property(edgeP.property("ADBE Effect Parade").numProperties);
      dP.property("ADBE Drop Shadow-0002").setValue(110);
      dP.property("ADBE Drop Shadow-0004").setValue(Math.round(cpP.height * 0.006));
      dP.property("ADBE Drop Shadow-0005").setValue(Math.round(cpP.height * 0.018));
    }
    if (params.trimLayer !== false && lyP.outPoint > stP + duP + fdP) lyP.outPoint = stP + duP + fdP;
    return {
      compName: cpP.name,
      layer: lyP.name,
      style: styleP,
      startSeconds: stP,
      endSeconds: Math.round((stP + duP + lagP) * 1000) / 1000,
      edgeLayer: edgeP.name,
      charLayer: charName,
      effects: ["MCP Margem (Motion Tile)", "MCP Rasgo (Linear Wipe)", "MCP Borda (Roughen Edges)"],
      note: "The layer below shows through as the tear advances. Tune 'MCP Borda' (Border, Scale) and the wipe angle in Effect Controls."
    };
  }

  if (action === "ae.time.remap") {
    // Time remapping on a footage or pre-comp layer: freeze a frame, set speed keyframes, or turn it off; plus
    // frame blending and stretch for slow motion.
    var cpTR = __aeFindComp(params.compName, params.compIndex);
    var lTR = __aeFindLayer(cpTR, params.layerIndex, params.layerName);
    var opTR = params.operation || "freeze";
    var blendTR = { none: FrameBlendingType.NO_FRAME_BLEND, frameMix: FrameBlendingType.FRAME_MIX, pixelMotion: FrameBlendingType.PIXEL_MOTION };
    if (opTR !== "settings") {
      if (!lTR.canSetTimeRemapEnabled) __mcpFail("INVALID_PARAMS", "Layer '" + lTR.name + "' cannot be time-remapped: only footage and pre-comp layers can.");
    }
    if (opTR === "freeze") {
      var srcT = Number(params.sourceSeconds);
      if (isNaN(srcT)) __mcpFail("INVALID_PARAMS", "freeze needs sourceSeconds: the time of the frame to hold, in the layer's own time.");
      lTR.timeRemapEnabled = true;
      var trF = lTR.property("ADBE Time Remapping");
      trF.setValueAtTime(lTR.inPoint, srcT);
      for (var kF = trF.numKeys; kF >= 1; kF--) { if (Math.abs(trF.keyTime(kF) - lTR.inPoint) > 0.0005) trF.removeKey(kF); }
    } else if (opTR === "keyframes") {
      var keysTR = params.keyframes || [];
      if (keysTR.length < 2) __mcpFail("INVALID_PARAMS", "keyframes needs at least 2 entries: { time (comp seconds), sourceSeconds }.");
      lTR.timeRemapEnabled = true;
      var trK = lTR.property("ADBE Time Remapping");
      for (var sK = 0; sK < keysTR.length; sK++) {
        if (typeof keysTR[sK].time !== "number" || typeof keysTR[sK].sourceSeconds !== "number") __mcpFail("INVALID_PARAMS", "Each keyframe needs time and sourceSeconds (numbers).");
        trK.setValueAtTime(keysTR[sK].time, keysTR[sK].sourceSeconds);
      }
      for (var rK = trK.numKeys; rK >= 1; rK--) {
        var keepK = false;
        for (var cK = 0; cK < keysTR.length; cK++) { if (Math.abs(trK.keyTime(rK) - keysTR[cK].time) < 0.0005) keepK = true; }
        if (!keepK) trK.removeKey(rK);
      }
      if (params.extendTo && typeof params.extendTo === "number") lTR.outPoint = params.extendTo;
    } else if (opTR === "disable") {
      lTR.timeRemapEnabled = false;
    } else if (opTR !== "settings") {
      __mcpFail("INVALID_PARAMS", "operation must be freeze, keyframes, disable or settings.");
    }
    if (typeof params.stretch === "number") lTR.stretch = params.stretch;
    if (params.frameBlending) {
      if (blendTR[params.frameBlending] === undefined) __mcpFail("INVALID_PARAMS", "frameBlending must be none, frameMix or pixelMotion.");
      lTR.frameBlendingType = blendTR[params.frameBlending];
      if (params.frameBlending !== "none") cpTR.frameBlending = true;
    }
    var outTR = [];
    if (lTR.timeRemapEnabled) {
      var trO = lTR.property("ADBE Time Remapping");
      for (var oK = 1; oK <= trO.numKeys && oK <= 40; oK++) outTR.push({ time: Math.round(trO.keyTime(oK) * 1000) / 1000, sourceSeconds: Math.round(trO.keyValue(oK) * 1000) / 1000 });
    }
    return { compName: cpTR.name, layer: lTR.name, operation: opTR, timeRemapEnabled: lTR.timeRemapEnabled, keyframes: outTR, stretch: lTR.stretch, frameBlending: __aeEnumName(FrameBlendingType, lTR.frameBlendingType), inPoint: lTR.inPoint, outPoint: lTR.outPoint };
  }

  if (action === "ae.shape.morph") {
    // Morph one shape layer into another: both outlines resampled to the same number of points,
    // same winding, start point aligned, then two path keyframes (and the fill colour) on the first layer.
    var cpM = __aeFindComp(params.compName, params.compIndex);
    var laM = __aeFindLayer(cpM, params.fromLayerIndex, params.fromLayerName);
    var lbM = __aeFindLayer(cpM, params.toLayerIndex, params.toLayerName);
    if (!(laM instanceof ShapeLayer) || !(lbM instanceof ShapeLayer)) {
      __mcpFail("INVALID_PARAMS", "Both layers must be shape layers (text: Create Shapes from Text; vectors: ae_import_vector_as_shapes).");
    }
    if (laM.parent || lbM.parent) __mcpFail("INVALID_PARAMS", "Parented layers are not supported by the morph; unparent them first.");
    var nM = Math.max(16, Math.min(400, Number(params.points) || 160));
    var t0M = Number(params.startSeconds) || 0;
    var t1M = t0M + (Number(params.durationSeconds) || 0.6);
    var SHAPES_M = { "ADBE Vector Shape - Group": 1, "ADBE Vector Shape - Rect": 1, "ADBE Vector Shape - Ellipse": 1 };
    var findShapeM = function (group, chain) {
      for (var i = 1; i <= group.numProperties; i++) {
        var p = group.property(i);
        var mn = p.matchName;
        if (mn === "ADBE Vector Group") {
          var tf = p.property("ADBE Vector Transform Group");
          var c2 = chain.concat([
            {
              a: tf.property("ADBE Vector Anchor").value,
              p: tf.property("ADBE Vector Position").value,
              s: tf.property("ADBE Vector Scale").value,
              r: tf.property("ADBE Vector Rotation").value
            }
          ]);
          var f = findShapeM(p.property("ADBE Vectors Group"), c2);
          if (f) return f;
        } else if (SHAPES_M[mn]) {
          return { kind: mn, container: group, index: i, chain: chain };
        }
      }
      return null;
    };
    var findFillM = function (group) {
      for (var i = 1; i <= group.numProperties; i++) {
        var p = group.property(i);
        if (p.matchName === "ADBE Vector Graphic - Fill") return p.property("ADBE Vector Fill Color");
        if (p.matchName === "ADBE Vector Group") {
          var f = findFillM(p.property("ADBE Vectors Group"));
          if (f) return f;
        }
      }
      return null;
    };
    var countShapesM = function (group) {
      var n = 0;
      for (var i = 1; i <= group.numProperties; i++) {
        var p = group.property(i);
        if (SHAPES_M[p.matchName]) n++;
        else if (p.matchName === "ADBE Vector Group") n += countShapesM(p.property("ADBE Vectors Group"));
      }
      return n;
    };
    var polyM = function (found) {
      var sp = found.container.property(found.index);
      var pts = [];
      var i, k;
      if (found.kind === "ADBE Vector Shape - Group") {
        var sh = sp.property("ADBE Vector Shape").valueAtTime(t0M, false);
        var v = sh.vertices, it = sh.inTangents, ot = sh.outTangents;
        var segs = sh.closed ? v.length : v.length - 1;
        for (i = 0; i < segs; i++) {
          var j = (i + 1) % v.length;
          var p0 = v[i], p1 = [v[i][0] + ot[i][0], v[i][1] + ot[i][1]], p2 = [v[j][0] + it[j][0], v[j][1] + it[j][1]], p3 = v[j];
          for (k = 0; k < 24; k++) {
            var t = k / 24, u = 1 - t;
            pts.push([
              u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
              u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
            ]);
          }
        }
      } else if (found.kind === "ADBE Vector Shape - Rect") {
        var rs = sp.property("ADBE Vector Rect Size").valueAtTime(t0M, false);
        var rp = sp.property("ADBE Vector Rect Position").valueAtTime(t0M, false);
        var cs = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
        for (i = 0; i < 4; i++) {
          var c0 = cs[i], c1 = cs[(i + 1) % 4];
          for (k = 0; k < 24; k++) pts.push([rp[0] + (c0[0] + ((c1[0] - c0[0]) * k) / 24) * rs[0], rp[1] + (c0[1] + ((c1[1] - c0[1]) * k) / 24) * rs[1]]);
        }
      } else {
        var es = sp.property("ADBE Vector Ellipse Size").valueAtTime(t0M, false);
        var ep = sp.property("ADBE Vector Ellipse Position").valueAtTime(t0M, false);
        for (i = 0; i < 96; i++) {
          var an = (i / 96) * Math.PI * 2 - Math.PI / 2;
          pts.push([ep[0] + (Math.cos(an) * es[0]) / 2, ep[1] + (Math.sin(an) * es[1]) / 2]);
        }
      }
      return pts;
    };
    var fwdM = function (pt, x) {
      var rad = (x.r * Math.PI) / 180, cs = Math.cos(rad), sn = Math.sin(rad);
      var dx = ((pt[0] - x.a[0]) * x.s[0]) / 100, dy = ((pt[1] - x.a[1]) * x.s[1]) / 100;
      return [dx * cs - dy * sn + x.p[0], dx * sn + dy * cs + x.p[1]];
    };
    var invM = function (pt, x) {
      var rad = (-x.r * Math.PI) / 180, cs = Math.cos(rad), sn = Math.sin(rad);
      var dx = pt[0] - x.p[0], dy = pt[1] - x.p[1];
      var rx = dx * cs - dy * sn, ry = dx * sn + dy * cs;
      return [(rx * 100) / (x.s[0] || 100) + x.a[0], (ry * 100) / (x.s[1] || 100) + x.a[1]];
    };
    var layerXfM = function (L) {
      var tg = L.property("ADBE Transform Group");
      return {
        a: tg.property("ADBE Anchor Point").valueAtTime(t0M, false),
        p: tg.property("ADBE Position").valueAtTime(t0M, false),
        s: tg.property("ADBE Scale").valueAtTime(t0M, false),
        r: tg.property("ADBE Rotate Z").valueAtTime(t0M, false)
      };
    };
    var toCompM = function (pts, found, L) {
      var lx = layerXfM(L), out = [];
      for (var i = 0; i < pts.length; i++) {
        var q = pts[i];
        for (var c = found.chain.length - 1; c >= 0; c--) q = fwdM(q, found.chain[c]);
        out.push(fwdM(q, lx));
      }
      return out;
    };
    var fromCompM = function (pts, found, L) {
      var lx = layerXfM(L), out = [];
      for (var i = 0; i < pts.length; i++) {
        var q = invM(pts[i], lx);
        for (var c = 0; c < found.chain.length; c++) q = invM(q, found.chain[c]);
        out.push(q);
      }
      return out;
    };
    var resampleM = function (pts, n) {
      var len = [0], total = 0, i;
      for (i = 0; i < pts.length; i++) {
        var a = pts[i], b = pts[(i + 1) % pts.length];
        total += Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
        len.push(total);
      }
      var out = [], seg = 0;
      for (i = 0; i < n; i++) {
        var d = (total * i) / n;
        while (seg < pts.length - 1 && len[seg + 1] < d) seg++;
        var a2 = pts[seg], b2 = pts[(seg + 1) % pts.length];
        var sl = len[seg + 1] - len[seg];
        var f = sl > 0 ? (d - len[seg]) / sl : 0;
        out.push([a2[0] + (b2[0] - a2[0]) * f, a2[1] + (b2[1] - a2[1]) * f]);
      }
      return out;
    };
    var areaM = function (pts) {
      var s = 0;
      for (var i = 0; i < pts.length; i++) {
        var a = pts[i], b = pts[(i + 1) % pts.length];
        s += a[0] * b[1] - b[0] * a[1];
      }
      return s / 2;
    };
    var centM = function (pts) {
      var x = 0, y = 0;
      for (var i = 0; i < pts.length; i++) {
        x += pts[i][0];
        y += pts[i][1];
      }
      return [x / pts.length, y / pts.length];
    };
    var fa = findShapeM(laM.property("ADBE Root Vectors Group"), []);
    var fb = findShapeM(lbM.property("ADBE Root Vectors Group"), []);
    if (!fa || !fb) __mcpFail("INVALID_PARAMS", "No path, rectangle or ellipse found in '" + (fa ? lbM.name : laM.name) + "'.");
    var pathsA = countShapesM(laM.property("ADBE Root Vectors Group"));
    var pathsB = countShapesM(lbM.property("ADBE Root Vectors Group"));
    var pa = resampleM(toCompM(polyM(fa), fa, laM), nM);
    var pb = resampleM(toCompM(polyM(fb), fb, lbM), nM);
    if (areaM(pa) * areaM(pb) < 0) pb.reverse();
    var ca = centM(pa), cb = centM(pb), best = 0, bestD = -1;
    for (var sh2 = 0; sh2 < nM; sh2++) {
      var dsum = 0;
      for (var q2 = 0; q2 < nM; q2 += 2) {
        var A2 = pa[q2], B2 = pb[(q2 + sh2) % nM];
        var ex = A2[0] - ca[0] - (B2[0] - cb[0]), ey = A2[1] - ca[1] - (B2[1] - cb[1]);
        dsum += ex * ex + ey * ey;
      }
      if (bestD < 0 || dsum < bestD) {
        bestD = dsum;
        best = sh2;
      }
    }
    var pbAligned = [];
    for (var q3 = 0; q3 < nM; q3++) pbAligned.push(pb[(q3 + best) % nM]);
    var localA = fromCompM(pa, fa, laM);
    var localB = fromCompM(pbAligned, fa, laM);
    var colB = null;
    var fillB = findFillM(lbM.property("ADBE Root Vectors Group"));
    if (fillB) colB = fillB.valueAtTime(t0M, false);
    var kindA = fa.kind, idxA = fa.index;
    var contPathM = [];
    // Path to the container, by names, to re-fetch it after adding/removing properties (references go stale).
    var walkM = fa.container;
    while (walkM && walkM.matchName !== "ADBE Root Vectors Group") {
      contPathM.unshift(walkM.propertyIndex);
      walkM = walkM.parentProperty;
    }
    var contM = function () {
      var g = laM.property("ADBE Root Vectors Group");
      for (var i = 0; i < contPathM.length; i++) g = g.property(contPathM[i]);
      return g;
    };
    if (kindA !== "ADBE Vector Shape - Group") {
      contM().addProperty("ADBE Vector Shape - Group");
      var gNew = contM();
      gNew.property(gNew.numProperties).moveTo(idxA);
      contM().property(idxA + 1).remove();
    }
    var mkShapeM = function (pts) {
      var s = new Shape();
      s.vertices = pts;
      s.closed = true;
      return s;
    };
    var pathM = contM().property(idxA).property("ADBE Vector Shape");
    pathM.setValueAtTime(t0M, mkShapeM(localA));
    pathM.setValueAtTime(t1M, mkShapeM(localB));
    try {
      var kA = pathM.nearestKeyIndex(t0M), kB = pathM.nearestKeyIndex(t1M);
      __aeEaseKey(pathM, kA, "custom", 60, 60, 0, "out");
      __aeEaseKey(pathM, kB, "custom", 80, 80, 0, "in");
    } catch (_eEaM) {}
    var colourKeyed = false;
    if (params.morphColor !== false && colB) {
      var fillA = findFillM(laM.property("ADBE Root Vectors Group"));
      if (fillA) {
        var colA = fillA.valueAtTime(t0M, false);
        fillA.setValueAtTime(t0M, colA);
        fillA.setValueAtTime(t1M, colB);
        colourKeyed = true;
      }
    }
    if (params.hideTarget !== false) {
      if (laM.outPoint > t1M) laM.outPoint = t1M;
      if (lbM.inPoint < t1M) lbM.inPoint = t1M;
    }
    return {
      compName: cpM.name,
      from: laM.name,
      to: lbM.name,
      points: nM,
      startSeconds: t0M,
      endSeconds: t1M,
      colourKeyed: colourKeyed,
      convertedToPath: kindA !== "ADBE Vector Shape - Group",
      pathsInFrom: pathsA,
      pathsInTo: pathsB,
      warning: pathsA > 1 || pathsB > 1 ? "Only the first path of each layer is morphed; shapes with several paths (letters with holes, logos in pieces) need one layer per path." : null
    };
  }

  if (action === "ae.transition.camera") {
    var compT = __aeFindComp(params.compName, params.compIndex);
    var styleT = params.style || "whip";
    var cutT = params.cutSeconds;
    var durT = params.durationSeconds || (styleT === "shake" ? 0.6 : 0.5);
    var fdT = compT.frameDuration;
    var t0 = Math.max(0, cutT - durT / 2), t1 = Math.min(compT.duration, cutT + durT / 2), tPre = cutT - fdT;
    var W = compT.width, H = compT.height, cx = W / 2, cy = H / 2;
    var inten = typeof params.intensity === "number" ? params.intensity : 100;
    function needT(prop, type, label) {
      if (!prop || prop.propertyValueType !== type) __mcpFail("UNSUPPORTED", "After Effects effect layout differs from expected (" + label + "); nothing was animated.");
      return prop;
    }
    function easeEnds(prop) {
      var n = prop.numKeys;
      if (n < 2) return;
      var dim = 1;
      var v = prop.keyValue(1);
      if (prop.propertyValueType === PropertyValueType.TwoD || prop.propertyValueType === PropertyValueType.ThreeD) dim = v.length;
      var slow = [], lin = [];
      for (var d = 0; d < dim; d++) {
        slow.push(new KeyframeEase(0, 90));
        lin.push(new KeyframeEase(0, 0.1));
      }
      prop.setTemporalEaseAtKey(1, slow, slow);
      prop.setTemporalEaseAtKey(n, slow, slow);
      for (var k = 2; k < n; k++) prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
    }
    var lay = null;
    try {
      if (styleT === "flash") {
        var colF = params.color || [1, 1, 1];
        lay = compT.layers.addSolid(colF, "Transicao flash", W, H, compT.pixelAspect, t1 - t0);
        lay.startTime = t0;
        lay.blendingMode = BlendingMode.ADD;
        var opF = lay.property("ADBE Transform Group").property("ADBE Opacity");
        opF.setValueAtTime(t0, 0);
        opF.setValueAtTime(cutT, Math.min(100, inten));
        opF.setValueAtTime(t1, 0);
        easeEnds(opF);
        return { compName: compT.name, style: styleT, layer: lay.name, from: t0, cut: cutT, to: t1 };
      }
      lay = compT.layers.addSolid([1, 1, 1], "Transicao " + styleT, W, H, compT.pixelAspect, t1 - t0);
      lay.startTime = t0;
      lay.adjustmentLayer = true;
      lay.motionBlur = true;
      var fx = lay.property("ADBE Effect Parade");
      var sl = fx.addProperty("ADBE Slider Control");
      sl.name = "Intensidade";
      sl.property(1).setValue(inten);
      var tile = fx.addProperty("ADBE Tile");
      needT(tile.property(4), PropertyValueType.OneD, "Motion Tile output width").setValue(300);
      needT(tile.property(5), PropertyValueType.OneD, "Motion Tile output height").setValue(300);
      try {
        tile.property(6).setValue(1);
      } catch (_eMir) {}
      var tf = fx.addProperty("ADBE Geometry2");
      var tfPos = needT(tf.property(2), PropertyValueType.TwoD_SPATIAL, "Transform position");
      var tfScale = needT(tf.property(4), PropertyValueType.OneD, "Transform scale");
      var tfRot = needT(tf.property(8), PropertyValueType.OneD, "Transform rotation");
      var K = "*effect(\"Intensidade\")(1)/100";
      function reTf() {
        var tfN = lay.property("ADBE Effect Parade").property("ADBE Geometry2");
        tfPos = tfN.property(2);
        tfScale = tfN.property(4);
        tfRot = tfN.property(8);
      }
      if (styleT === "whip") {
        var dir = params.direction || "left";
        var dx = 0, dy = 0;
        if (dir === "left") dx = -W;
        else if (dir === "right") dx = W;
        else if (dir === "up") dy = -H;
        else if (dir === "down") dy = H;
        tfPos.setValueAtTime(t0, [cx, cy]);
        tfPos.setValueAtTime(tPre, [cx + dx, cy + dy]);
        tfPos.setValueAtTime(cutT, [cx - dx, cy - dy]);
        tfPos.setValueAtTime(t1, [cx, cy]);
        easeEnds(tfPos);
        var db = fx.addProperty("ADBE Motion Blur");
        needT(db.property(1), PropertyValueType.OneD, "Directional Blur direction").setValue(dx !== 0 ? 90 : 0);
        var dbLen = needT(db.property(2), PropertyValueType.OneD, "Directional Blur length");
        dbLen.setValueAtTime(t0, 0);
        dbLen.setValueAtTime(cutT, 180);
        dbLen.setValueAtTime(t1, 0);
        easeEnds(dbLen);
        dbLen.expression = "value" + K;
      } else if (styleT === "zoom") {
        var zin = params.direction !== "out";
        tfScale.setValueAtTime(t0, 100);
        tfScale.setValueAtTime(tPre, zin ? 260 : 45);
        tfScale.setValueAtTime(cutT, zin ? 45 : 260);
        tfScale.setValueAtTime(t1, 100);
        easeEnds(tfScale);
        var rb = fx.addProperty("ADBE Radial Blur");
        var rbAm = needT(rb.property(1), PropertyValueType.OneD, "Radial Blur amount");
        try {
          rb.property(3).setValue(2);
        } catch (_eZt) {}
        rbAm.setValueAtTime(t0, 0);
        rbAm.setValueAtTime(cutT, 70);
        rbAm.setValueAtTime(t1, 0);
        easeEnds(rbAm);
        rbAm.expression = "value" + K;
      } else if (styleT === "spin") {
        var turn = params.direction === "left" ? -180 : 180;
        tfRot.setValueAtTime(t0, 0);
        tfRot.setValueAtTime(tPre, turn);
        tfRot.setValueAtTime(cutT, -turn);
        tfRot.setValueAtTime(t1, 0);
        easeEnds(tfRot);
        tfScale.setValueAtTime(t0, 100);
        tfScale.setValueAtTime(cutT, 150);
        tfScale.setValueAtTime(t1, 100);
        easeEnds(tfScale);
        var rs = fx.addProperty("ADBE Radial Blur");
        var rsAm = needT(rs.property(1), PropertyValueType.OneD, "Radial Blur amount");
        try {
          rs.property(3).setValue(1);
        } catch (_eSt) {}
        rsAm.setValueAtTime(t0, 0);
        rsAm.setValueAtTime(cutT, 60);
        rsAm.setValueAtTime(t1, 0);
        easeEnds(rsAm);
        rsAm.expression = "value" + K;
      } else if (styleT === "shake") {
        lay.startTime = cutT;
        fx.addProperty("ADBE Slider Control").name = "Forca";
        // LIVE FINDING: adding an effect invalidates every property reference taken before ("Object is invalid")
        reTf();
        var fp = lay.property("ADBE Effect Parade").property("Forca").property(1);
        fp.setValueAtTime(cutT, 100);
        fp.setValueAtTime(Math.min(compT.duration, cutT + durT), 0);
        tfScale.setValue(108);
        tfPos.expression = "var a=effect(\"Forca\")(1)/100" + K + ";wiggle(" + (params.frequency || 18) + ",60*a);";
        tfRot.expression = "var a=effect(\"Forca\")(1)/100" + K + ";wiggle(" + (params.frequency || 18) + ",2.5*a);";
      } else if (styleT === "glitch") {
        // digital tear across the cut: horizontal jumps held for 1/24 s + a square wave warp, both scaled by "Forca"
        fx.addProperty("ADBE Slider Control").name = "Forca";
        lay.property("ADBE Effect Parade").addProperty("ADBE Wave Warp").name = "Rasgo";
        reTf();
        var fg = lay.property("ADBE Effect Parade").property("Forca").property(1);
        fg.setValueAtTime(t0, 0);
        fg.setValueAtTime(cutT, 100);
        fg.setValueAtTime(t1, 0);
        tfScale.setValue(106);
        tfPos.expression = "posterizeTime(24);var a=effect(\"Forca\")(1)/100" + K + ";seedRandom(Math.floor(time*24),true);value+[random(-1,1)*" + Math.round(W * 0.14) + "*a,0];";
        var ww = lay.property("ADBE Effect Parade").property("Rasgo");
        try {
          ww.property(1).setValue(2);
        } catch (_eWt) {}
        var wwH = needT(ww.property(2), PropertyValueType.OneD, "Wave Warp height");
        var wwW = needT(ww.property(3), PropertyValueType.OneD, "Wave Warp width");
        wwW.setValue(Math.round(H * 0.09));
        wwH.expression = "posterizeTime(24);var a=effect(\"Forca\")(1)/100" + K + ";seedRandom(Math.floor(time*24)+7,true);random(20,90)*a;";
      } else {
        __mcpFail("INVALID_PARAMS", "style must be whip, zoom, spin, shake, glitch or flash.");
      }
      lay.moveToBeginning();
      // the solid is created with the comp length: trim it to the move, so it does not sit over the rest of the comp
      lay.outPoint = styleT === "shake" ? Math.min(compT.duration, cutT + durT) : t1;
      return { compName: compT.name, style: styleT, layer: lay.name, from: lay.inPoint, cut: cutT, to: lay.outPoint, controls: ["Intensidade"].concat(styleT === "shake" || styleT === "glitch" ? ["Forca"] : []) };
    } catch (eT) {
      try {
        if (lay) lay.remove();
      } catch (_eRm) {}
      throw eT;
    }
  }

  // 18/11/2026 (B62): beat-synced words in 3D. One 3D text layer per word, a layer marker on the word's
  // time, a scale expression that reaches 100 % exactly ON the marker (damped overshoot after it) and an
  // optional camera that travels from stop to stop so the landings sit at different places of the frame.
  // LIVE FINDING (After Effects 27): one camera move per word only works when the words are apart; at
  // speech rate (6 words/s) the camera never rests and every word is a blur. Words closer than `minGap`
  // therefore share a STOP: they stack as lines of one block and the camera holds (drifting) on it.
  if (action === "ae.words.pop") {
    var compP = __aeFindComp(params.compName, params.compIndex);
    var wordsP = params.words || [];
    if (!wordsP.length) __mcpFail("INVALID_PARAMS", "words: [{ text, start, end?, id? }] is required.");
    var WP = compP.width, HP = compP.height, fdP = compP.frameDuration;
    var fontsP = params.fonts && params.fonts.length ? params.fonts : [params.font || "Arial-BoldMT"];
    var colsP = params.colors && params.colors.length ? params.colors : [[1, 1, 1]];
    var sizeP = params.fontSize || Math.round(WP * 0.16);
    var tiersP = params.sizePattern && params.sizePattern.length ? params.sizePattern : [1, 0.62, 1.3, 0.8, 1.12, 0.55];
    var leadP = typeof params.lead === "number" ? params.lead : 0.08;
    var overP = typeof params.overshoot === "number" ? params.overshoot : 0.14;
    var stepZP = typeof params.stepZ === "number" ? params.stepZ : 900;
    var minGapP = typeof params.minGap === "number" ? params.minGap : 0.4;
    var maxStopP = Math.max(1, Math.round(params.maxWordsPerStop || 5));
    var prefixP = params.namePrefix || "Palavra ";
    var safeP = params.safe || { x0: 60, x1: 960, y0: 220, y1: 1540 };
    var kxP = WP / 1080, kyP = HP / 1920;
    var sx0 = safeP.x0 * kxP, sx1 = safeP.x1 * kxP, sy0 = safeP.y0 * kyP, sy1 = safeP.y1 * kyP;
    var scx = (sx0 + sx1) / 2, scy = (sy0 + sy1) / 2;
    // LIVE FINDING: a word fitted to the full safe width leaves the zone by a few px (camera drift, settle
    // rotation). Everything is laid out inside 92 % of the zone.
    var padSx = (sx1 - sx0) * 0.04, padSy = (sy1 - sy0) * 0.04;
    sx0 += padSx;
    sx1 -= padSx;
    sy0 += padSy;
    sy1 -= padSy;
    var travelP = typeof params.travel === "number" ? params.travel : 0.45;
    var patX = [-0.86, 0.78, -0.22, 0.92, -0.95, 0.4, 0.84, -0.62, 0.08, -0.9];
    var patY = [-0.7, 0.42, 0.86, -0.92, 0.14, -0.44, 0.94, -0.86, 0.58, -0.16];
    var useCam = params.camera !== false;
    var camP = null, zoomP = WP * 50 / 36;
    if (useCam) {
      camP = compP.layers.addCamera(params.cameraName || "MCP Camera palavras", [WP / 2, HP / 2]);
      try {
        zoomP = camP.property("ADBE Camera Options Group").property("ADBE Camera Zoom").value;
      } catch (_eZm) {}
    }
    var popBody =
      "var lead=" + leadP + ",f=3.4,z=0.4,over=" + overP + ",a=time-ts,s;" +
      "if(a<=-lead){s=0;}else if(a<0){var x=(a+lead)/lead;s=x*x*x;}else{" +
      "var w=2*Math.PI*f,wd=w*Math.sqrt(1-z*z),tp=Math.atan2(wd,z*w)/wd,pk=Math.exp(-z*w*tp)*Math.sin(wd*tp);" +
      "s=1+over*Math.exp(-z*w*a)*Math.sin(wd*a)/pk;}";
    var tsHead = "var ts=(marker.numKeys>0)?marker.key(1).time:inPoint;";

    // pass 1: the layers, their ink boxes and the stops
    var infoP = [], stopsP = [];
    for (var wp = 0; wp < wordsP.length; wp++) {
      var Wd = wordsP[wp];
      var txtP = params.upperCase === false ? String(Wd.text) : String(Wd.text).toUpperCase();
      var lp = compP.layers.addText(txtP);
      var docPp = lp.property("ADBE Text Properties").property("ADBE Text Document");
      var dP = docPp.value;
      dP.resetCharStyle();
      dP.font = Wd.font || fontsP[wp % fontsP.length];
      dP.fontSize = Math.round(sizeP * (typeof Wd.size === "number" ? Wd.size : tiersP[wp % tiersP.length]));
      dP.fillColor = Wd.color || colsP[wp % colsP.length];
      dP.applyFill = true;
      dP.applyStroke = false;
      dP.justification = ParagraphJustification.CENTER_JUSTIFY;
      docPp.setValue(dP);
      lp.name = prefixP + ("000" + (wp + 1)).slice(-3);
      lp.threeDLayer = true;
      lp.motionBlur = true;
      var rP = lp.sourceRectAtTime(0, false);
      var fitP = Math.min(1, (sx1 - sx0) / Math.max(rP.width, 1));
      lp.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([rP.left + rP.width / 2, rP.top + rP.height / 2, 0]);
      infoP.push({ layer: lp, word: Wd, text: txtP, w: rP.width * fitP, h: rP.height * fitP, fit: fitP, index: wp, custom: !!(Wd.position && Wd.position.length === 3) });
    }
    // runs = words closer than minGap; a run longer than maxWordsPerStop is cut at its LARGEST pause
    // (LIVE FINDING: cutting by count split "feita | no chatgpt" in the wrong place and the camera left
    // while a word was still landing).
    function splitRun(run) {
      if (run.length <= maxStopP) return [run];
      var best = 1, bestGap = -1;
      for (var q = 1; q < run.length; q++) {
        var gq = run[q].word.start - run[q - 1].word.start;
        if (gq > bestGap + 0.0001) {
          bestGap = gq;
          best = q;
        }
      }
      return splitRun(run.slice(0, best)).concat(splitRun(run.slice(best)));
    }
    var runP = [];
    function flushRun() {
      if (!runP.length) return;
      var parts = splitRun(runP);
      for (var pr = 0; pr < parts.length; pr++) {
        stopsP.push({ t: parts[pr][0].word.start, lastT: parts[pr][parts[pr].length - 1].word.start, items: parts[pr], custom: false });
      }
      runP = [];
    }
    for (var ip = 0; ip < infoP.length; ip++) {
      var Ip = infoP[ip];
      if (Ip.custom) {
        flushRun();
        stopsP.push({ t: Ip.word.start, lastT: Ip.word.start, items: [Ip], custom: true });
        continue;
      }
      if (runP.length && Ip.word.start - runP[runP.length - 1].word.start >= minGapP) flushRun();
      runP.push(Ip);
    }
    flushRun();

    // pass 2: lay each stop out as a block of stacked lines and place it
    var outP = [], camKeys = [];
    for (var sp = 0; sp < stopsP.length; sp++) {
      var St = stopsP[sp], n = St.items.length, ii;
      var gapY = 0, blockW = 0, blockH = 0;
      for (ii = 0; ii < n; ii++) {
        blockW = Math.max(blockW, St.items[ii].w);
        blockH += St.items[ii].h;
      }
      gapY = n > 1 ? (blockH / n) * 0.22 : 0;
      blockH += gapY * (n - 1);
      var fitB = Math.min(1, (sy1 - sy0) * 0.8 / Math.max(blockH, 1));
      blockW *= fitB;
      blockH *= fitB;
      gapY *= fitB;
      var roomX = Math.max(0, (sx1 - sx0 - blockW) / 2), roomY = Math.max(0, (sy1 - sy0 - blockH) / 2);
      var bcx = scx + patX[sp % patX.length] * roomX, bcy = scy + patY[sp % patY.length] * roomY;
      var zS = sp * stepZP;
      var yCur = bcy - blockH / 2;
      for (ii = 0; ii < n; ii++) {
        var It = St.items[ii];
        var wI = It.w * fitB, hI = It.h * fitB;
        var al = (ii + sp) % 3;
        var tgtX = bcx;
        if (al === 0) tgtX = bcx - blockW / 2 + wI / 2;
        else if (al === 1) tgtX = bcx + blockW / 2 - wI / 2;
        var tgtY = yCur + hI / 2;
        yCur += hI + gapY;
        var trP = It.layer.property("ADBE Transform Group");
        var posP;
        if (It.word.position && It.word.position.length === 3) {
          posP = It.word.position;
        } else if (useCam) {
          // the camera sits half-way to the block's offset: it really travels, and the word lands on its target
          posP = [WP / 2 + (bcx - WP / 2) + (tgtX - WP / 2), HP / 2 + (bcy - HP / 2) + (tgtY - HP / 2), zS];
        } else {
          posP = [tgtX, tgtY, 0];
        }
        trP.property("ADBE Position").setValue(posP);
        var baseS = Math.round(100 * It.fit * fitB * 100) / 100;
        trP.property("ADBE Scale").expression = tsHead + popBody + "[" + baseS + "*s," + baseS + "*s," + baseS + "*s];";
        var rotAmp = (It.index % 2 === 0 ? 1 : -1) * (typeof params.rotationSettle === "number" ? params.rotationSettle : 4);
        if (rotAmp !== 0) {
          trP.property("ADBE Rotate Z").expression = tsHead + "var a=time-ts;(a<0)?0:" + rotAmp + "*Math.exp(-9*a)*Math.cos(18*a);";
        }
        It.layer.property("ADBE Marker").setValueAtTime(It.word.start, new MarkerValue(String(It.word.id || It.text)));
        It.layer.inPoint = Math.max(0, It.word.start - leadP - fdP);
        // LIVE FINDING: the words of a stop the camera has left stay in the corner of the next frames, huge
        // and cropped. By default they fade out as the next stop arrives (holdStops: 1).
        var holdTo = compP.duration;
        var holdN = typeof params.holdStops === "number" ? params.holdStops : 1;
        if (typeof It.word.out === "number") holdTo = It.word.out;
        else if (holdN > 0 && sp + holdN < stopsP.length) holdTo = stopsP[sp + holdN].t;
        It.layer.outPoint = Math.min(compP.duration, Math.max(holdTo, It.word.start + 0.3));
        if (It.layer.outPoint < compP.duration - fdP) {
          trP.property("ADBE Opacity").expression = "linear(time,outPoint-0.14,outPoint-0.02,100,0);";
        }
        outP.push({ layer: It.layer.name, id: String(It.word.id || It.text), time: It.word.start, frame: Math.round(It.word.start / fdP), stop: sp + 1, target: [Math.round(tgtX), Math.round(tgtY)], inkWidth: Math.round(wI) });
      }
      if (useCam && !St.custom) {
        camKeys.push({ t: St.t, lastT: St.lastT, pos: [WP / 2 + (bcx - WP / 2), HP / 2 + (bcy - HP / 2), zS - zoomP], poi: [WP / 2 + (bcx - WP / 2), HP / 2 + (bcy - HP / 2), zS] });
      }
    }
    if (camP && camKeys.length) {
      var cT = camP.property("ADBE Transform Group");
      var cPos = cT.property("ADBE Position"), cPoi = cT.property("ADBE Anchor Point");
      var first = camKeys[0];
      var tStart = Math.max(0, first.t - (typeof params.runUp === "number" ? params.runUp : 0.8));
      if (tStart < first.t - fdP) {
        cPos.setValueAtTime(tStart, [WP / 2, HP / 2, first.pos[2] - stepZP]);
        cPoi.setValueAtTime(tStart, [WP / 2, HP / 2, first.poi[2] - stepZP]);
      }
      for (var ck = 0; ck < camKeys.length; ck++) {
        // arrive a moment before the first word of the stop, so the landing is read on a resting camera
        var tk = Math.max(tStart + fdP, camKeys[ck].t - leadP);
        if (ck > 0) tk = Math.max(tk, camKeys[ck - 1].t + fdP);
        cPos.setValueAtTime(tk, camKeys[ck].pos);
        cPoi.setValueAtTime(tk, camKeys[ck].poi);
        // hold on the stop until its last word has been read (slow creep forward, never a freeze)
        var lastWordT = camKeys[ck].lastT;
        var nextT = ck + 1 < camKeys.length ? camKeys[ck + 1].t - leadP : compP.duration;
        // stay on the block until `travel` seconds before the next stop and never leave less than 0.2 s
        // after its last word landed; the trip itself may shrink to 0.1 s when the speech is fast
        var holdT = Math.min(Math.max(lastWordT + 0.2, nextT - travelP), nextT - 0.1);
        if (holdT > tk + fdP * 2) {
          cPos.setValueAtTime(holdT, [camKeys[ck].pos[0], camKeys[ck].pos[1], camKeys[ck].pos[2] + zoomP * 0.03]);
          cPoi.setValueAtTime(holdT, [camKeys[ck].poi[0], camKeys[ck].poi[1], camKeys[ck].poi[2] + zoomP * 0.03]);
        }
      }
      var lastK = camKeys[camKeys.length - 1];
      var tEnd = Math.min(compP.duration, stopsP[stopsP.length - 1].lastT + (typeof params.endDrift === "number" ? params.endDrift : 2));
      if (tEnd > cPos.keyTime(cPos.numKeys) + fdP) {
        cPos.setValueAtTime(tEnd, [lastK.pos[0], lastK.pos[1], lastK.pos[2] + zoomP * 0.08]);
        cPoi.setValueAtTime(tEnd, [lastK.poi[0], lastK.poi[1], lastK.poi[2] + zoomP * 0.08]);
      }
      // LIVE FINDING: with the default auto-bezier path the camera wanders sideways between two keys that
      // sit on the same spot (arrival and hold). Straight paths, and an ease on every key.
      var propsC = [cPos, cPoi];
      for (var pc = 0; pc < propsC.length; pc++) {
        var prC = propsC[pc];
        for (var kk = 1; kk <= prC.numKeys; kk++) {
          try {
            prC.setSpatialAutoBezierAtKey(kk, false);
            prC.setSpatialContinuousAtKey(kk, false);
            prC.setSpatialTangentsAtKey(kk, [0, 0, 0], [0, 0, 0]);
            prC.setTemporalEaseAtKey(kk, [new KeyframeEase(0, 70)], [new KeyframeEase(0, 30)]);
          } catch (_eEase) {}
        }
      }
      var driftP = typeof params.drift === "number" ? params.drift : 10;
      if (driftP > 0) {
        var drE = "value+[" + driftP + "*Math.sin(time*1.7)," + driftP * 0.7 + "*Math.cos(time*1.3)," + driftP * 1.6 + "*Math.sin(time*0.9)];";
        cPos.expression = drE;
        cPoi.expression = drE;
      }
    }
    compP.motionBlur = true;
    return { compName: compP.name, words: outP.length, stops: stopsP.length, camera: camP ? camP.name : null, zoom: Math.round(zoomP), stepZ: stepZP, layers: outP, note: "Check 3-4 landings with ae_get_comp_frame_preview, then ae_measure_landings and ae_audit_camera." };
  }

  // 18/11/2026 (B62): where each word sits on screen at its own time. Reads the projected position of the
  // ink box through the active camera (expression toComp evaluated by a temporary null), no render needed.
  if (action === "ae.words.measure") {
    var compM = __aeFindComp(params.compName, params.compIndex);
    var prefixM = params.namePrefix || "Palavra ";
    var wantM = params.layerNames && params.layerNames.length ? params.layerNames : null;
    var probeM = compM.layers.addNull();
    var rowsM = [];
    try {
      probeM.name = "__mcp_medida";
      var fxM = probeM.property("ADBE Effect Parade");
      for (var pm = 0; pm < 5; pm++) fxM.addProperty("ADBE Point Control");
      var ptsM = [];
      for (var pm2 = 1; pm2 <= 5; pm2++) ptsM.push(probeM.property("ADBE Effect Parade").property(pm2).property(1));
      var exprPts = ["[r.left+r.width/2,r.top+r.height/2,0]", "[r.left,r.top+r.height/2,0]", "[r.left+r.width,r.top+r.height/2,0]", "[r.left+r.width/2,r.top,0]", "[r.left+r.width/2,r.top+r.height,0]"];
      for (var li = 1; li <= compM.numLayers; li++) {
        var LM = compM.layer(li);
        if (li === probeM.index) continue;
        var okM = false;
        if (wantM) {
          for (var wn2 = 0; wn2 < wantM.length; wn2++) if (wantM[wn2] === LM.name) okM = true;
        } else {
          okM = String(LM.name).indexOf(prefixM) === 0;
        }
        if (!okM) continue;
        var mkM = LM.property("ADBE Marker");
        var tM = (mkM && mkM.numKeys > 0) ? mkM.keyTime(1) : LM.inPoint;
        var idM = (mkM && mkM.numKeys > 0) ? String(mkM.keyValue(1).comment) : String(LM.name);
        var valsM = [];
        for (var e5 = 0; e5 < 5; e5++) {
          ptsM[e5].expression = "var L=thisComp.layer(" + li + ");var r=L.sourceRectAtTime(time,false);var p=L.toComp(" + exprPts[e5] + ");[p[0],p[1]];";
          valsM.push(ptsM[e5].valueAtTime(tM, false));
        }
        rowsM.push({
          layer: String(LM.name),
          id: idM,
          time: tM,
          frame: Math.round(tM / compM.frameDuration),
          cx: Math.round(valsM[0][0] * 10) / 10,
          cy: Math.round(valsM[0][1] * 10) / 10,
          inkW: Math.round(Math.abs(valsM[2][0] - valsM[1][0]) * 10) / 10,
          inkH: Math.round(Math.abs(valsM[4][1] - valsM[3][1]) * 10) / 10
        });
      }
    } finally {
      try {
        probeM.remove();
      } catch (_ePm) {}
    }
    rowsM.sort(function (a, b) {
      return a.time - b.time;
    });
    return { compName: compM.name, width: compM.width, height: compM.height, fps: Math.round(100 / compM.frameDuration) / 100, rows: rowsM };
  }

  // 18/11/2026 (B62): the path of the active camera, frame by frame (world position and view direction),
  // so that the Node side can find stretches where the camera stands still and unplanned jumps.
  if (action === "ae.camera.trace") {
    var compK = __aeFindComp(params.compName, params.compIndex);
    var fdK = compK.frameDuration;
    var fromK = typeof params.from === "number" ? params.from : 0;
    var toK = typeof params.to === "number" ? Math.min(params.to, compK.duration) : compK.duration;
    var stepK = Math.max(1, Math.round(params.stepFrames || 1));
    var totalK = Math.floor((toK - fromK) / (fdK * stepK));
    if (totalK > 2400) {
      stepK = Math.ceil((toK - fromK) / fdK / 2400);
      totalK = Math.floor((toK - fromK) / (fdK * stepK));
    }
    var hasCam = false;
    for (var lc = 1; lc <= compK.numLayers; lc++) if (compK.layer(lc) instanceof CameraLayer) hasCam = true;
    if (!hasCam) __mcpFail("NOT_FOUND", "The composition has no camera layer.");
    var probeK = compK.layers.addNull();
    var samplesK = [];
    try {
      probeK.name = "__mcp_camera";
      probeK.threeDLayer = true;
      var fxK = probeK.property("ADBE Effect Parade");
      fxK.addProperty("ADBE Point3D Control");
      fxK.addProperty("ADBE Point3D Control");
      var pK1 = probeK.property("ADBE Effect Parade").property(1).property(1);
      var pK2 = probeK.property("ADBE Effect Parade").property(2).property(1);
      pK1.expression = "thisComp.activeCamera.toWorld([0,0,0]);";
      pK2.expression = "var c=thisComp.activeCamera;c.toWorld([0,0,1])-c.toWorld([0,0,0]);";
      for (var sk = 0; sk <= totalK; sk++) {
        var tK = fromK + sk * stepK * fdK;
        var a1 = pK1.valueAtTime(tK, false), a2 = pK2.valueAtTime(tK, false);
        samplesK.push([Math.round(tK * 10000) / 10000, Math.round(a1[0] * 100) / 100, Math.round(a1[1] * 100) / 100, Math.round(a1[2] * 100) / 100, Math.round(a2[0] * 100000) / 100000, Math.round(a2[1] * 100000) / 100000, Math.round(a2[2] * 100000) / 100000]);
      }
    } finally {
      try {
        probeK.remove();
      } catch (_ePk) {}
    }
    return { compName: compK.name, fps: Math.round(100 / fdK) / 100, stepFrames: stepK, from: fromK, to: toK, columns: ["t", "x", "y", "z", "dx", "dy", "dz"], samples: samplesK };
  }

  // 18/11/2026 (B62): a lyric line as a ring of standing letters in 3D (text on a circular path with
  // per-character 3D). The ring spins so that each word is in front at its time. Not validated live:
  // standAngle / frontOffsetDegrees / direction exist to calibrate the first run.
  if (action === "ae.text.ring") {
    var compR = __aeFindComp(params.compName, params.compIndex);
    var textR = params.upperCase === false ? String(params.text) : String(params.text).toUpperCase();
    var radR = params.radius || Math.round(compR.width * 0.6);
    var arcR = typeof params.arcDegrees === "number" ? params.arcDegrees : 300;
    function styleR(layer, size) {
      var pp = layer.property("ADBE Text Properties").property("ADBE Text Document");
      var dd = pp.value;
      dd.resetCharStyle();
      dd.font = params.font || "Arial-BoldMT";
      dd.fontSize = size;
      dd.fillColor = params.color || [1, 1, 1];
      dd.applyFill = true;
      dd.applyStroke = false;
      dd.justification = ParagraphJustification.LEFT_JUSTIFY;
      pp.setValue(dd);
    }
    function widthR(str, size) {
      var pl = compR.layers.addText(str);
      styleR(pl, size);
      var ww = pl.sourceRectAtTime(0, false).width;
      pl.remove();
      return ww;
    }
    var sizeR = params.fontSize || 120;
    var fullW = widthR(textR, sizeR);
    if (params.fit !== false && fullW > 0) {
      sizeR = Math.max(8, Math.round(sizeR * (arcR / 360 * 2 * Math.PI * radR) / fullW));
      fullW = widthR(textR, sizeR);
    }
    // centre angle of every word, in degrees along the path from its start
    var partsR = textR.split(" "), anglesR = [], accR = "";
    for (var wr = 0; wr < partsR.length; wr++) {
      var wWord = widthR(partsR[wr], sizeR);
      var startW = accR.length ? widthR(accR + " " + partsR[wr], sizeR) - wWord : 0;
      anglesR.push(Math.round(((startW + wWord / 2) / radR) * 180 / Math.PI * 100) / 100);
      accR = accR.length ? accR + " " + partsR[wr] : partsR[wr];
    }
    var lr = compR.layers.addText(textR);
    styleR(lr, sizeR);
    lr.name = params.name || "Anel de texto";
    lr.threeDLayer = true;
    try {
      lr.threeDPerChar = true;
    } catch (_e3d) {
      __mcpFail("UNSUPPORTED", "Per-character 3D could not be enabled on the text layer.");
    }
    lr.motionBlur = true;
    var kR = 0.5522847 * radR;
    var shR = new Shape();
    shR.vertices = [[0, radR], [-radR, 0], [0, -radR], [radR, 0]];
    shR.inTangents = [[kR, 0], [0, kR], [-kR, 0], [0, -kR]];
    shR.outTangents = [[-kR, 0], [0, -kR], [kR, 0], [0, kR]];
    shR.closed = true;
    var mR = lr.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
    mR.property("ADBE Mask Shape").setValue(shR);
    mR.maskMode = MaskMode.NONE;
    var poR = lr.property("ADBE Text Properties").property("ADBE Text Path Options");
    poR.property("ADBE Text Path").setValue(1);
    var anR = lr.property("ADBE Text Properties").property("ADBE Text Animators").addProperty("ADBE Text Animator");
    anR.name = "Letras em pe";
    anR.property("ADBE Text Animator Properties").addProperty("ADBE Text Rotation X").setValue(typeof params.standAngle === "number" ? params.standAngle : -90);
    var trR = lr.property("ADBE Transform Group");
    trR.property("ADBE Anchor Point").setValue([0, 0, 0]);
    trR.property("ADBE Position").setValue(params.center && params.center.length === 3 ? params.center : [compR.width / 2, compR.height / 2, 0]);
    trR.property("ADBE Rotate X").setValue(90);
    var dirR = params.direction === "ccw" ? 1 : -1;
    var offR = typeof params.frontOffsetDegrees === "number" ? params.frontOffsetDegrees : 180; // measured live: 180 puts the word in front of a camera on -z
    var spinsR = [];
    for (var ar = 0; ar < anglesR.length; ar++) spinsR.push(Math.round((dirR * anglesR[ar] + offR) * 100) / 100);
    var timesR = params.times || [];
    if (timesR.length) {
      var nR = Math.min(timesR.length, spinsR.length);
      var tArr = "[" + timesR.slice(0, nR).join(",") + "]", vArr = "[" + spinsR.slice(0, nR).join(",") + "]";
      // step with a landing: sits on the previous angle, accelerates and IS on the new angle at times[k]
      trR.property("ADBE Rotate Z").expression =
        "var T=" + tArr + ",V=" + vArr + ",lead=" + (typeof params.lead === "number" ? params.lead : 0.14) + ",f=3.4,z=0.42,over=" + (typeof params.overshoot === "number" ? params.overshoot : 0.1) + ";" +
        "var v=V[0];for(var k=1;k<T.length;k++){var a=time-T[k],s;" +
        "if(a<=-lead){s=0;}else if(a<0){var x=(a+lead)/lead;s=x*x*x;}else{" +
        "var w=2*Math.PI*f,wd=w*Math.sqrt(1-z*z),tp=Math.atan2(wd,z*w)/wd,pk=Math.exp(-z*w*tp)*Math.sin(wd*tp);" +
        "s=1+over*Math.exp(-z*w*a)*Math.sin(wd*a)/pk;}v=v+(V[k]-v)*s;}v;";
      for (var mr = 0; mr < nR; mr++) lr.property("ADBE Marker").setValueAtTime(timesR[mr], new MarkerValue(partsR[mr]));
    } else if (typeof params.spinDegreesPerSecond === "number") {
      trR.property("ADBE Rotate Z").expression = "time*" + params.spinDegreesPerSecond + ";";
    }
    return { compName: compR.name, layer: lr.name, radius: radR, fontSize: sizeR, textWidth: Math.round(fullW), arcUsedDegrees: Math.round(fullW / radR * 180 / Math.PI * 10) / 10, wordAngles: anglesR, spinAngles: spinsR, note: "Validated live on After Effects 27 (camera on -z, default angles). If the letters lie flat or face inwards change standAngle (90 / -90); if the wrong word is in front change frontOffsetDegrees or direction." };
  }

  if (action === "ae.render.queue") {
    var rq = app.project.renderQueue;
    var compRq = __aeFindComp(params.compName, params.compIndex);
    var rqItem = rq.items.add(compRq);
    if (params.renderSettingsTemplate) {
      rqItem.applyTemplate(params.renderSettingsTemplate);
    }
    var om = rqItem.outputModule(1);
    if (params.outputModuleTemplate) {
      om.applyTemplate(params.outputModuleTemplate);
    }
    if (params.outputPath) {
      om.file = __mcpPrepareOutputFile(params.outputPath);
    }
    // Rendering inside an open undo group makes After Effects show "Undo group mismatch" (13/11/2026).
    if ((params.queueInAME === true && typeof rq.queueInAME === "function") || params.startRenderImmediately === true) {
      if (typeof __mcpCloseUndoGroup === "function") __mcpCloseUndoGroup();
    }
    if (params.queueInAME === true && typeof rq.queueInAME === "function") {
      rq.queueInAME(Boolean(params.startRenderImmediately));
    } else if (params.startRenderImmediately === true) {
      rq.render();
    }
    return {
      compName: compRq.name,
      renderQueueIndex: rq.numItems,
      status: String(rqItem.status),
      outputPath: om.file ? om.file.fsName : null
    };
  }

  if (action === "ae.raw.executeMenuCommand") {
    var cmdId = params.commandId;
    if (!cmdId && params.commandName) {
      cmdId = app.findMenuCommandId(params.commandName);
    }
    if (!cmdId) {
      throw new Error("Menu command not found: " + String(params.commandName || params.commandId));
    }
    app.executeCommand(cmdId);
    return { executed: true, commandId: cmdId, commandName: params.commandName || null };
  }

  if (action === "ae.raw.executeExtendScript") {
    // A warning dialog raised by user code (save, import, missing font) blocks After Effects until someone
    // clicks it; suppress dialogs for the duration of the script.
    var evalResult;
    var canSuppress = typeof app.beginSuppressDialogs === "function";
    if (canSuppress) app.beginSuppressDialogs();
    try {
      evalResult = (typeof __mcpEvalAeUserCode === "function") ? __mcpEvalAeUserCode(params.code) : __mcpEvalUserCode(params.code);
    } finally {
      if (canSuppress) app.endSuppressDialogs(false);
    }
    return {
      executed: true,
      result: typeof evalResult === "undefined" ? null : evalResult
    };
  }

  if (action === "adobe.inspectDom") {
    return __mcpInspectDomObject(params.targetExpression || "app", params.maxProperties || 150);
  }

  __mcpUnsupported("Unknown After Effects action: " + action);
}
