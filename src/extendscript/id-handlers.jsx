/*
 * id-handlers.jsx
 * Pure ECMAScript 3 ExtendScript handlers for Adobe InDesign (CEP panel + Windows COM DoScript).
 * Coordinates: {x, y, width, height} measured from the TOP-LEFT of the item's page, in params.units
 * (default millimetres). Every command runs with that measurement unit, page ruler origin and no dialogs.
 */

var __ID_UNITS = {
  mm: "MILLIMETERS",
  cm: "CENTIMETERS",
  pt: "POINTS",
  px: "PIXELS",
  "in": "INCHES",
  pica: "PICAS"
};

/**
 * Agents often send the two characters backslash + r for a new paragraph (the tool docs say "use \\r").
 * Turn literal \\r, \\n and \\t into the real characters so they never print as text.
 */
function __idUnescapeText(v) {
  var t = String(typeof v === "undefined" || v === null ? "" : v);
  return t.replace(/\\r/g, "\r").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}

function __idRequireDoc() {
  if (!app.documents || app.documents.length === 0) {
    throw new Error("No document is open in InDesign.");
  }
  return app.activeDocument;
}

function __idEncodeFileToBase64(fileObj) {
  if (!fileObj || !fileObj.exists) return null;
  // ExtendScript builds this string one character at a time: a photo-sized file blocks the app for minutes.
  // Past 300 KB return nothing; the server reads the file from disk (outputPath) instead.
  if (fileObj.length > 300000) return null;
  fileObj.encoding = "BINARY";
  if (!fileObj.open("r")) return null;
  var bin = fileObj.read();
  fileObj.close();
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var out = "";
  var i = 0;
  var len = bin.length;
  while (i < len) {
    var c1 = bin.charCodeAt(i++) & 0xff;
    if (i === len) {
      out += chars.charAt(c1 >> 2) + chars.charAt((c1 & 0x3) << 4) + "==";
      break;
    }
    var c2 = bin.charCodeAt(i++) & 0xff;
    if (i === len) {
      out += chars.charAt(c1 >> 2) + chars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xf0) >> 4)) + chars.charAt((c2 & 0xf) << 2) + "=";
      break;
    }
    var c3 = bin.charCodeAt(i++) & 0xff;
    out += chars.charAt(c1 >> 2) + chars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xf0) >> 4)) +
      chars.charAt(((c2 & 0xf) << 2) | ((c3 & 0xc0) >> 6)) + chars.charAt(c3 & 0x3f);
  }
  return out;
}

function __idRound(n) {
  return Math.round(n * 1000) / 1000;
}

/** geometricBounds [top, left, bottom, right] -> {x, y, width, height}. */
function __idBox(bounds) {
  return {
    x: __idRound(bounds[1]),
    y: __idRound(bounds[0]),
    width: __idRound(bounds[3] - bounds[1]),
    height: __idRound(bounds[2] - bounds[0])
  };
}

function __idBounds(rect) {
  if (!rect) throw new Error("A rectangle {x, y, width, height} is required.");
  return [rect.y, rect.x, rect.y + rect.height, rect.x + rect.width];
}

function __idPage(doc, pageRef) {
  if (typeof pageRef === "number") {
    if (pageRef < 1 || pageRef > doc.pages.length) {
      throw new Error("Page " + pageRef + " does not exist; the document has " + doc.pages.length + " page(s).");
    }
    return doc.pages[pageRef - 1];
  }
  if (typeof pageRef === "string" && pageRef !== "") {
    var p = doc.pages.itemByName(pageRef);
    if (!p.isValid) throw new Error("Page named '" + pageRef + "' not found.");
    return p;
  }
  try {
    return app.activeWindow.activePage;
  } catch (_e) {
    return doc.pages[0];
  }
}

/**
 * Direct children of a page or group in stacking order, front first. pageItems comes grouped by type (rectangles,
 * then text frames, then groups), not by stacking; allPageItems is in stacking order but also holds nested items
 * (tested 24/11/2026), so keep only the ones whose parent is the container (for a page: its spread).
 */
function __idStackOrder(container, fallback) {
  var out = [];
  try {
    var all = container.allPageItems;
    var isPage = String(container.constructor.name) === "Page";
    var parentId = isPage ? container.parent.id : container.id;
    for (var i = 0; i < all.length; i++) {
      var p = all[i].parent;
      if (p && p.id === parentId && String(p.constructor.name) !== "Character") out.push(all[i]);
    }
  } catch (_eSo) {
    out = [];
  }
  if (!out.length && fallback) {
    for (var j = 0; j < fallback.length; j++) out.push(fallback[j]);
  }
  return out;
}

function __idTypeName(item) {
  // page.pageItems answers generic "PageItem" objects: getElements() gives the real one (TextFrame, Rectangle...).
  try {
    var real = item.getElements ? item.getElements()[0] : item;
    return String(real.constructor.name);
  } catch (_e) {
    return "PageItem";
  }
}

function __idDescribeItem(item) {
  var out = {
    id: item.id,
    name: String(item.name || ""),
    type: __idTypeName(item),
    label: String(item.label || "")
  };
  try {
    out.page = item.parentPage ? String(item.parentPage.name) : null;
  } catch (_eP) {
    out.page = null;
  }
  try {
    var box = __idBox(item.geometricBounds);
    out.x = box.x;
    out.y = box.y;
    out.width = box.width;
    out.height = box.height;
  } catch (_eB) {}
  try {
    out.layer = String(item.itemLayer.name);
  } catch (_eL) {}
  if (out.type === "TextFrame") {
    try {
      var txt = String(item.contents || "");
      out.text = txt.length > 120 ? txt.substring(0, 120) + "\u2026" : txt;
      out.overset = Boolean(item.overflows);
    } catch (_eT) {}
  }
  try {
    if (item.graphics && item.graphics.length > 0 && item.graphics[0].itemLink) {
      out.link = String(item.graphics[0].itemLink.filePath);
    }
  } catch (_eG) {}
  return out;
}

function __idFindById(doc, id) {
  var all = doc.allPageItems;
  for (var i = 0; i < all.length; i++) {
    if (all[i].id === id) return all[i];
  }
  return null;
}

/** Targets: ids, names, or the current selection. Named targets that do not exist are an error. */
function __idTargets(doc, params) {
  var out = [];
  var named = false;
  var i, j;
  if (params.ids instanceof Array && params.ids.length) {
    named = true;
    for (i = 0; i < params.ids.length; i++) {
      var hit = __idFindById(doc, params.ids[i]);
      if (hit) out.push(hit);
    }
  }
  if (params.names instanceof Array && params.names.length) {
    named = true;
    var all = doc.allPageItems;
    for (i = 0; i < params.names.length; i++) {
      for (j = 0; j < all.length; j++) {
        if (all[j].name === params.names[i]) out.push(all[j]);
      }
    }
  }
  if (!named && params.useSelection !== false && app.selection && app.selection.length) {
    for (i = 0; i < app.selection.length; i++) {
      var sel = app.selection[i];
      var hasBounds = false;
      try {
        hasBounds = typeof sel.geometricBounds !== "undefined";
      } catch (_eS) {
        hasBounds = false;
      }
      if (hasBounds) out.push(sel);
    }
  }
  if (out.length === 0) {
    throw new Error(named ? "No object matches the given ids / names. Use id_find_objects." : "No target: give ids or names, or select objects in InDesign.");
  }
  return out;
}

/** Colour spec -> swatch: an existing swatch name, '#RRGGBB', [r,g,b] (0-255) or [c,m,y,k] (0-100). */
function __idColor(doc, spec) {
  if (spec === null || typeof spec === "undefined") return null;
  if (typeof spec === "string") {
    var existing = doc.swatches.itemByName(spec);
    if (existing.isValid) return existing;
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(spec);
    if (!m) throw new Error("Unknown swatch '" + spec + "'. Use a swatch name, '#RRGGBB', [r,g,b] or [c,m,y,k].");
    spec = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  }
  if (spec instanceof Array && (spec.length === 3 || spec.length === 4)) {
    var isRgb = spec.length === 3;
    var name = isRgb
      ? "R=" + spec[0] + " G=" + spec[1] + " B=" + spec[2]
      : "C=" + spec[0] + " M=" + spec[1] + " Y=" + spec[2] + " K=" + spec[3];
    var found = doc.colors.itemByName(name);
    if (found.isValid) return found;
    return doc.colors.add({
      name: name,
      model: ColorModel.PROCESS,
      space: isRgb ? ColorSpace.RGB : ColorSpace.CMYK,
      colorValue: spec
    });
  }
  throw new Error("Unsupported colour: " + String(spec));
}

function __idJustification(name) {
  var map = {
    left: "LEFT_ALIGN",
    center: "CENTER_ALIGN",
    right: "RIGHT_ALIGN",
    justify: "LEFT_JUSTIFIED",
    justifyAll: "FULLY_JUSTIFIED"
  };
  if (!map[name]) throw new Error("Unknown alignment '" + name + "'.");
  return Justification[map[name]];
}

/** Applies character/paragraph formatting to a Text object (story, frame text, paragraph...). */
function __idFormatText(doc, text, f, warnings) {
  if (!f) return;
  try {
    if (f.fontFamily) text.appliedFont = f.fontFamily;
  } catch (eF) {
    warnings.push("font '" + f.fontFamily + "': " + eF.message);
  }
  try {
    if (f.fontStyle) text.fontStyle = f.fontStyle;
  } catch (eS) {
    warnings.push("font style '" + f.fontStyle + "': " + eS.message);
  }
  if (typeof f.size === "number" || typeof f.size === "string") text.pointSize = __idPt(f.size);
  if (typeof f.leading === "number" || typeof f.leading === "string") text.leading = __idPt(f.leading);
  if (typeof f.tracking === "number") text.tracking = f.tracking;
  if (f.color) text.fillColor = __idColor(doc, f.color);
  if (f.align) text.justification = __idJustification(f.align);
  if (typeof f.spaceBefore === "number") text.spaceBefore = f.spaceBefore;
  if (typeof f.spaceAfter === "number") text.spaceAfter = f.spaceAfter;
  if (f.capitalization === "allCaps") text.capitalization = Capitalization.ALL_CAPS;
  if (f.paragraphStyle) {
    var ps = doc.paragraphStyles.itemByName(f.paragraphStyle);
    if (!ps.isValid) warnings.push("paragraph style '" + f.paragraphStyle + "' not found");
    else text.appliedParagraphStyle = ps;
  }
  if (f.characterStyle) {
    var cs = doc.characterStyles.itemByName(f.characterStyle);
    if (!cs.isValid) warnings.push("character style '" + f.characterStyle + "' not found");
    else text.appliedCharacterStyle = cs;
  }
}

/** First baseline offset of a text frame: ascent | capHeight | leading | xHeight | embox. */
function __idCapCenter(frame, how) {
  var map = { ascent: "ASCENT_OFFSET", capHeight: "CAP_HEIGHT", leading: "LEADING_OFFSET", xHeight: "X_HEIGHT", embox: "EMBOX_HEIGHT" };
  try {
    frame.textFramePreferences.firstBaselineOffset = FirstBaseline[map[how] || "CAP_HEIGHT"];
  } catch (_eFb) {}
}

function __idApplyFrameOptions(frame, o) {
  if (!o) return;
  var prefs = frame.textFramePreferences;
  if (typeof o.columns === "number") prefs.textColumnCount = o.columns;
  if (typeof o.gutter === "number") prefs.textColumnGutter = o.gutter;
  if (typeof o.inset === "number") prefs.insetSpacing = [o.inset, o.inset, o.inset, o.inset];
  if (o.verticalAlign) {
    var va = { top: "TOP_ALIGN", center: "CENTER_ALIGN", bottom: "BOTTOM_ALIGN", justify: "JUSTIFY_ALIGN" }[o.verticalAlign];
    prefs.verticalJustification = VerticalJustification[va];
  }
  // Text centred vertically (next to an icon, inside a shape) is centred on the cap height: first baseline offset
  // Cap Height, as the user does by hand (24/11/2026). Explicit firstBaseline wins.
  var fbo = o.firstBaseline || (o.verticalAlign === "center" ? "capHeight" : null);
  if (fbo) __idCapCenter(frame, fbo);
  if (o.autoSize) {
    var as = { height: "HEIGHT_ONLY", width: "WIDTH_ONLY", both: "HEIGHT_AND_WIDTH", off: "OFF" }[o.autoSize];
    prefs.autoSizingType = AutoSizingTypeEnum[as];
  }
}

/**
 * Feather effects (Effects panel): gradient (fade to one side), basic (soft edges) or directional.
 * gradient: fadeTo top|bottom|left|right (or angle), start = % of the object where the fade begins.
 * directional: width per side (sides), edges leadingEdges|allEdges, noise, choke. The user's choice for
 * "photo dissolving into the text panel" (13/11/2026): frame fitted to the whole image, bottom 69 mm of 191 mm.
 * A gradient feather left with length 0 spans the whole object, which is what a fade needs.
 */
function __idApplyFeather(item, f) {
  var ts = item.transparencySettings;
  var type = String(f.type || "gradient");
  if (type === "none") {
    ts.gradientFeatherSettings.applied = false;
    ts.directionalFeatherSettings.applied = false;
    ts.featherSettings.mode = FeatherMode.NONE;
    return;
  }
  if (type === "gradient") {
    var gf = ts.gradientFeatherSettings;
    gf.applied = true;
    gf.type = f.shape === "radial" ? GradientType.RADIAL : GradientType.LINEAR;
    var angles = { bottom: -90, top: 90, right: 0, left: 180 };
    gf.angle = typeof f.angle === "number" ? f.angle : angles[String(f.fadeTo || "bottom")];
    var stops = gf.opacityGradientStops;
    var startAt = typeof f.start === "number" ? Math.max(0, Math.min(99, f.start)) : 0;
    stops[0].opacity = 100;
    stops[0].location = startAt;
    stops[stops.length - 1].opacity = typeof f.endOpacity === "number" ? f.endOpacity : 0;
    stops[stops.length - 1].location = 100;
    return;
  }
  if (type === "basic") {
    var bf = ts.featherSettings;
    bf.mode = FeatherMode.STANDARD;
    if (typeof f.width === "number") bf.width = f.width;
    if (typeof f.choke === "number") bf.chokeAmount = f.choke;
    return;
  }
  if (type === "directional") {
    var df = ts.directionalFeatherSettings;
    df.applied = true;
    var w = typeof f.width === "number" ? f.width : 5;
    var sides = f.sides || { bottom: w };
    df.topWidth = sides.top || 0;
    df.bottomWidth = sides.bottom || 0;
    df.leftWidth = sides.left || 0;
    df.rightWidth = sides.right || 0;
    if (typeof f.angle === "number") df.angle = f.angle;
    if (typeof f.noise === "number") df.noise = f.noise;
    if (typeof f.choke === "number") df.chokeAmount = f.choke;
    // "Leading Edges" (the Effects panel default) feathers along the frame edge as drawn.
    var follow = { leadingEdges: "LEADING_EDGE", allEdges: "ALL_EDGES", none: "NONE" }[String(f.edges || "leadingEdges")];
    if (follow && typeof FollowShapeModeOptions !== "undefined") df.followShapeMode = FollowShapeModeOptions[follow];
    return;
  }
  throw new Error("Unknown feather type '" + type + "' (gradient, basic, directional, none).");
}

function __idApplyItemStyle(doc, item, p) {
  if (p.fillColor) item.fillColor = __idColor(doc, p.fillColor);
  if (p.strokeColor) item.strokeColor = __idColor(doc, p.strokeColor);
  if (typeof p.strokeWeight === "number") item.strokeWeight = p.strokeWeight;
  if (typeof p.cornerRadius === "number" && p.cornerRadius > 0) {
    item.topLeftCornerOption = CornerOptions.ROUNDED_CORNER;
    item.topRightCornerOption = CornerOptions.ROUNDED_CORNER;
    item.bottomLeftCornerOption = CornerOptions.ROUNDED_CORNER;
    item.bottomRightCornerOption = CornerOptions.ROUNDED_CORNER;
    item.topLeftCornerRadius = p.cornerRadius;
    item.topRightCornerRadius = p.cornerRadius;
    item.bottomLeftCornerRadius = p.cornerRadius;
    item.bottomRightCornerRadius = p.cornerRadius;
  }
  if (typeof p.opacity === "number") item.transparencySettings.blendingSettings.opacity = p.opacity;
  if (p.blendMode) {
    var bm = String(p.blendMode).replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
    if (typeof BlendMode[bm] === "undefined") throw new Error("Unknown blend mode '" + p.blendMode + "'.");
    item.transparencySettings.blendingSettings.blendMode = BlendMode[bm];
  }
  if (p.dropShadow) {
    var ds = item.transparencySettings.dropShadowSettings;
    if (p.dropShadow.enabled === false) {
      ds.mode = ShadowMode.NONE;
    } else {
      ds.mode = ShadowMode.DROP;
      if (typeof p.dropShadow.distance === "number") ds.distance = p.dropShadow.distance;
      if (typeof p.dropShadow.angle === "number") ds.angle = p.dropShadow.angle;
      if (typeof p.dropShadow.size === "number") ds.size = p.dropShadow.size;
      if (typeof p.dropShadow.opacity === "number") ds.opacity = p.dropShadow.opacity;
      if (p.dropShadow.color) ds.effectColor = __idColor(doc, p.dropShadow.color);
    }
  }
  if (p.feather) __idApplyFeather(item, p.feather);
  if (p.objectStyle) {
    var os = doc.objectStyles.itemByName(p.objectStyle);
    if (!os.isValid) throw new Error("Object style '" + p.objectStyle + "' not found.");
    item.appliedObjectStyle = os;
  }
  if (p.layer) {
    var lyr = doc.layers.itemByName(p.layer);
    if (!lyr.isValid) throw new Error("Layer '" + p.layer + "' not found.");
    item.itemLayer = lyr;
  }
  if (p.name) item.name = String(p.name);
  if (p.label) item.label = String(p.label);
}

function __idParentByName(doc, name) {
  if (!name) return null;
  var direct = doc.masterSpreads.itemByName(name);
  if (direct.isValid) return direct;
  for (var i = 0; i < doc.masterSpreads.length; i++) {
    var ms = doc.masterSpreads[i];
    if (String(ms.name).toLowerCase().indexOf(String(name).toLowerCase()) === 0 || String(ms.namePrefix) === String(name)) {
      return ms;
    }
  }
  throw new Error("Parent page '" + name + "' not found.");
}

function __idStyleCollection(doc, kind) {
  if (kind === "paragraph") return doc.paragraphStyles;
  if (kind === "character") return doc.characterStyles;
  if (kind === "object") return doc.objectStyles;
  if (kind === "table") return doc.tableStyles;
  if (kind === "cell") return doc.cellStyles;
  throw new Error("Unknown style kind '" + kind + "'.");
}

/**
 * Type sizes are points whatever the measurement unit of the call: a bare number would be read in the
 * unit set for the command (with the default "mm", size 16 became 16 mm, about 45 pt). Strings that
 * already carry a unit ("12pt", "4mm") are passed through.
 */
function __idPt(v) {
  return typeof v === "number" ? v + "pt" : v;
}

/** Style properties from friendly names: fontFamily, fontStyle, size, leading, color, align... */
function __idStyleProps(doc, kind, p) {
  var props = {};
  if (!p) return props;
  if (kind === "paragraph" || kind === "character") {
    if (p.fontFamily) props.appliedFont = p.fontFamily;
    if (p.fontStyle) props.fontStyle = p.fontStyle;
    if (typeof p.size === "number" || typeof p.size === "string") props.pointSize = __idPt(p.size);
    if (typeof p.leading === "number" || typeof p.leading === "string") props.leading = __idPt(p.leading);
    if (typeof p.tracking === "number") props.tracking = p.tracking;
    if (p.color) props.fillColor = __idColor(doc, p.color);
    if (p.capitalization === "allCaps") props.capitalization = Capitalization.ALL_CAPS;
  }
  if (kind === "paragraph") {
    if (p.align) props.justification = __idJustification(p.align);
    if (typeof p.spaceBefore === "number") props.spaceBefore = p.spaceBefore;
    if (typeof p.spaceAfter === "number") props.spaceAfter = p.spaceAfter;
    if (typeof p.firstLineIndent === "number") props.firstLineIndent = p.firstLineIndent;
    if (typeof p.hyphenation === "boolean") props.hyphenation = p.hyphenation;
  }
  if (kind === "object") {
    if (p.fillColor) props.fillColor = __idColor(doc, p.fillColor);
    if (p.strokeColor) props.strokeColor = __idColor(doc, p.strokeColor);
    if (typeof p.strokeWeight === "number") props.strokeWeight = p.strokeWeight;
  }
  if (kind === "cell") {
    if (p.fillColor) props.fillColor = __idColor(doc, p.fillColor);
    if (typeof p.fillTint === "number") props.fillTint = p.fillTint;
    if (p.paragraphStyle) {
      var cps = doc.paragraphStyles.itemByName(p.paragraphStyle);
      if (!cps.isValid) throw new Error("Paragraph style '" + p.paragraphStyle + "' not found (create it first).");
      props.appliedParagraphStyle = cps;
    }
    if (typeof p.inset === "number") {
      props.topInset = p.inset;
      props.bottomInset = p.inset;
      props.leftInset = p.inset;
      props.rightInset = p.inset;
    }
    if (p.verticalAlign) {
      var vjC = { top: "TOP_ALIGN", center: "CENTER_ALIGN", bottom: "BOTTOM_ALIGN", justify: "JUSTIFY_ALIGN" }[p.verticalAlign];
      if (vjC) props.verticalJustification = VerticalJustification[vjC];
      if (p.verticalAlign === "center" && typeof FirstBaseline !== "undefined") props.firstBaselineOffset = FirstBaseline.CAP_HEIGHT;
    }
    var edges = ["top", "bottom", "left", "right"];
    for (var ce = 0; ce < edges.length; ce++) {
      if (p.strokeColor) props[edges[ce] + "EdgeStrokeColor"] = __idColor(doc, p.strokeColor);
      if (typeof p.strokeWeight === "number") props[edges[ce] + "EdgeStrokeWeight"] = __idPt(p.strokeWeight);
    }
  }
  if (kind === "table") {
    var regions = { headerCellStyle: "headerRegionCellStyle", bodyCellStyle: "bodyRegionCellStyle", footerCellStyle: "footerRegionCellStyle", leftColumnCellStyle: "leftColumnRegionCellStyle", rightColumnCellStyle: "rightColumnRegionCellStyle" };
    for (var rk in regions) {
      if (!regions.hasOwnProperty(rk) || !p[rk]) continue;
      var cst = doc.cellStyles.itemByName(p[rk]);
      if (!cst.isValid) throw new Error("Cell style '" + p[rk] + "' not found (create it with kind 'cell' first).");
      props[regions[rk]] = cst;
    }
    if (p.alternateRowFill) {
      // Table styles have no alternatingFills switch: giving the row fills turns the zebra on (checked in InDesign 2027).
      props.startRowFillColor = __idColor(doc, p.rowFill || "None");
      props.startRowFillCount = 1;
      props.endRowFillColor = __idColor(doc, p.alternateRowFill);
      props.endRowFillCount = 1;
      if (typeof p.alternateRowTint === "number") props.endRowFillTint = p.alternateRowTint;
    }
    var bord = ["top", "bottom", "left", "right"];
    for (var tb = 0; tb < bord.length; tb++) {
      if (p.borderColor) props[bord[tb] + "BorderStrokeColor"] = __idColor(doc, p.borderColor);
      if (typeof p.borderWeight === "number") props[bord[tb] + "BorderStrokeWeight"] = __idPt(p.borderWeight);
    }
    if (typeof p.spaceBefore === "number") props.spaceBefore = p.spaceBefore;
    if (typeof p.spaceAfter === "number") props.spaceAfter = p.spaceAfter;
  }
  return props;
}

function __idKeys(o) {
  var k = [];
  for (var n in o) if (o.hasOwnProperty(n)) k.push(n);
  return k;
}

/** Sets properties one by one; a property the app refuses becomes a warning instead of failing the call. */
function __idSetProps(obj, props) {
  var warnings = [];
  for (var k in props) {
    if (!props.hasOwnProperty(k)) continue;
    try {
      obj[k] = props[k];
    } catch (e) {
      warnings.push(k + ": " + e.message);
    }
  }
  return warnings;
}

function __idPageNumberStyle(name) {
  var map = { arabic: "ARABIC", romanUpper: "UPPER_ROMAN", romanLower: "LOWER_ROMAN", lettersUpper: "UPPER_LETTERS", lettersLower: "LOWER_LETTERS" };
  if (!map[name]) throw new Error("Unknown numbering '" + name + "'. Use arabic, romanUpper, romanLower, lettersUpper or lettersLower.");
  return PageNumberStyle[map[name]];
}

function __idDescribeSection(sec) {
  var out = { name: String(sec.name), startPage: null, pageCount: 0, continueNumbering: !!sec.continueNumbering, startNumber: null, prefix: "", marker: "" };
  try {
    out.startPage = String(sec.pageStart.name);
    out.startPageIndex = sec.pageStart.documentOffset + 1;
  } catch (_e1) {}
  try {
    out.pageCount = sec.length;
  } catch (_e2) {}
  try {
    out.startNumber = sec.continueNumbering ? null : sec.pageNumberStart;
  } catch (_e3) {}
  try {
    out.prefix = String(sec.sectionPrefix || "");
    out.includePrefix = !!sec.includeSectionPrefix;
  } catch (_e4) {}
  try {
    out.marker = String(sec.marker || "");
  } catch (_e5) {}
  try {
    var st = sec.pageNumberStyle;
    out.numbering = st === PageNumberStyle.UPPER_ROMAN ? "romanUpper" : (st === PageNumberStyle.LOWER_ROMAN ? "romanLower" : (st === PageNumberStyle.UPPER_LETTERS ? "lettersUpper" : (st === PageNumberStyle.LOWER_LETTERS ? "lettersLower" : "arabic")));
  } catch (_e6) {}
  return out;
}

/** The frames of a story, in thread order. */
function __idChain(frame) {
  var first = frame;
  var guard = 0;
  while (first.previousTextFrame && first.previousTextFrame.isValid && guard++ < 2000) first = first.previousTextFrame;
  var out = [];
  var f = first;
  guard = 0;
  while (f && f.isValid && guard++ < 2000) {
    var pg = null;
    try {
      pg = f.parentPage ? String(f.parentPage.name) : null;
    } catch (_eP) {}
    out.push({ id: f.id, name: String(f.name || ""), page: pg });
    f = f.nextTextFrame;
  }
  return out;
}

function __idDispatch(action, params, _options) {
  if (action === "adobe.ping") {
    return { pong: true, app: "indesign", version: String(app.version), documents: app.documents.length };
  }
  if (action === "adobe.checkpoint") {
    if (app.documents.length === 0) throw new Error("No open InDesign document to checkpoint.");
    var cpI = app.activeDocument;
    var cpIOrig = null;
    try {
      cpIOrig = cpI.fullName;
    } catch (_eCpId) {
      cpIOrig = null;
    }
    var cpIDest = __mcpCheckpointFile(cpI.name, "indd", params.label, params.folder, cpIOrig);
    cpI.saveACopy(cpIDest);
    return {
      app: "indesign",
      document: cpI.name,
      checkpointPath: cpIDest.fsName,
      method: "saveACopy",
      documentPathChanged: false,
      originalPath: cpIOrig ? cpIOrig.fsName : null
    };
  }
  params = params || {};

  if (action === "id.layout.info") {
    // Page items of one page for id_organize_objects (units come from params.units; origin = page top-left).
    var docLI = __idRequireDoc();
    var pageLI = __idPage(docLI, params.page);
    var kindLI = function (it) {
      var t = __idTypeName(it);
      if (t === "TextFrame") return "text";
      if (t === "Group") return "group";
      try {
        if (it.graphics && it.graphics.length > 0) return "pixel";
      } catch (_eGr) {}
      if (t === "Rectangle" || t === "Oval" || t === "Polygon" || t === "GraphicLine") return "shape";
      return "other";
    };
    var nodeLI = function (it0, depth) {
      var it = it0;
      try { if (it0.getElements) it = it0.getElements()[0]; } catch (_eGe) {}
      var gb = it.geometricBounds;
      var n = { id: it.id, name: String(it.name || ""), kind: kindLI(it), bounds: [gb[1], gb[0], gb[3], gb[2]], visible: it.visible !== false };
      if (n.kind === "text") {
        try { n.text = String(it.contents).slice(0, 80); } catch (_eT) {}
      }
      if (n.kind === "group" && depth < 6) {
        n.children = [];
        var kids = __idStackOrder(it, it.pageItems);
        for (var c = 0; c < kids.length; c++) n.children.push(nodeLI(kids[c], depth + 1));
      }
      return n;
    };
    var itemsLI = [];
    var topLI = __idStackOrder(pageLI, pageLI.pageItems);
    for (var i = 0; i < topLI.length; i++) itemsLI.push(nodeLI(topLI[i], 0));
    var pb = pageLI.bounds;
    return { documentName: docLI.name, page: String(pageLI.name), width: pb[3] - pb[1], height: pb[2] - pb[0], layers: itemsLI };
  }

  if (action === "id.layout.groupPlan") {
    var docGP = __idRequireDoc();
    var madeGP = [];
    var failedGP = [];
    var buildGP = function (g) {
      var items = [];
      var m;
      for (m = 0; m < (g.members || []).length; m++) {
        var it = __idFindById(docGP, Number(g.members[m]));
        if (it) items.push(it);
      }
      for (m = 0; m < (g.children || []).length; m++) {
        var sub = buildGP(g.children[m]);
        if (sub) items.push(sub);
      }
      if (items.length < 2) return items.length === 1 ? items[0] : null;
      try {
        var grp = docGP.groups.add(items);
        grp.name = String(g.name);
        madeGP.push({ name: grp.name, id: grp.id, items: items.length });
        return grp;
      } catch (eGP) {
        failedGP.push({ name: g.name, error: String(eGP) });
        return null;
      }
    };
    for (var gi = 0; gi < (params.groups || []).length; gi++) buildGP(params.groups[gi]);
    return { documentName: docGP.name, created: madeGP, failed: failedGP };
  }

  if (action === "id.batch") {
    return __mcpBatch(params, "id");
  }

  if (action === "id.doc.getInfo") {
    var docs = [];
    for (var d = 0; d < app.documents.length; d++) docs.push(String(app.documents[d].name));
    if (app.documents.length === 0) return { open: docs, active: null };
    var doc = app.activeDocument;
    var prefs = doc.documentPreferences;
    var info = {
      open: docs,
      active: String(doc.name),
      filePath: doc.saved ? String(doc.fullName.fsName) : null,
      modified: doc.modified,
      units: params.units || "mm",
      pageWidth: __idRound(prefs.pageWidth),
      pageHeight: __idRound(prefs.pageHeight),
      facingPages: prefs.facingPages,
      pages: [],
      parents: [],
      layers: [],
      paragraphStyles: [],
      characterStyles: [],
      objectStyles: [],
      swatches: [],
      counts: { pageItems: doc.allPageItems.length, stories: doc.stories.length, links: doc.links.length }
    };
    try {
      info.bleed = { top: __idRound(prefs.documentBleedTopOffset), bottom: __idRound(prefs.documentBleedBottomOffset), inside: __idRound(prefs.documentBleedInsideOrLeftOffset), outside: __idRound(prefs.documentBleedOutsideOrRightOffset) };
    } catch (_eB) {}
    for (var p = 0; p < doc.pages.length && p < 500; p++) {
      var pg = doc.pages[p];
      info.pages.push({ name: String(pg.name), parent: pg.appliedMaster ? String(pg.appliedMaster.name) : null, items: pg.pageItems.length });
    }
    for (var m = 0; m < doc.masterSpreads.length; m++) info.parents.push(String(doc.masterSpreads[m].name));
    for (var l = 0; l < doc.layers.length; l++) info.layers.push({ name: String(doc.layers[l].name), visible: doc.layers[l].visible, locked: doc.layers[l].locked });
    for (var s1 = 0; s1 < doc.allParagraphStyles.length; s1++) info.paragraphStyles.push(String(doc.allParagraphStyles[s1].name));
    for (var s2 = 0; s2 < doc.allCharacterStyles.length; s2++) info.characterStyles.push(String(doc.allCharacterStyles[s2].name));
    for (var s3 = 0; s3 < doc.allObjectStyles.length; s3++) info.objectStyles.push(String(doc.allObjectStyles[s3].name));
    for (var w = 0; w < doc.swatches.length; w++) info.swatches.push(String(doc.swatches[w].name));
    return info;
  }

  if (action === "id.doc.manage") {
    var op = params.operation || "create";
    if (op === "create") {
      var nd = app.documents.add({ showingWindow: params.showWindow !== false });
      var dp = nd.documentPreferences;
      dp.facingPages = params.facingPages === true;
      dp.pageWidth = params.width || 210;
      dp.pageHeight = params.height || 297;
      dp.pagesPerDocument = params.pages || 1;
      if (typeof params.bleed === "number") {
        dp.documentBleedUniformSize = true;
        dp.documentBleedTopOffset = params.bleed;
      }
      if (params.margins) {
        var mp = nd.masterSpreads[0].pages;
        for (var mi = 0; mi < mp.length; mi++) {
          mp[mi].marginPreferences.properties = { top: params.margins, bottom: params.margins, left: params.margins, right: params.margins };
          if (typeof params.columns === "number") mp[mi].marginPreferences.columnCount = params.columns;
          if (typeof params.gutter === "number") mp[mi].marginPreferences.columnGutter = params.gutter;
        }
      }
      if (params.intent === "web") dp.intent = DocumentIntentOptions.WEB_INTENT;
      return { created: true, name: String(nd.name), pages: nd.pages.length, width: dp.pageWidth, height: dp.pageHeight, units: params.units || "mm" };
    }
    if (op === "open") {
      var of = new File(params.filePath);
      if (!of.exists) throw new Error("File not found: " + params.filePath);
      var od = app.open(of);
      return { opened: true, name: String(od.name), pages: od.pages.length };
    }
    var dd = __idRequireDoc();
    if (op === "save") {
      if (params.filePath) {
        var ddF = __mcpPrepareOutputFile(params.filePath);
        dd.save(ddF);
        __mcpVerifySaved(ddF, dd.fullName ? dd.fullName.fsName : null);
        return { saved: true, filePath: ddF.fsName };
      }
      if (!dd.saved && !(dd.fullName && dd.fullName.exists)) {
        __mcpFail("INVALID_PARAMS", "This document was never saved: pass filePath.");
      }
      dd.save();
      return { saved: true, filePath: String(dd.fullName.fsName) };
    }
    if (op === "close") {
      dd.close(params.save === true ? SaveOptions.YES : SaveOptions.NO);
      return { closed: true };
    }
    throw new Error("Unknown document operation '" + op + "'.");
  }

  if (action === "id.dataMerge") {
    // Template pages with {{field}} text and frames named {{field}} (images) → one copy per record.
    var docM = __idRequireDoc();
    var recs = params.records || [];
    if (!recs.length) __mcpFail("INVALID_PARAMS", "No records.");
    var first = params.templateFirstPage ? __idPage(docM, params.templateFirstPage) : docM.pages[0];
    var last = params.templateLastPage ? __idPage(docM, params.templateLastPage) : first;
    var tplPages = [];
    for (var pgi = first.documentOffset; pgi <= last.documentOffset; pgi++) tplPages.push(docM.pages[pgi]);
    var tplCount = tplPages.length;
    var fitMap = {
      fill: FitOptions.FILL_PROPORTIONALLY,
      proportionally: FitOptions.PROPORTIONALLY,
      contentAware: FitOptions.CONTENT_AWARE_FIT,
      frameToContent: FitOptions.FRAME_TO_CONTENT
    };
    var fitOpt = fitMap[params.imageFit || "fill"] || FitOptions.FILL_PROPORTIONALLY;
    var report = [];
    var missingFields = {};
    var anchorPage = docM.pages[docM.pages.length - 1];
    app.findTextPreferences = NothingEnum.NOTHING;
    app.changeTextPreferences = NothingEnum.NOTHING;
    for (var ri = 0; ri < recs.length; ri++) {
      var rec = recs[ri];
      var made = [];
      for (var tp = 0; tp < tplCount; tp++) {
        var np2 = tplPages[tp].duplicate(LocationOptions.AFTER, anchorPage);
        anchorPage = np2;
        made.push(np2);
      }
      var replaced = 0;
      var placed = 0;
      for (var mp = 0; mp < made.length; mp++) {
        var items = made[mp].allPageItems;
        for (var it = 0; it < items.length; it++) {
          var item = items[it];
          var nm = String(item.name || item.label || "");
          var mImg = /^\{\{\s*([^}]+?)\s*\}\}$/.exec(nm);
          if (mImg && !(item instanceof TextFrame)) {
            var pathV = rec[mImg[1]];
            if (typeof pathV === "undefined") {
              missingFields[mImg[1]] = true;
            } else if (pathV) {
              var imgFile = new File(pathV);
              if (imgFile.exists) {
                item.place(imgFile);
                try { item.fit(fitOpt); } catch (_eFit) {}
                if (fitOpt === FitOptions.FILL_PROPORTIONALLY) { try { item.fit(FitOptions.CENTER_CONTENT); } catch (_eC) {} }
                placed++;
              } else {
                report.push({ record: ri + 1, warning: "image not found: " + pathV });
              }
            }
            continue;
          }
          if (item instanceof TextFrame) {
            // Replace inside this frame only (the story can run through other frames).
            var txt = item.texts[0];
            app.findGrepPreferences = NothingEnum.NOTHING;
            app.findGrepPreferences.findWhat = "\\{\\{\\s*[^}]+?\\s*\\}\\}";
            var hits = txt.findGrep();
            for (var h = hits.length - 1; h >= 0; h--) {
              var key = String(hits[h].contents).replace(/^\{\{\s*|\s*\}\}$/g, "");
              if (typeof rec[key] === "undefined") {
                missingFields[key] = true;
                continue;
              }
              hits[h].contents = String(rec[key]).replace(/\\r|\\n/g, "\r");
              replaced++;
            }
            app.findGrepPreferences = NothingEnum.NOTHING;
          }
        }
      }
      report.push({ record: ri + 1, firstPage: String(made[0].name), textReplaced: replaced, imagesPlaced: placed });
    }
    if (params.removeTemplate !== false) {
      for (var rt = tplPages.length - 1; rt >= 0; rt--) tplPages[rt].remove();
    }
    var oversets = [];
    for (var st = 0; st < docM.stories.length; st++) {
      if (docM.stories[st].overflows) {
        var tfs = docM.stories[st].textContainers;
        oversets.push(tfs.length ? String(tfs[tfs.length - 1].parentPage ? tfs[tfs.length - 1].parentPage.name : "?") : "?");
      }
    }
    var miss = [];
    for (var mf in missingFields) if (Object.prototype.hasOwnProperty.call(missingFields, mf)) miss.push(mf);
    return { records: recs.length, pagesPerRecord: tplCount, pages: docM.pages.length, details: report, missingFields: miss, oversetOnPages: oversets };
  }

  if (action === "id.page.manage") {
    var docP = __idRequireDoc();
    var opP = params.operation || "add";
    if (opP === "add") {
      var count = params.count || 1;
      var anchor = params.afterPage ? __idPage(docP, params.afterPage) : null;
      var added = [];
      for (var a = 0; a < count; a++) {
        var np = anchor ? docP.pages.add(LocationOptions.AFTER, anchor) : docP.pages.add(LocationOptions.AT_END);
        if (params.parent) np.appliedMaster = __idParentByName(docP, params.parent);
        anchor = anchor ? np : null;
        added.push(String(np.name));
      }
      return { added: added, total: docP.pages.length };
    }
    var target = __idPage(docP, params.page);
    if (opP === "remove") {
      var removedName = String(target.name);
      target.remove();
      return { removed: removedName, total: docP.pages.length };
    }
    if (opP === "duplicate") {
      var dup = target.duplicate(LocationOptions.AFTER, target);
      return { duplicate: String(dup.name), total: docP.pages.length };
    }
    if (opP === "move") {
      var dest = __idPage(docP, params.toPage);
      target.move(LocationOptions.AFTER, dest);
      return { moved: String(target.name) };
    }
    if (opP === "applyParent") {
      target.appliedMaster = params.parent === "None" ? NothingEnum.NOTHING : __idParentByName(docP, params.parent);
      return { page: String(target.name), parent: params.parent };
    }
    throw new Error("Unknown page operation '" + opP + "'.");
  }

  if (action === "id.item.find") {
    var docF = __idRequireDoc();
    var allF = docF.allPageItems;
    var outF = [];
    var limit = params.limit || 300;
    var contains = params.nameContains ? String(params.nameContains).toLowerCase() : null;
    var textContains = params.textContains ? String(params.textContains).toLowerCase() : null;
    for (var f = 0; f < allF.length && outF.length < limit; f++) {
      var it = allF[f];
      if (params.type && __idTypeName(it) !== params.type) continue;
      if (params.name && it.name !== params.name) continue;
      if (contains && String(it.name).toLowerCase().indexOf(contains) === -1) continue;
      if (params.page) {
        var pp = null;
        try {
          pp = it.parentPage ? String(it.parentPage.name) : null;
        } catch (_eP) {}
        if (pp !== String(params.page)) continue;
      }
      if (params.layer) {
        try {
          if (String(it.itemLayer.name) !== params.layer) continue;
        } catch (_eL) {
          continue;
        }
      }
      if (textContains) {
        if (__idTypeName(it) !== "TextFrame" || String(it.contents).toLowerCase().indexOf(textContains) === -1) continue;
      }
      outF.push(__idDescribeItem(it));
    }
    return { total: allF.length, count: outF.length, items: outF, coordinateNote: "x/y from the top-left of the item's page, in " + (params.units || "mm") + "." };
  }

  if (action === "id.item.modify") {
    var docM = __idRequireDoc();
    var itemsM = __idTargets(docM, params);
    var outM = [];
    for (var im = 0; im < itemsM.length; im++) {
      var item = itemsM[im];
      if (params.remove === true) {
        outM.push({ removed: true, id: item.id });
        item.remove();
        continue;
      }
      if (params.duplicate === true) {
        item = item.duplicate();
      }
      if (params.position) item.move([params.position.x, params.position.y]);
      if (params.moveBy) item.move(undefined, [params.moveBy.x || 0, params.moveBy.y || 0]);
      if (params.size) {
        var gb = item.geometricBounds;
        var w = typeof params.size.width === "number" ? params.size.width : gb[3] - gb[1];
        var h = typeof params.size.height === "number" ? params.size.height : gb[2] - gb[0];
        item.geometricBounds = [gb[0], gb[1], gb[0] + h, gb[1] + w];
      }
      if (typeof params.rotate === "number") item.rotationAngle = params.rotate;
      __idApplyItemStyle(docM, item, params);
      if (params.fit) {
        var fitMap = { proportionally: "PROPORTIONALLY", fill: "FILL_PROPORTIONALLY", contentToFrame: "CONTENT_TO_FRAME", frameToContent: "FRAME_TO_CONTENT", center: "CENTER_CONTENT", contentAware: "CONTENT_AWARE_FIT" };
        item.fit(FitOptions[fitMap[params.fit]]);
      }
      if (params.zOrder === "bringToFront") item.bringToFront();
      if (params.zOrder === "sendToBack") item.sendToBack();
      if (params.zOrder === "bringForward") item.bringForward();
      if (params.zOrder === "sendBackward") item.sendBackward();
      if (typeof params.locked === "boolean") item.locked = params.locked;
      if (typeof params.visible === "boolean") item.visible = params.visible;
      outM.push(__idDescribeItem(item));
    }
    return { count: outM.length, items: outM };
  }

  if (action === "id.text.createFrame") {
    var docT = __idRequireDoc();
    var pageT = __idPage(docT, params.page);
    var frame = pageT.textFrames.add({ geometricBounds: __idBounds(params.rect) });
    if (params.layer) __idApplyItemStyle(docT, frame, { layer: params.layer });
    frame.contents = __idUnescapeText(params.contents);
    var warnT = [];
    __idFormatText(docT, frame.parentStory.texts[0], params.format, warnT);
    __idApplyFrameOptions(frame, params.frame);
    __idApplyItemStyle(docT, frame, { fillColor: params.fillColor, name: params.name, objectStyle: params.objectStyle });
    var descT = __idDescribeItem(frame);
    descT.warnings = warnT;
    return descT;
  }

  if (action === "id.textWrap") {
    var docW = __idRequireDoc();
    var itemsW = __idTargets(docW, params);
    if (!itemsW.length) __mcpFail("INVALID_PARAMS", "No objects: give ids or names of the objects the text should wrap around.");
    var modesW = { none: TextWrapModes.NONE, boundingBox: TextWrapModes.BOUNDING_BOX_TEXT_WRAP, contour: TextWrapModes.CONTOUR, jumpObject: TextWrapModes.JUMP_OBJECT_TEXT_WRAP, nextColumn: TextWrapModes.NEXT_COLUMN_TEXT_WRAP };
    var modeW = modesW[params.mode || "boundingBox"];
    if (modeW === undefined) __mcpFail("INVALID_PARAMS", "mode must be none, boundingBox, contour, jumpObject or nextColumn.");
    var offW = params.offset;
    var outW = [];
    for (var iw = 0; iw < itemsW.length; iw++) {
      var twp = itemsW[iw].textWrapPreferences;
      twp.textWrapMode = modeW;
      if (offW !== undefined && (params.mode || "boundingBox") !== "none") {
        if (offW instanceof Array) twp.textWrapOffset = offW;
        else if ((params.mode || "boundingBox") === "contour") twp.textWrapOffset = Number(offW);
        else twp.textWrapOffset = [Number(offW), Number(offW), Number(offW), Number(offW)];
      }
      if (typeof params.invert === "boolean") twp.inverse = params.invert;
      outW.push({ id: itemsW[iw].id, name: itemsW[iw].name, mode: params.mode || "boundingBox" });
    }
    return { changed: outW.length, items: outW };
  }

  if (action === "id.qrCode") {
    var docQ = __idRequireDoc();
    var pageQ = __idPage(docQ, params.page);
    var kindQ = params.kind || "url";
    var valueQ = String(params.value || "");
    if (!valueQ) __mcpFail("INVALID_PARAMS", "value is required: the URL or the text the code carries.");
    var boxQ = pageQ.rectangles.add({ geometricBounds: __idBounds(params.rect) });
    if (params.layer) __idApplyItemStyle(docQ, boxQ, { layer: params.layer });
    var swQ = undefined;
    if (params.color !== undefined) swQ = __idColor(docQ, params.color);
    if (kindQ === "url") boxQ.createHyperlinkQRCode(valueQ, swQ);
    else if (kindQ === "text") boxQ.createPlainTextQRCode(valueQ, swQ);
    else if (kindQ === "email") boxQ.createEmailQRCode(valueQ, String(params.subject || ""), String(params.body || ""), swQ);
    else __mcpFail("INVALID_PARAMS", "kind must be url, text or email.");
    if (params.name) boxQ.name = String(params.name);
    var descQ = __idDescribeItem(boxQ);
    descQ.qr = { kind: kindQ, value: valueQ };
    return descQ;
  }

  if (action === "id.paragraphOptions") {
    var docO = __idRequireDoc();
    var framesO = __idTargets(docO, params);
    if (!framesO.length) __mcpFail("INVALID_PARAMS", "No text frames: give ids or names.");
    var alignO = { left: TabStopAlignment.LEFT_ALIGN, center: TabStopAlignment.CENTER_ALIGN, right: TabStopAlignment.RIGHT_ALIGN, decimal: TabStopAlignment.CHARACTER_ALIGN };
    var changedO = 0;
    for (var io = 0; io < framesO.length; io++) {
      if (__idTypeName(framesO[io]) !== "TextFrame") throw new Error("Object " + framesO[io].id + " is a " + __idTypeName(framesO[io]) + ", not a TextFrame.");
      var parasO = framesO[io].parentStory.paragraphs;
      var fromO = typeof params.paragraphIndex === "number" ? params.paragraphIndex : 0;
      var toO = typeof params.paragraphIndex === "number" ? params.paragraphIndex : parasO.length - 1;
      if (fromO < 0 || fromO >= parasO.length) __mcpFail("INVALID_PARAMS", "paragraphIndex " + fromO + " does not exist (the story has " + parasO.length + " paragraphs).");
      for (var po = fromO; po <= toO; po++) {
        var pO = parasO[po];
        if (params.dropCap) {
          pO.dropCapLines = Number(params.dropCap.lines) || 0;
          pO.dropCapCharacters = pO.dropCapLines > 0 ? (Number(params.dropCap.characters) || 1) : 0;
        }
        if (params.span) {
          if (params.span === "all") { pO.spanColumnType = SpanColumnTypeOptions.SPAN_COLUMNS; pO.spanSplitColumnCount = SpanColumnCountOptions.ALL; }
          else if (params.span === "none") pO.spanColumnType = SpanColumnTypeOptions.SINGLE_COLUMN;
          else if (typeof params.span === "number") { pO.spanColumnType = SpanColumnTypeOptions.SPAN_COLUMNS; pO.spanSplitColumnCount = params.span; }
          else __mcpFail("INVALID_PARAMS", "span must be 'all', 'none' or a number of columns.");
        }
        if (params.tabs instanceof Array) {
          while (pO.tabStops.length) pO.tabStops[0].remove();
          for (var tb = 0; tb < params.tabs.length; tb++) {
            var tO = params.tabs[tb];
            if (typeof tO.position !== "number") __mcpFail("INVALID_PARAMS", "Each tab needs position (in the units of this call).");
            var stopO = pO.tabStops.add({ alignment: alignO[tO.align || "left"] || TabStopAlignment.LEFT_ALIGN, position: tO.position });
            if (tO.leader) stopO.leader = String(tO.leader);
          }
        }
        if (typeof params.keepWithNext === "number") pO.keepWithNext = params.keepWithNext;
        if (typeof params.hyphenation === "boolean") pO.hyphenation = params.hyphenation;
        changedO++;
      }
    }
    return { paragraphsChanged: changedO };
  }

  if (action === "id.anchor") {
    var docA = __idRequireDoc();
    var objA = __idFindById(docA, params.objectId);
    var frameA = __idFindById(docA, params.textFrameId);
    if (!objA) __mcpFail("INVALID_PARAMS", "objectId " + params.objectId + " was not found.");
    if (!frameA || __idTypeName(frameA) !== "TextFrame") __mcpFail("INVALID_PARAMS", "textFrameId must be a text frame.");
    var storyA = frameA.parentStory;
    var ipA;
    if (typeof params.paragraphIndex === "number") {
      if (params.paragraphIndex < 0 || params.paragraphIndex >= storyA.paragraphs.length) __mcpFail("INVALID_PARAMS", "paragraphIndex does not exist (the story has " + storyA.paragraphs.length + " paragraphs).");
      ipA = storyA.paragraphs[params.paragraphIndex].insertionPoints[0];
    } else {
      ipA = storyA.insertionPoints[typeof params.characterIndex === "number" ? params.characterIndex : 0];
    }
    var posA = { inline: AnchorPosition.INLINE_POSITION, aboveLine: AnchorPosition.ABOVE_LINE, custom: AnchorPosition.ANCHORED };
    var whereA = posA[params.position || "inline"];
    if (whereA === undefined) __mcpFail("INVALID_PARAMS", "position must be inline, aboveLine or custom.");
    objA.anchoredObjectSettings.insertAnchoredObject(ipA, whereA);
    return { anchored: true, objectId: objA.id, textFrameId: frameA.id, position: params.position || "inline" };
  }

  if (action === "id.text.edit") {
    var docE = __idRequireDoc();
    var framesE = __idTargets(docE, params);
    var outE = [];
    for (var e = 0; e < framesE.length; e++) {
      var fr = framesE[e];
      if (__idTypeName(fr) !== "TextFrame") throw new Error("Object " + fr.id + " is a " + __idTypeName(fr) + ", not a TextFrame.");
      var story = fr.parentStory;
      if (typeof params.contents === "string") story.contents = __idUnescapeText(params.contents);
      if (typeof params.append === "string") story.insertionPoints[-1].contents = __idUnescapeText(params.append);
      var warnE = [];
      if (typeof params.paragraphIndex === "number") {
        __idFormatText(docE, story.paragraphs[params.paragraphIndex], params.format, warnE);
      } else {
        __idFormatText(docE, story.texts[0], params.format, warnE);
      }
      __idApplyFrameOptions(fr, params.frame);
      if (typeof params.threadTo === "number") {
        var next = __idFindById(docE, params.threadTo);
        if (!next) throw new Error("threadTo frame " + params.threadTo + " not found.");
        fr.nextTextFrame = next;
      }
      var dE = __idDescribeItem(fr);
      dE.paragraphs = story.paragraphs.length;
      dE.warnings = warnE;
      outE.push(dE);
    }
    return { count: outE.length, items: outE };
  }

  if (action === "id.text.findChange") {
    var docX = __idRequireDoc();
    var grep = params.mode === "grep";
    app.findTextPreferences = NothingEnum.NOTHING;
    app.changeTextPreferences = NothingEnum.NOTHING;
    app.findGrepPreferences = NothingEnum.NOTHING;
    app.changeGrepPreferences = NothingEnum.NOTHING;
    var findP = grep ? app.findGrepPreferences : app.findTextPreferences;
    var changeP = grep ? app.changeGrepPreferences : app.changeTextPreferences;
    var opts = grep ? app.findChangeGrepOptions : app.findChangeTextOptions;
    findP.findWhat = String(params.find);
    if (!grep) {
      opts.caseSensitive = params.caseSensitive === true;
      opts.wholeWord = params.wholeWord === true;
    }
    opts.includeMasterPages = params.includeParentPages === true;
    opts.includeLockedStoriesForFind = false;
    var hasChange = typeof params.replace === "string" || params.applyParagraphStyle || params.applyCharacterStyle || params.color;
    var results;
    // Samples are read before the change: after changeGrep a look-ahead match can come back empty.
    var preview = grep ? docX.findGrep() : docX.findText();
    var samples = [];
    for (var r = 0; r < preview.length && r < 20; r++) samples.push(String(preview[r].contents));
    if (hasChange) {
      if (typeof params.replace === "string") changeP.changeTo = params.replace;
      if (params.applyParagraphStyle) changeP.appliedParagraphStyle = docX.paragraphStyles.itemByName(params.applyParagraphStyle);
      if (params.applyCharacterStyle) changeP.appliedCharacterStyle = docX.characterStyles.itemByName(params.applyCharacterStyle);
      if (params.color) changeP.fillColor = __idColor(docX, params.color);
      results = grep ? docX.changeGrep() : docX.changeText();
    } else {
      results = grep ? docX.findGrep() : docX.findText();
    }
    app.findTextPreferences = NothingEnum.NOTHING;
    app.changeTextPreferences = NothingEnum.NOTHING;
    app.findGrepPreferences = NothingEnum.NOTHING;
    app.changeGrepPreferences = NothingEnum.NOTHING;
    return { mode: grep ? "grep" : "text", changed: Boolean(hasChange), count: results.length, samples: samples };
  }

  if (action === "id.shape.create") {
    var docS = __idRequireDoc();
    var pageS = __idPage(docS, params.page);
    var kind = params.shape || "rectangle";
    var shape;
    if (kind === "rectangle") shape = pageS.rectangles.add({ geometricBounds: __idBounds(params.rect) });
    else if (kind === "ellipse") shape = pageS.ovals.add({ geometricBounds: __idBounds(params.rect) });
    else if (kind === "polygon") {
      shape = pageS.polygons.add({ geometricBounds: __idBounds(params.rect) });
      if (typeof params.sides === "number") shape.convertShape(ConvertShapeOptions.CONVERT_TO_POLYGON, params.sides, params.starInset || 0);
    } else if (kind === "line") {
      shape = pageS.graphicLines.add();
      shape.paths[0].pathPoints[0].anchor = [params.from.x, params.from.y];
      shape.paths[0].pathPoints[1].anchor = [params.to.x, params.to.y];
    } else throw new Error("Unknown shape '" + kind + "'.");
    if (kind !== "line" && !params.strokeColor && typeof params.strokeWeight !== "number") {
      shape.strokeWeight = 0;
    }
    __idApplyItemStyle(docS, shape, params);
    return __idDescribeItem(shape);
  }

  if (action === "id.place") {
    var docPl = __idRequireDoc();
    var file = new File(params.filePath);
    if (!file.exists) throw new Error("File not found: " + params.filePath);
    var container;
    if (typeof params.intoId === "number") {
      container = __idFindById(docPl, params.intoId);
      if (!container) throw new Error("Frame " + params.intoId + " not found.");
    } else {
      var pagePl = __idPage(docPl, params.page);
      var isText = /\.(docx?|rtf|txt)$/i.test(file.name);
      container = isText ? pagePl.textFrames.add({ geometricBounds: __idBounds(params.rect) }) : pagePl.rectangles.add({ geometricBounds: __idBounds(params.rect) });
      if (!isText) container.strokeWeight = 0;
    }
    container.place(file, false);
    if (params.fit && __idTypeName(container) !== "TextFrame") {
      var fm = { proportionally: "PROPORTIONALLY", fill: "FILL_PROPORTIONALLY", contentToFrame: "CONTENT_TO_FRAME", frameToContent: "FRAME_TO_CONTENT", center: "CENTER_CONTENT", contentAware: "CONTENT_AWARE_FIT" };
      container.fit(FitOptions[fm[params.fit]]);
      if (params.fit === "fill" || params.fit === "proportionally") container.fit(FitOptions.CENTER_CONTENT);
    }
    __idApplyItemStyle(docPl, container, { name: params.name, layer: params.layer, objectStyle: params.objectStyle });
    var dPl = __idDescribeItem(container);
    try {
      var g = container.allGraphics[0];
      if (g) {
        dPl.effectivePpi = g.effectivePpi;
        dPl.actualPpi = g.actualPpi;
      }
    } catch (_eG) {}
    return dPl;
  }

  if (action === "id.style.manage") {
    var docSt = __idRequireDoc();
    var kindSt = params.kind || "paragraph";
    var coll = __idStyleCollection(docSt, kindSt);
    var opSt = params.operation || "list";
    if (opSt === "list") {
      var all = kindSt === "paragraph" ? docSt.allParagraphStyles : (kindSt === "character" ? docSt.allCharacterStyles : (kindSt === "object" ? docSt.allObjectStyles : coll));
      var names = [];
      for (var sn = 0; sn < all.length; sn++) names.push(String(all[sn].name));
      return { kind: kindSt, count: names.length, styles: names };
    }
    var props = __idStyleProps(docSt, kindSt, params.properties);
    if (opSt === "create" || opSt === "update") {
      var style = coll.itemByName(params.name);
      if (!style.isValid) {
        if (opSt === "update") throw new Error(kindSt + " style '" + params.name + "' not found.");
        style = coll.add({ name: params.name });
      }
      if (params.basedOn) style.basedOn = coll.itemByName(params.basedOn);
      var warnSt = __idSetProps(style, props);
      return { kind: kindSt, name: String(style.name), created: opSt === "create", applied: props ? __idKeys(props) : [], warnings: warnSt };
    }
    if (opSt === "apply") {
      var st = coll.itemByName(params.name);
      if (!st.isValid) throw new Error(kindSt + " style '" + params.name + "' not found.");
      var targetsSt = __idTargets(docSt, params);
      var tablesTouched = 0;
      for (var ts = 0; ts < targetsSt.length; ts++) {
        var t = targetsSt[ts];
        if (kindSt === "object") t.appliedObjectStyle = st;
        else if (kindSt === "paragraph") t.parentStory.paragraphs.everyItem().appliedParagraphStyle = st;
        else if (kindSt === "character") t.parentStory.texts[0].appliedCharacterStyle = st;
        else {
          var tbls = null;
          try {
            tbls = t.parentStory.tables;
          } catch (_eTb) {
            tbls = null;
          }
          if (!tbls || tbls.length === 0) throw new Error("Target " + t.id + " has no table in its story.");
          for (var tt = 0; tt < tbls.length; tt++) {
            if (kindSt === "table") {
              tbls[tt].appliedTableStyle = st;
              if (params.clearOverrides !== false) {
                try {
                  tbls[tt].clearTableStyleOverrides();
                } catch (_eCo) {}
                try {
                  tbls[tt].cells.everyItem().clearCellStyleOverrides(true);
                } catch (_eCc) {}
              }
            } else {
              var cellsT = params.rows instanceof Array && params.rows.length ? null : tbls[tt].cells.everyItem();
              if (cellsT) cellsT.appliedCellStyle = st;
              else for (var rw = 0; rw < params.rows.length; rw++) tbls[tt].rows[params.rows[rw]].cells.everyItem().appliedCellStyle = st;
            }
            tablesTouched++;
          }
        }
      }
      return { kind: kindSt, name: params.name, applied: targetsSt.length, tables: tablesTouched };
    }
    throw new Error("Unknown style operation '" + opSt + "'.");
  }

  if (action === "id.swatch.manage") {
    var docW = __idRequireDoc();
    if (params.operation === "add") {
      var col = __idColor(docW, params.color);
      if (params.name && col.name !== params.name) col.name = String(params.name);
      return { added: true, name: String(col.name) };
    }
    var list = [];
    for (var sw = 0; sw < docW.swatches.length; sw++) {
      var swatch = docW.swatches[sw];
      var entry = { name: String(swatch.name) };
      try {
        entry.space = String(swatch.space);
        entry.value = swatch.colorValue;
      } catch (_eC) {}
      list.push(entry);
    }
    return { count: list.length, swatches: list };
  }

  if (action === "id.table.create") {
    var docTb = __idRequireDoc();
    var pageTb = __idPage(docTb, params.page);
    var data = params.data || [];
    var rows = data.length || params.rows || 2;
    var cols = (data.length && data[0].length) || params.columns || 2;
    var tf = pageTb.textFrames.add({ geometricBounds: __idBounds(params.rect) });
    var table = tf.insertionPoints[0].tables.add({ bodyRowCount: rows - (params.headerRows || 0), headerRowCount: params.headerRows || 0, columnCount: cols });
    if (data.length) {
      var flat = [];
      for (var rr = 0; rr < data.length; rr++) for (var cc = 0; cc < cols; cc++) flat.push(String(data[rr][cc] === undefined ? "" : data[rr][cc]));
      table.contents = flat;
    }
    table.width = params.rect.width;
    if (params.tableStyle) {
      var tsty = docTb.tableStyles.itemByName(params.tableStyle);
      if (!tsty.isValid) throw new Error("Table style '" + params.tableStyle + "' not found.");
      table.appliedTableStyle = tsty;
    }
    if (params.headerFill && (params.headerRows || 0) > 0) {
      table.rows[0].fillColor = __idColor(docTb, params.headerFill);
    }
    if (params.name) tf.name = String(params.name);
    var dTb = __idDescribeItem(tf);
    dTb.rows = table.rows.length;
    dTb.columns = table.columns.length;
    return dTb;
  }

  if (action === "id.section.manage") {
    var docSc = __idRequireDoc();
    var opSc = params.operation || "list";
    if (opSc === "list") {
      var secs = [];
      for (var si = 0; si < docSc.sections.length; si++) secs.push(__idDescribeSection(docSc.sections[si]));
      return { count: secs.length, sections: secs };
    }
    var pgSc = __idPage(docSc, params.page);
    var existing = null;
    for (var se = 0; se < docSc.sections.length; se++) {
      try {
        if (docSc.sections[se].pageStart.id === pgSc.id) existing = docSc.sections[se];
      } catch (_eSe) {}
    }
    if (opSc === "remove") {
      if (!existing) throw new Error("No section starts on page " + String(pgSc.name) + ".");
      if (existing.pageStart.documentOffset === 0) throw new Error("The first section cannot be removed; use operation 'set' to change its numbering.");
      existing.remove();
      return { removed: true, page: String(pgSc.name) };
    }
    if (opSc === "set") {
      var sec = existing || docSc.sections.add(pgSc);
      var propsSc = {};
      if (typeof params.startNumber === "number") {
        propsSc.continueNumbering = false;
        propsSc.pageNumberStart = params.startNumber;
      } else if (params.continueNumbering === true) {
        propsSc.continueNumbering = true;
      }
      if (params.numbering) propsSc.pageNumberStyle = __idPageNumberStyle(params.numbering);
      if (typeof params.prefix === "string") propsSc.sectionPrefix = params.prefix;
      if (typeof params.includePrefix === "boolean") propsSc.includeSectionPrefix = params.includePrefix;
      if (typeof params.marker === "string") propsSc.marker = params.marker;
      var warnSc = __idSetProps(sec, propsSc);
      var dSc = __idDescribeSection(sec);
      dSc.created = !existing;
      dSc.warnings = warnSc;
      dSc.firstPageName = String(pgSc.name);
      return dSc;
    }
    throw new Error("Unknown section operation '" + opSc + "'.");
  }

  if (action === "id.text.thread") {
    var docTh = __idRequireDoc();
    var opTh = params.operation || "thread";
    var framesTh = __idTargets(docTh, params);
    var tfs = [];
    for (var fi = 0; fi < framesTh.length; fi++) {
      if (framesTh[fi].constructor.name === "TextFrame") tfs.push(framesTh[fi]);
    }
    if (tfs.length === 0) throw new Error("No text frames among the targets (pass ids or names of text frames).");
    var warnTh = [];
    if (opTh === "thread") {
      if (tfs.length < 2 && !params.addPagesUntilFits) throw new Error("Pass at least two text frames, in reading order.");
      for (var ti = 0; ti < tfs.length - 1; ti++) {
        if (tfs[ti + 1].previousTextFrame && tfs[ti + 1].previousTextFrame.isValid && tfs[ti + 1].previousTextFrame.id !== tfs[ti].id) {
          warnTh.push("Frame " + tfs[ti + 1].id + " was already threaded to another frame; it was re-threaded.");
        }
        if (String(tfs[ti + 1].contents) !== "" && !(tfs[ti + 1].previousTextFrame && tfs[ti + 1].previousTextFrame.isValid)) {
          warnTh.push("Frame " + tfs[ti + 1].id + " had its own text; it was appended to the story.");
        }
        tfs[ti].nextTextFrame = tfs[ti + 1];
      }
    } else if (opTh === "unthread") {
      for (var ui = 0; ui < tfs.length; ui++) {
        try {
          tfs[ui].nextTextFrame = NothingEnum.NOTHING;
        } catch (eUn) {
          warnTh.push("Frame " + tfs[ui].id + ": " + eUn.message);
        }
      }
    } else if (opTh !== "status") {
      throw new Error("Unknown thread operation '" + opTh + "'.");
    }
    var addedPages = [];
    if (opTh === "thread" && params.addPagesUntilFits) {
      var maxNew = params.maxNewPages || 40;
      var lastF = tfs[tfs.length - 1];
      while (lastF.parentStory.overflows && addedPages.length < maxNew) {
        var lastF2 = __idChain(lastF);
        lastF = docTh.pageItems.itemByID(lastF2[lastF2.length - 1].id).getElements()[0];
        var srcPage = lastF.parentPage;
        if (!srcPage) throw new Error("The last frame of the thread is on the pasteboard; move it onto a page first.");
        var newPage = docTh.pages.add(LocationOptions.AFTER, srcPage);
        try {
          newPage.appliedMaster = srcPage.appliedMaster;
        } catch (_eM) {}
        var gb = lastF.geometricBounds;
        var widthPg = docTh.documentPreferences.pageWidth;
        if (newPage.side !== srcPage.side && (newPage.side === PageSideOptions.LEFT_HAND || srcPage.side === PageSideOptions.LEFT_HAND)) {
          gb = [gb[0], widthPg - gb[3], gb[2], widthPg - gb[1]];
        }
        var nf = newPage.textFrames.add({ geometricBounds: gb });
        try {
          nf.textFramePreferences.textColumnCount = lastF.textFramePreferences.textColumnCount;
          nf.textFramePreferences.textColumnGutter = lastF.textFramePreferences.textColumnGutter;
        } catch (_eCol) {}
        try {
          if (lastF.appliedObjectStyle) nf.appliedObjectStyle = lastF.appliedObjectStyle;
        } catch (_eOs) {}
        lastF.nextTextFrame = nf;
        addedPages.push(String(newPage.name));
        lastF = nf;
      }
      if (lastF.parentStory.overflows) warnTh.push("Still overset after adding " + addedPages.length + " page(s) (maxNewPages).");
    }
    var story = tfs[0].parentStory;
    var oversetChars = 0;
    try {
      if (story.overflows) {
        var lastCh = __idChain(tfs[0]);
        var lf = docTh.pageItems.itemByID(lastCh[lastCh.length - 1].id).getElements()[0];
        oversetChars = story.characters.length - (lf.characters.length ? lf.characters.lastItem().index + 1 : 0);
      }
    } catch (_eOv) {}
    return {
      operation: opTh,
      chain: __idChain(tfs[0]),
      overset: !!story.overflows,
      oversetCharacters: oversetChars,
      storyCharacters: story.characters.length,
      addedPages: addedPages,
      warnings: warnTh
    };
  }

  if (action === "id.toc.create") {
    var docToc = __idRequireDoc();
    var entries = params.entries || [];
    if (!entries.length) throw new Error("entries: list the paragraph styles to collect, e.g. [{paragraphStyle:'T\u00EDtulo 1', level:1}].");
    var tocName = params.tocStyleName || "MCP Sum\u00E1rio";
    var tocSt = docToc.tocStyles.itemByName(tocName);
    if (!tocSt.isValid) tocSt = docToc.tocStyles.add({ name: tocName });
    tocSt.title = typeof params.title === "string" ? __idUnescapeText(params.title) : "";
    var warnToc = [];
    if (params.titleStyle) {
      var tst = docToc.paragraphStyles.itemByName(params.titleStyle);
      if (tst.isValid) tocSt.titleStyle = tst;
      else warnToc.push("Title style '" + params.titleStyle + "' not found.");
    }
    try {
      tocSt.tocStyleEntries.everyItem().remove();
    } catch (_eRm) {}
    var missing = [];
    for (var en = 0; en < entries.length; en++) {
      var e = entries[en];
      if (!docToc.paragraphStyles.itemByName(e.paragraphStyle).isValid) {
        missing.push(e.paragraphStyle);
        continue;
      }
      var ent = tocSt.tocStyleEntries.add({ name: e.paragraphStyle });
      try {
        ent.level = e.level || 1;
      } catch (_eLv) {}
      if (e.entryStyle) {
        var es = docToc.paragraphStyles.itemByName(e.entryStyle);
        if (es.isValid) ent.formatStyle = es;
        else warnToc.push("Entry style '" + e.entryStyle + "' not found; '" + e.paragraphStyle + "' keeps the default.");
      }
      try {
        ent.pageNumberPosition = e.pageNumber === "none" ? PageNumberPosition.NONE : (e.pageNumber === "before" ? PageNumberPosition.BEFORE_ENTRY : PageNumberPosition.AFTER_ENTRY);
        ent.separator = typeof e.separator === "string" ? __idUnescapeText(e.separator) : "^t";
      } catch (_ePn) {}
    }
    if (missing.length === entries.length) throw new Error("None of the paragraph styles exist: " + missing.join(", ") + ".");
    if (missing.length) warnToc.push("Styles not found (skipped): " + missing.join(", ") + ".");
    var pgToc = __idPage(docToc, params.page);
    try {
      app.activeWindow.activePage = pgToc;
    } catch (_eAw) {}
    var place = params.rect ? [params.rect.x, params.rect.y] : [pgToc.marginPreferences.left, pgToc.marginPreferences.top];
    var res = docToc.createTOC(tocSt, params.replace !== false, undefined, place, params.includeOverset === true);
    var tocStory = res && typeof res.length === "number" && !res.textContainers && res.constructor !== String ? res[0] : res;
    var frameToc = null;
    try {
      frameToc = tocStory.textContainers ? tocStory.textContainers[0] : tocStory;
    } catch (_eFc) {
      frameToc = null;
    }
    if (frameToc && frameToc.isValid) {
      try {
        if (!frameToc.parentPage || frameToc.parentPage.id !== pgToc.id) frameToc.move(pgToc);
      } catch (eMv) {
        warnToc.push("Could not move the TOC frame to page " + String(pgToc.name) + ": " + eMv.message);
      }
      if (params.rect) frameToc.geometricBounds = __idBounds(params.rect);
      if (params.name) frameToc.name = String(params.name);
    }
    var outToc = frameToc && frameToc.isValid ? __idDescribeItem(frameToc) : {};
    outToc.tocStyle = tocName;
    outToc.paragraphs = 0;
    try {
      outToc.paragraphs = frameToc.parentStory.paragraphs.length;
      outToc.overset = !!frameToc.parentStory.overflows;
      if (outToc.overset) warnToc.push("The table of contents does not fit the frame: enlarge it or thread it (id_thread_text).");
    } catch (_ePc) {}
    outToc.warnings = warnToc;
    outToc.note = "Re-run after editing headings (replace: true updates the existing table of contents).";
    return outToc;
  }

  if (action === "id.package") {
    var docPk = __idRequireDoc();
    var hasPath = true;
    try {
      docPk.fullName.fsName;
    } catch (_eNp) {
      hasPath = false;
    }
    if (!hasPath) throw new Error("Save the document first (id_manage_document save with filePath); packaging needs a saved file.");
    if (docPk.modified && params.saveFirst === false) throw new Error("The document has unsaved changes; pass saveFirst: true or save it first.");
    var folderPk = new Folder(params.folder);
    if (!folderPk.exists) folderPk.create();
    var ok = docPk.packageForPrint(
      folderPk,
      params.copyFonts !== false,
      params.copyLinks !== false,
      params.copyProfiles === true,
      params.updateGraphics !== false,
      params.includeHiddenLayers === true,
      true,
      params.createReport !== false,
      params.includeIdml === true,
      params.includePdf === true,
      params.pdfPreset || "[High Quality Print]",
      false,
      params.comments || "",
      params.saveFirst !== false
    );
    var listing = [];
    var walk = function (fd, rel, depth) {
      var items = fd.getFiles();
      for (var w = 0; w < items.length && listing.length < 300; w++) {
        var it = items[w];
        var nm = rel + decodeURI(it.name);
        if (it instanceof Folder) {
          listing.push(nm + "/");
          if (depth < 3) walk(it, nm + "/", depth + 1);
        } else listing.push(nm);
      }
    };
    walk(folderPk, "", 0);
    var fonts = 0;
    var links = 0;
    for (var li = 0; li < listing.length; li++) {
      if (/^Document fonts\/.+[^\/]$/i.test(listing[li])) fonts++;
      if (/^Links\/.+[^\/]$/i.test(listing[li])) links++;
    }
    return {
      packaged: !!ok,
      folder: folderPk.fsName,
      files: listing,
      fontFiles: fonts,
      linkFiles: links,
      note: "Adobe Fonts (activated from Creative Cloud) are not copied; the print shop activates them or needs outlined/PDF output."
    };
  }


  if (action === "id.audit") {
    var docAu = __idRequireDoc();
    var intent = "print";
    try {
      intent = docAu.documentPreferences.intent === DocumentIntentOptions.WEB_INTENT ? "web" : (docAu.documentPreferences.intent === DocumentIntentOptions.MOBILE_INTENT ? "mobile" : "print");
    } catch (_eI) {}
    var pw = docAu.documentPreferences.pageWidth, ph = docAu.documentPreferences.pageHeight;
    var bleed = 0;
    try {
      bleed = docAu.documentPreferences.documentBleedTopOffset;
    } catch (_eBl) {}
    var noStyle = docAu.paragraphStyles.item(0), basic = docAu.paragraphStyles.item(1);
    // pointSize comes back in the call's measurement unit (mm by default): convert to points.
    var toPt = { mm: 72 / 25.4, cm: 720 / 25.4, pt: 1, px: 1, "in": 72, pica: 12 }[params.units || "mm"] || 1;
    var stories = [];
    var maxStories = params.maxStories || 300;
    for (var si = 0; si < docAu.stories.length && si < maxStories; si++) {
      var st = docAu.stories[si];
      var frame = null;
      try {
        frame = st.textContainers.length ? st.textContainers[0] : null;
      } catch (_eTc) {}
      var pageName = null;
      try {
        pageName = frame && frame.parentPage ? String(frame.parentPage.name) : null;
      } catch (_ePp) {}
      var paras = st.paragraphs.length;
      var unstyled = 0;
      for (var pi = 0; pi < paras && pi < 400; pi++) {
        var aps = st.paragraphs[pi].appliedParagraphStyle;
        if (aps && (aps.id === basic.id || aps.id === noStyle.id)) unstyled++;
      }
      var minPt = null;
      try {
        var rngs = st.textStyleRanges;
        for (var ri = 0; ri < rngs.length && ri < 400; ri++) {
          var ps = rngs[ri].pointSize;
          if (typeof ps === "number") ps = Math.round(ps * toPt * 10) / 10;
          if (typeof ps === "number" && (minPt === null || ps < minPt) && String(rngs[ri].contents).replace(/\s/g, "") !== "") minPt = ps;
        }
      } catch (_eR) {}
      stories.push({
        frameId: frame ? frame.id : null,
        frameName: frame ? String(frame.name || "") : "",
        page: pageName,
        excerpt: String(st.contents).substring(0, 40),
        overset: !!st.overflows,
        paragraphs: paras,
        unstyledParagraphs: unstyled,
        minPointSize: minPt,
        empty: String(st.contents) === ""
      });
    }
    var nearEdge = [];
    var safe = typeof params.safeMarginMm === "number" ? params.safeMarginMm : 3;
    for (var pg = 0; pg < docAu.pages.length; pg++) {
      var page = docAu.pages[pg];
      var tfs = page.textFrames;
      for (var tf = 0; tf < tfs.length; tf++) {
        var gb = tfs[tf].geometricBounds;
        if (String(tfs[tf].contents) === "") continue;
        var d = Math.min(gb[0], gb[1], ph - gb[2], pw - gb[3]);
        if (d < safe) nearEdge.push({ id: tfs[tf].id, page: String(page.name), excerpt: String(tfs[tf].contents).substring(0, 30), distanceMm: Math.round(d * 10) / 10 });
      }
    }
    var graphics = [];
    var ag = docAu.allGraphics;
    for (var gi = 0; gi < ag.length && gi < 500; gi++) {
      var g = ag[gi];
      var rec = { id: g.id, name: "", page: null, effectivePpi: null, space: "", status: "" };
      try {
        rec.name = g.itemLink ? String(g.itemLink.name) : "";
        rec.status = g.itemLink ? String(g.itemLink.status) : "embedded";
      } catch (_eL) {}
      try {
        rec.page = g.parentPage ? String(g.parentPage.name) : null;
      } catch (_ePg) {}
      try {
        rec.effectivePpi = g.effectivePpi;
      } catch (_ePpi) {}
      try {
        rec.space = String(g.space);
      } catch (_eSp) {}
      rec.type = String(g.constructor.name);
      graphics.push(rec);
    }
    var colors = [];
    for (var ci = 0; ci < docAu.colors.length; ci++) {
      var c = docAu.colors[ci];
      try {
        if (!c.name || c.name === "Registration" || c.name === "Paper" || c.name === "Black" || c.name === "None") continue;
        colors.push({ name: String(c.name), model: String(c.model), space: String(c.space) });
      } catch (_eC) {}
    }
    var fonts = [];
    for (var fi = 0; fi < docAu.fonts.length; fi++) {
      try {
        fonts.push({ name: String(docAu.fonts[fi].name), status: String(docAu.fonts[fi].status) });
      } catch (_eF) {}
    }
    return { document: docAu.name, intent: intent, pageWidthMm: pw, pageHeightMm: ph, bleedMm: bleed, pages: docAu.pages.length, stories: stories, storiesTotal: docAu.stories.length, textNearEdge: nearEdge, graphics: graphics, colors: colors, fonts: fonts };
  }

  if (action === "id.layer.manage") {
    var docL = __idRequireDoc();
    var opL = params.operation || "list";
    if (opL === "list") {
      var layersL = [];
      for (var li = 0; li < docL.layers.length; li++) layersL.push({ name: String(docL.layers[li].name), visible: docL.layers[li].visible, locked: docL.layers[li].locked, items: docL.layers[li].allPageItems.length });
      return { layers: layersL };
    }
    if (opL === "add") {
      var nl = docL.layers.add({ name: params.name });
      return { added: String(nl.name) };
    }
    var lyr = docL.layers.itemByName(params.name);
    if (!lyr.isValid) throw new Error("Layer '" + params.name + "' not found.");
    if (opL === "update") {
      if (params.newName) lyr.name = params.newName;
      if (typeof params.visible === "boolean") lyr.visible = params.visible;
      if (typeof params.locked === "boolean") lyr.locked = params.locked;
      return { updated: String(lyr.name) };
    }
    if (opL === "remove") {
      lyr.remove();
      return { removed: params.name };
    }
    throw new Error("Unknown layer operation '" + opL + "'.");
  }

  if (action === "id.preflight") {
    var docPf = __idRequireDoc();
    var issues = [];
    var stories = docPf.stories;
    for (var so = 0; so < stories.length; so++) {
      if (stories[so].overflows) {
        var tfs = stories[so].textContainers;
        issues.push({ type: "overset", severity: "error", frameId: tfs.length ? tfs[tfs.length - 1].id : null, text: String(stories[so].contents).substring(0, 60) });
      }
    }
    var minPpi = params.minPpi || 250;
    for (var lk = 0; lk < docPf.links.length; lk++) {
      var link = docPf.links[lk];
      if (link.status === LinkStatus.LINK_MISSING) issues.push({ type: "missingLink", severity: "error", file: String(link.filePath) });
      else if (link.status === LinkStatus.LINK_OUT_OF_DATE) issues.push({ type: "modifiedLink", severity: "warning", file: String(link.filePath) });
      try {
        var ppi = link.parent.effectivePpi;
        if (ppi && ppi[0] < minPpi) issues.push({ type: "lowResolution", severity: "warning", file: String(link.name), effectivePpi: ppi[0], frameId: link.parent.parent.id });
      } catch (_ePpi) {}
    }
    for (var fo = 0; fo < docPf.fonts.length; fo++) {
      var font = docPf.fonts[fo];
      if (font.status !== FontStatus.INSTALLED) issues.push({ type: "font", severity: "error", font: String(font.name), status: String(font.status) });
    }
    var all2 = docPf.allPageItems;
    for (var ef = 0; ef < all2.length; ef++) {
      var pi = all2[ef];
      if (__idTypeName(pi) === "TextFrame" && String(pi.contents) === "" && pi.nextTextFrame === null && pi.previousTextFrame === null) {
        issues.push({ type: "emptyTextFrame", severity: "info", frameId: pi.id });
      }
    }
    var profileResult = null;
    if (params.profile) {
      try {
        var profile = app.preflightProfiles.itemByName(params.profile);
        var proc = app.preflightProcesses.add(docPf, profile);
        proc.waitForProcess(30);
        profileResult = proc.processResults;
        proc.remove();
      } catch (eProf) {
        profileResult = "Profile run failed: " + eProf.message;
      }
    }
    var errors = 0;
    for (var ic = 0; ic < issues.length; ic++) if (issues[ic].severity === "error") errors++;
    return { ok: errors === 0, errors: errors, total: issues.length, issues: issues, profileResult: profileResult };
  }

  if (action === "id.links") {
    var docLk = __idRequireDoc();
    var opLk = params.operation || "list";
    var outLk = [];
    for (var k = 0; k < docLk.links.length; k++) {
      var lnk = docLk.links[k];
      if (params.name && lnk.name !== params.name) continue;
      if (opLk === "update" && lnk.status === LinkStatus.LINK_OUT_OF_DATE) lnk.update();
      if (opLk === "relink") lnk.relink(new File(params.newPath));
      outLk.push({ name: String(lnk.name), path: String(lnk.filePath), status: String(lnk.status) });
    }
    return { count: outLk.length, links: outLk };
  }

  if (action === "id.export") {
    var docX2 = __idRequireDoc();
    var fmt = params.format || "pdf";
    var outFile = __mcpPrepareOutputFile(params.filePath);
    var pdfInfo = null;
    if (fmt === "pdf") {
      var pdfP = app.pdfExportPreferences;
      var preset = params.pdfPreset ? app.pdfExportPresets.itemByName(params.pdfPreset) : null;
      if (preset && !preset.isValid) throw new Error("PDF preset '" + params.pdfPreset + "' not found.");
      if (preset) {
        // Exporting *with* a preset ignores pdfExportPreferences, and the stock presets ([PDF/X-4:2008],
        // [High Quality Print]) have "use document bleed" off: the print PDF came out without bleed.
        // Copy the preset into the preferences, then override bleed and marks.
        var presetProps = preset.properties;
        for (var ppk in presetProps) {
          if (ppk === "name" || ppk === "parent" || ppk === "isValid" || ppk === "index" || ppk === "id" || ppk === "properties") continue;
          try {
            pdfP[ppk] = presetProps[ppk];
          } catch (_ePp) {}
        }
      }
      pdfP.pageRange = params.pageRange ? String(params.pageRange) : PageRange.ALL_PAGES;
      var dpX = docX2.documentPreferences;
      var bleedTop = Number(dpX.documentBleedTopOffset) || 0;
      var hasBleed = bleedTop > 0 || Number(dpX.documentBleedBottomOffset) > 0 || Number(dpX.documentBleedInsideOrLeftOffset) > 0;
      var useBleed = params.bleed === false ? false : params.bleed === true || hasBleed;
      pdfP.useDocumentBleedWithPDF = useBleed;
      var marks = params.cropMarks === true;
      pdfP.cropMarks = marks;
      pdfP.bleedMarks = marks && useBleed;
      if (marks) {
        // Marks start outside the bleed so they never print into it.
        pdfP.pageMarksOffset = Math.max(bleedTop, 3);
      }
      docX2.exportFile(ExportFormat.PDF_TYPE, outFile, false);
      pdfInfo = {
        preset: preset ? String(preset.name) : null,
        bleed: useBleed,
        documentBleed: bleedTop,
        cropMarks: marks,
        standard: (function () {
          try {
            return String(pdfP.standardsCompliance);
          } catch (_eStd) {
            return null;
          }
        })()
      };
    } else if (fmt === "jpg") {
      var jp = app.jpegExportPreferences;
      jp.jpegExportRange = params.pageRange ? ExportRangeOrAllPages.EXPORT_RANGE : ExportRangeOrAllPages.EXPORT_ALL;
      if (params.pageRange) jp.pageString = String(params.pageRange);
      jp.exportResolution = params.resolution || 150;
      jp.jpegQuality = JPEGOptionsQuality.HIGH;
      docX2.exportFile(ExportFormat.JPG, outFile, false);
    } else if (fmt === "png") {
      var pn = app.pngExportPreferences;
      pn.pngExportRange = params.pageRange ? PNGExportRangeEnum.EXPORT_RANGE : PNGExportRangeEnum.EXPORT_ALL;
      if (params.pageRange) pn.pageString = String(params.pageRange);
      pn.exportResolution = params.resolution || 150;
      pn.transparentBackground = params.transparent === true;
      docX2.exportFile(ExportFormat.PNG_FORMAT, outFile, false);
    } else if (fmt === "idml") {
      docX2.exportFile(ExportFormat.INDESIGN_MARKUP, outFile, false);
    } else if (fmt === "epub") {
      docX2.exportFile(ExportFormat.EPUB, outFile, false);
    } else if (fmt === "fixedEpub") {
      docX2.exportFile(ExportFormat.FIXED_LAYOUT_EPUB, outFile, false);
    } else {
      throw new Error("Unknown export format '" + fmt + "'.");
    }
    var xExists = new File(outFile.fsName).exists;
    if (!xExists && (fmt === "pdf" || fmt === "idml" || fmt === "epub" || fmt === "fixedEpub")) {
      __mcpFail("SAVE_FAILED", "InDesign reported no error but " + outFile.fsName + " does not exist.");
    }
    var xOut = { exported: true, format: fmt, filePath: outFile.fsName, exists: xExists };
    if (pdfInfo) xOut.pdf = pdfInfo;
    return xOut;
  }

  if (action === "id.preview") {
    var docV = __idRequireDoc();
    var pageV = __idPage(docV, params.page);
    var outPath = params.outputPath || (Folder.temp.fsName + "/id_preview_" + new Date().getTime() + ".jpg");
    var vf = __mcpPrepareOutputFile(outPath);
    var jpv = app.jpegExportPreferences;
    jpv.jpegExportRange = ExportRangeOrAllPages.EXPORT_RANGE;
    jpv.pageString = String(pageV.name);
    jpv.exportResolution = params.resolution || 72;
    jpv.jpegQuality = JPEGOptionsQuality.MEDIUM;
    docV.exportFile(ExportFormat.JPG, vf, false);
    var written = new File(vf.fsName);
    // macOS (20/11/2026, InDesign 22): a name that does not end in .jpg is written as "<name>.jpg" ("x.png" -> "x.png.jpg").
    if (!written.exists) {
      var writtenJpg = new File(vf.fsName + ".jpg");
      if (writtenJpg.exists) written = writtenJpg;
    }
    return { page: String(pageV.name), outputPath: written.fsName, previewBase64: __idEncodeFileToBase64(written), previewMimeType: "image/jpeg" };
  }

  if (action === "id.recipe.flyer" || action === "id.recipe.catalog" || action === "id.recipe.manual") {
    return __idRecipe(action, params);
  }

  if (action === "id.raw.executeExtendScript") {
    var evalResult = __mcpEvalUserCode(params.code);
    return { executed: true, result: typeof evalResult === "undefined" ? null : evalResult };
  }

  if (action === "adobe.inspectDom") {
    return __mcpInspectDomObject(params.targetExpression || "app.activeDocument", params.maxProperties || 150);
  }

  __mcpUnsupported("Unknown InDesign action: " + action);
}

/**
 * Entry point. Every action runs with the requested measurement unit (default millimetres),
 * the page as ruler origin and no dialogs; all three are restored afterwards.
 */
/* ---------- Recipes (phase 3): flyer and catalogue, built from the brand palette ---------- */

var __idFontIndex = null;

/** Finds an installed font by InDesign name ("Arial\tBold"), PostScript name ("Arial-BoldMT") or full name. */
function __idFindFont(name) {
  if (!name) return null;
  try {
    var direct = app.fonts.itemByName(String(name));
    if (direct.isValid && direct.status === FontStatus.INSTALLED) return direct;
  } catch (_e0) {}
  var norm = function (s) { return String(s || "").toLowerCase().replace(/[\s_\-]/g, ""); };
  if (!__idFontIndex) {
    if (typeof __idTrail === "function") __idTrail("montando indice de fontes (" + name + ")");
    __idFontIndex = { ps: [], full: [] };
    try { __idFontIndex.ps = app.fonts.everyItem().postscriptName; } catch (_e1) {}
    try { __idFontIndex.full = app.fonts.everyItem().fullName; } catch (_e2) {}
  }
  var want = norm(name);
  for (var i = 0; i < __idFontIndex.ps.length; i++) {
    if (norm(__idFontIndex.ps[i]) === want || norm(__idFontIndex.full[i]) === want) {
      var f = app.fonts[i];
      try { if (f.status === FontStatus.INSTALLED) return f; } catch (_e3) { return f; }
    }
  }
  return null;
}

function __idRecipeSwatch(doc, sw) {
  if (!sw) return null;
  var space = sw.values.length === 4 ? ColorSpace.CMYK : ColorSpace.RGB;
  var c = doc.colors.itemByName(sw.name);
  if (!c.isValid) {
    c = doc.colors.add({ name: sw.name, model: ColorModel.PROCESS, space: space, colorValue: sw.values });
  } else {
    c.space = space;
    c.colorValue = sw.values;
  }
  return c;
}

/** Paragraph style with sizes in points (strings with units: the call runs in mm). */
function __idRecipeStyle(doc, name, o, warnings) {
  var st = doc.paragraphStyles.itemByName(name);
  if (!st.isValid) st = doc.paragraphStyles.add({ name: name });
  if (o.font) {
    var f = __idFindFont(o.font);
    if (f) st.appliedFont = f;
    else warnings.push("fonte n\u00E3o instalada: " + o.font + " (estilo " + name + " ficou com a fonte padr\u00E3o)");
  }
  st.pointSize = (Math.round(o.size * 10) / 10) + "pt";
  st.leading = (Math.round(o.size * (o.leading || 1.25) * 10) / 10) + "pt";
  if (o.color) st.fillColor = o.color;
  st.tracking = o.tracking || 0;
  st.capitalization = o.caps ? Capitalization.ALL_CAPS : Capitalization.NORMAL;
  st.hyphenation = o.hyphenate === true;
  st.spaceBefore = (o.before || 0) + "pt";
  st.spaceAfter = (o.after || 0) + "pt";
  st.justification = Justification.LEFT_ALIGN;
  if (o.bullet) {
    st.bulletsAndNumberingListType = ListType.BULLET_LIST;
    st.leftIndent = (o.size * 1.2) + "pt";
    st.firstLineIndent = (-o.size * 1.2) + "pt";
  } else {
    st.bulletsAndNumberingListType = ListType.NO_LIST;
    st.leftIndent = 0;
    st.firstLineIndent = 0;
  }
  return st;
}

function __idRecipeRect(page, name, rect, fill, layer) {
  var r = page.rectangles.add(layer ? { itemLayer: layer } : {});
  r.geometricBounds = __idBounds(rect);
  r.name = name;
  r.strokeWeight = 0;
  r.strokeColor = "None";
  r.fillColor = fill || "None";
  return r;
}

function __idRecipeFrame(page, name, rect) {
  var t = page.textFrames.add();
  t.geometricBounds = __idBounds(rect);
  t.name = name;
  t.strokeWeight = 0;
  t.fillColor = "None";
  t.textFramePreferences.insetSpacing = [0, 0, 0, 0];
  return t;
}

/** Fills a frame with [text, style] paragraphs; skips empty texts. */
function __idRecipeFill(frame, paras) {
  var texts = [];
  var styles = [];
  for (var i = 0; i < paras.length; i++) {
    var t = paras[i][0];
    if (t === null || typeof t === "undefined" || String(t) === "") continue;
    texts.push(__idUnescapeText(t));
    styles.push(paras[i][1]);
  }
  frame.contents = texts.join("\r");
  // the story, not the frame: paragraphs that overset are not in frame.paragraphs
  var sp = frame.parentStory.paragraphs;
  for (var j = 0; j < styles.length && j < sp.length; j++) {
    sp[j].applyParagraphStyle(styles[j], true);
  }
  return texts.length;
}

/** Places an image filling the frame (centred). Returns null or a warning. */
function __idRecipePlace(frame, filePath, fit) {
  if (!filePath) return "sem imagem para " + frame.name;
  var f = new File(filePath);
  if (!f.exists) return "imagem n\u00E3o encontrada: " + filePath;
  frame.place(f);
  try { frame.fit(fit || FitOptions.FILL_PROPORTIONALLY); } catch (_e1) {}
  try { frame.fit(FitOptions.CENTER_CONTENT); } catch (_e2) {}
  return null;
}

/** Shrinks the given styles together (6 % a step) until the frame no longer oversets. */
function __idRecipeShrink(frames, styles, maxSteps) {
  var steps = 0;
  var over = function () {
    for (var i = 0; i < frames.length; i++) if (frames[i].overflows) return true;
    return false;
  };
  while (over() && steps < (maxSteps || 8)) {
    for (var s = 0; s < styles.length; s++) {
      // pointSize reads back in the call's unit (mm): convert to points first
      var ptVal = styles[s].pointSize;
      var inPt = typeof ptVal === "number" ? ptVal * 72 / 25.4 : Number(String(ptVal).replace(/[^0-9.]/g, ""));
      var lead = styles[s].leading;
      var ratio = (typeof lead === "number" && typeof ptVal === "number" && ptVal > 0) ? lead / ptVal : 1.25;
      var next = Math.round(inPt * 0.94 * 10) / 10;
      if (next < 6.5) continue; // never below a printable size: report overset instead
      styles[s].pointSize = next + "pt";
      styles[s].leading = (Math.round(next * ratio * 10) / 10) + "pt";
    }
    steps++;
  }
  return { steps: steps, shrinkPercent: Math.round((1 - Math.pow(0.94, steps)) * 100), stillOverset: over() };
}

function __idRecipeNewDoc(params) {
  var W = params.width || 210;
  var H = params.height || 297;
  var doc = app.documents.add({ showingWindow: true });
  var dp = doc.documentPreferences;
  dp.facingPages = false;
  dp.pageWidth = W;
  dp.pageHeight = H;
  dp.pagesPerDocument = params.pages || 1;
  var b = typeof params.bleed === "number" ? params.bleed : 3;
  dp.documentBleedUniformSize = true;
  dp.documentBleedTopOffset = b;
  if (params.intent === "web") dp.intent = DocumentIntentOptions.WEB_INTENT;
  var m = typeof params.margin === "number" ? params.margin : 12;
  var mp = doc.masterSpreads[0].pages;
  for (var i = 0; i < mp.length; i++) {
    mp[i].marginPreferences.properties = { top: m, bottom: m, left: m, right: m };
  }
  doc.viewPreferences.rulerOrigin = RulerOrigin.PAGE_ORIGIN;
  doc.zeroPoint = [0, 0];
  return { doc: doc, W: W, H: H, b: b, m: m };
}

/** Progress trail for long recipes: one line per step in params.logPath, read back by the server on a timeout. */
var __idTrailFile = null;
function __idTrail(step) {
  if (!__idTrailFile) return;
  try {
    __idTrailFile.open("a");
    __idTrailFile.writeln(new Date().getTime() + " " + step);
    __idTrailFile.close();
  } catch (_eT) {}
}

function __idRecipe(action, params) {
  __idTrailFile = params.logPath ? new File(params.logPath) : null;
  __idTrail("inicio " + action);
  var P = params.palette;
  if (!P) __mcpFail("INVALID_PARAMS", "palette is required (the server builds it from the brand kit).");
  var warnings = [];
  var nd = __idRecipeNewDoc(params);
  var doc = nd.doc, W = nd.W, H = nd.H, b = nd.b, m = nd.m;
  __idTrail("documento criado");
  // type scale: grows/shrinks slower than the page so small formats stay readable
  var s = Math.pow(Math.min(W, H) / 210, 0.6);
  var C = {
    bg: __idRecipeSwatch(doc, P.bg),
    text: __idRecipeSwatch(doc, P.text),
    text2: __idRecipeSwatch(doc, P.text2),
    accent: __idRecipeSwatch(doc, P.accent),
    accentText: __idRecipeSwatch(doc, P.accentText || P.accent),
    onAccent: __idRecipeSwatch(doc, P.onAccent),
    band: __idRecipeSwatch(doc, P.band),
    onBand: __idRecipeSwatch(doc, P.onBand)
  };
  __idTrail("amostras de cor");
  var F = params.fonts || {};
  var layer = doc.layers[0];
  try { layer.name = "Arte"; } catch (_eL) {}
  if (action === "id.recipe.flyer") return __idRecipeFlyer(doc, params, C, F, W, H, b, m, s, warnings);
  if (action === "id.recipe.manual") return __idRecipeManual(doc, params, C, F, W, H, b, m, s, warnings);
  return __idRecipeCatalog(doc, params, C, F, W, H, b, m, s, warnings);
}

/** Manual skeleton: cover, table of contents, chapter openers and threaded chapter text with placeholder copy;
 *  master A (running head + page number), master B (chapter opener: number only), every style named. */
function __idRecipeManual(doc, params, C, F, W, H, b, m, s, warnings) {
  var facing = params.facingPages !== false;
  var dp = doc.documentPreferences;
  dp.facingPages = facing;
  var st = {
    coverKicker: __idRecipeStyle(doc, "Capa Chamada", { font: F.rotulo, size: 10 * s, leading: 1.2, color: C.onBand, tracking: 120, caps: true, after: 6 * s }, warnings),
    coverTitle: __idRecipeStyle(doc, "Capa Titulo", { font: F.titulo, size: 34 * s, leading: 1.05, color: C.onBand, after: 8 * s }, warnings),
    coverSub: __idRecipeStyle(doc, "Capa Subtitulo", { font: F.corpo, size: 13 * s, leading: 1.3, color: C.onBand }, warnings),
    coverMeta: __idRecipeStyle(doc, "Capa Dados", { font: F.corpo, size: 8.5 * s, leading: 1.4, color: C.text2 }, warnings),
    tocTitle: __idRecipeStyle(doc, "Sumario Titulo", { font: F.titulo, size: 22 * s, leading: 1.1, color: C.text, after: 10 * s }, warnings),
    toc1: __idRecipeStyle(doc, "Sumario 1", { font: F.rotulo, size: 10.5 * s, leading: 1.3, color: C.text, before: 6 * s }, warnings),
    toc2: __idRecipeStyle(doc, "Sumario 2", { font: F.corpo, size: 9.5 * s, leading: 1.3, color: C.text2 }, warnings),
    chapNum: __idRecipeStyle(doc, "Capitulo Numero", { font: F.titulo, size: 48 * s, leading: 1, color: C.accentText, after: 4 * s }, warnings),
    h1: __idRecipeStyle(doc, "Titulo 1", { font: F.titulo, size: 24 * s, leading: 1.1, color: C.text, after: 12 * s }, warnings),
    h2: __idRecipeStyle(doc, "Titulo 2", { font: F.rotulo, size: 13 * s, leading: 1.2, color: C.text, before: 10 * s, after: 4 * s }, warnings),
    body: __idRecipeStyle(doc, "Corpo", { font: F.corpo, size: 9.5 * s, leading: 1.45, color: C.text, after: 4 * s, hyphenate: true }, warnings),
    list: __idRecipeStyle(doc, "Lista", { font: F.corpo, size: 9.5 * s, leading: 1.45, color: C.text, after: 2 * s, bullet: true }, warnings),
    note: __idRecipeStyle(doc, "Aviso", { font: F.rotulo, size: 9 * s, leading: 1.4, color: C.text, before: 6 * s, after: 6 * s }, warnings),
    caption: __idRecipeStyle(doc, "Legenda", { font: F.corpo, size: 7.5 * s, leading: 1.3, color: C.text2 }, warnings),
    head: __idRecipeStyle(doc, "Cabecalho", { font: F.corpo, size: 7.5 * s, leading: 1.2, color: C.text2, tracking: 60, caps: true }, warnings),
    folio: __idRecipeStyle(doc, "Numero Pagina", { font: F.rotulo, size: 8 * s, leading: 1.2, color: C.text }, warnings)
  };
  st.note.leftIndent = (4 * s) + "mm";
  try {
    st.note.paragraphShadingOn = true;
    st.note.paragraphShadingColor = C.accent;
    st.note.paragraphShadingTint = 18;
    st.note.paragraphShadingTopOffset = (2 * s) + "mm";
    st.note.paragraphShadingBottomOffset = (2 * s) + "mm";
    st.note.paragraphShadingLeftOffset = (3 * s) + "mm";
    st.note.paragraphShadingRightOffset = (3 * s) + "mm";
  } catch (_eSh) {
    warnings.push("estilo Aviso sem sombreamento de par\u00E1grafo (vers\u00E3o do InDesign)");
  }
  __idTrail("estilos");
  var title = params.title || "Manual";
  // Masters: A = running head + folio; B = chapter opener, folio only.
  var mA = doc.masterSpreads[0];
  try { mA.baseName = "Texto"; } catch (_eMn) {}
  var mB = doc.masterSpreads.add();
  try {
    mB.namePrefix = "B";
    mB.baseName = "Abertura";
  } catch (_eMb) {}
  var masters = [[mA, true], [mB, false]];
  for (var ms = 0; ms < masters.length; ms++) {
    var spread = masters[ms][0];
    for (var mp = 0; mp < spread.pages.length; mp++) {
      var pg = spread.pages[mp];
      pg.marginPreferences.properties = { top: m * 1.25, bottom: m * 1.4, left: m, right: m };
      var isLeft = facing && spread.pages.length > 1 && mp === 0;
      var fol = __idRecipeFrame(pg, "Numero", { x: m, y: H - m * 0.9, width: W - 2 * m, height: 6 * s });
      fol.contents = SpecialCharacters.AUTO_PAGE_NUMBER;
      fol.parentStory.paragraphs[0].applyParagraphStyle(st.folio, true);
      fol.parentStory.paragraphs[0].justification = isLeft ? Justification.LEFT_ALIGN : Justification.RIGHT_ALIGN;
      if (masters[ms][1]) {
        var rh = __idRecipeFrame(pg, "Cabecalho", { x: m, y: m * 0.45, width: W - 2 * m, height: 5 * s });
        rh.contents = __idUnescapeText(title);
        rh.parentStory.paragraphs[0].applyParagraphStyle(st.head, true);
        rh.parentStory.paragraphs[0].justification = isLeft ? Justification.LEFT_ALIGN : Justification.RIGHT_ALIGN;
        var rule = pg.graphicLines.add();
        rule.geometricBounds = [m * 0.45 + 6 * s, m, m * 0.45 + 6 * s, W - m];
        rule.strokeWeight = "0.5pt";
        rule.strokeColor = C.accent;
      }
    }
  }
  __idTrail("paginas-mestre");
  var chapters = params.chapters && params.chapters.length ? params.chapters : [{ title: "Introdu\u00E7\u00E3o", sections: ["Objetivo", "Como usar"] }];
  var nPar = typeof params.placeholderParagraphs === "number" ? params.placeholderParagraphs : 2;
  var filler = __idUnescapeText(params.placeholderText || "Texto provis\u00F3rio: escreva aqui o conte\u00FAdo desta se\u00E7\u00E3o. Frases curtas, um assunto por par\u00E1grafo, termos t\u00E9cnicos explicados na primeira vez em que aparecem.");
  // Page 1: cover (no master)
  var cover = doc.pages[0];
  cover.appliedMaster = NothingEnum.NOTHING;
  __idRecipeRect(cover, "Faixa capa", { x: -b, y: -b, width: W + 2 * b, height: H * 0.62 + b }, C.band);
  var cf = __idRecipeFrame(cover, "Capa", { x: m * 1.4, y: H * 0.22, width: W - 2.8 * m, height: H * 0.36 });
  cf.textFramePreferences.verticalJustification = VerticalJustification.BOTTOM_ALIGN;
  __idRecipeFill(cf, [[params.kicker || "Manual", st.coverKicker], [title, st.coverTitle], [params.subtitle, st.coverSub]]);
  var meta = [params.organization, params.version, params.date].join("\r").replace(/^\r+|\r+$/g, "").replace(/\r{2,}/g, "\r");
  if (meta) {
    var mf = __idRecipeFrame(cover, "Dados", { x: m * 1.4, y: H * 0.7, width: W - 2.8 * m, height: H * 0.2 });
    __idRecipeFill(mf, [[meta, st.coverMeta]]);
  }
  // Page 2: table of contents (chapter 1 then opens on page 3, a right-hand page)
  var tocPage = doc.pages.add(LocationOptions.AT_END);
  tocPage.appliedMaster = mA;
  __idTrail("capa e sumario");
  var report = { chapters: chapters.length, sections: 0, pages: 0, threadedFrames: 0 };
  for (var c = 0; c < chapters.length; c++) {
    var ch = chapters[c];
    var opener = doc.pages.add(LocationOptions.AT_END);
    if (facing && params.chapterOnRight !== false && opener.side !== PageSideOptions.RIGHT_HAND) {
      // blank left-hand page before a chapter: no running head, no number (book convention)
      opener.appliedMaster = NothingEnum.NOTHING;
      opener = doc.pages.add(LocationOptions.AT_END);
    }
    opener.appliedMaster = mB;
    var top = H * 0.32;
    var frame = __idRecipeFrame(opener, "Capitulo " + (c + 1), { x: m, y: top, width: W - 2 * m, height: H - top - m * 1.4 });
    var paras = [[String(c + 1 < 10 ? "0" + (c + 1) : c + 1), st.chapNum], [ch.title || "Cap\u00EDtulo " + (c + 1), st.h1]];
    if (ch.intro) paras.push([ch.intro, st.body]);
    var secs = ch.sections || [];
    for (var sx = 0; sx < secs.length; sx++) {
      paras.push([(c + 1) + "." + (sx + 1) + "  " + secs[sx], st.h2]);
      for (var pp = 0; pp < nPar; pp++) paras.push([filler, st.body]);
      if (c === 0 && sx === 0) paras.push([__idUnescapeText("Aviso: use este estilo para cuidados, alertas e informa\u00E7\u00F5es que n\u00E3o podem passar despercebidas."), st.note]);
      report.sections++;
    }
    if (!secs.length) for (var p0 = 0; p0 < nPar; p0++) paras.push([filler, st.body]);
    __idRecipeFill(frame, paras);
    // thread onto new pages (master A) until the chapter fits
    var guard = 0;
    while (frame.overflows && guard++ < 60) {
      var np = doc.pages.add(LocationOptions.AT_END);
      np.appliedMaster = mA;
      var nf = __idRecipeFrame(np, "Capitulo " + (c + 1) + " cont", { x: m, y: m * 1.25, width: W - 2 * m, height: H - m * 2.65 });
      frame.nextTextFrame = nf;
      frame = nf;
      report.threadedFrames++;
    }
    __idTrail("capitulo " + (c + 1) + "/" + chapters.length);
  }
  // Table of contents from Titulo 1 / Titulo 2
  try {
    var tocSt = doc.tocStyles.add({ name: "Sumario do manual" });
    tocSt.title = __idUnescapeText("Sum\u00E1rio");
    tocSt.titleStyle = st.tocTitle;
    var e1 = tocSt.tocStyleEntries.add({ name: "Titulo 1" });
    e1.level = 1;
    e1.formatStyle = st.toc1;
    var e2 = tocSt.tocStyleEntries.add({ name: "Titulo 2" });
    e2.level = 2;
    e2.formatStyle = st.toc2;
    try {
      e1.separator = "^t";
      e2.separator = "^t";
    } catch (_eSep) {}
    app.activeWindow.activePage = tocPage;
    var res = doc.createTOC(tocSt, true, undefined, [m, m * 1.25], false);
    var tocStory = res && res.textContainers ? res : (res && res.length ? res[0] : res);
    var tf = tocStory && tocStory.textContainers ? tocStory.textContainers[0] : null;
    if (tf && tf.isValid) {
      if (!tf.parentPage || tf.parentPage.id !== tocPage.id) tf.move(tocPage);
      tf.geometricBounds = [m * 1.25, m, H - m * 1.4, W - m];
      tf.name = "Sumario";
      var tabPos = W - 2 * m;
      var tocStyles = [st.toc1, st.toc2];
      for (var ts = 0; ts < tocStyles.length; ts++) {
        try {
          tocStyles[ts].tabStops.everyItem().remove();
          tocStyles[ts].tabStops.add({ alignment: TabStopAlignment.RIGHT_ALIGN, position: tabPos, leader: ".  " });
        } catch (_eTab) {}
      }
    } else warnings.push("sum\u00E1rio criado, mas o quadro n\u00E3o foi encontrado para posicionar");
  } catch (eToc) {
    warnings.push("sum\u00E1rio n\u00E3o gerado: " + eToc.message + " (use id_create_toc depois)");
  }
  report.pages = doc.pages.length;
  __idTrail("fim");
  return {
    document: String(doc.name),
    width: W,
    height: H,
    facingPages: facing,
    masters: ["A-Texto (cabe\u00E7alho + n\u00FAmero)", "B-Abertura (s\u00F3 n\u00FAmero)"],
    styles: ["Capa Chamada", "Capa Titulo", "Capa Subtitulo", "Capa Dados", "Sumario Titulo", "Sumario 1", "Sumario 2", "Capitulo Numero", "Titulo 1", "Titulo 2", "Corpo", "Lista", "Aviso", "Legenda", "Cabecalho", "Numero Pagina"],
    report: report,
    warnings: warnings
  };
}

function __idRecipeFlyer(doc, params, C, F, W, H, b, m, s, warnings) {
  var c = params.content || {};
  var layout = params.layout || (W > H * 1.15 ? "lateral" : "imagem-topo");
  var page = doc.pages[0];
  var st = {
    kicker: __idRecipeStyle(doc, "MCP Chamada", { font: F.rotulo, size: 9 * s, tracking: 120, caps: true, color: C.accentText, after: 6 * s }, warnings),
    title: __idRecipeStyle(doc, "MCP Titulo", { font: F.titulo, size: (layout === "lateral" ? 38 : 44) * s, leading: 1.0, color: C.text, after: 10 * s }, warnings),
    subtitle: __idRecipeStyle(doc, "MCP Subtitulo", { font: F.corpo, size: 15 * s, leading: 1.3, color: C.text2, after: 10 * s }, warnings),
    body: __idRecipeStyle(doc, "MCP Corpo", { font: F.corpo, size: 10.5 * s, leading: 1.45, color: C.text, after: 6 * s, hyphenate: true }, warnings),
    list: __idRecipeStyle(doc, "MCP Lista", { font: F.corpo, size: 10.5 * s, leading: 1.45, color: C.text, after: 3 * s, bullet: true }, warnings),
    cta: __idRecipeStyle(doc, "MCP CTA", { font: F.rotulo, size: 13 * s, leading: 1.15, color: C.onAccent }, warnings),
    footer: __idRecipeStyle(doc, "MCP Rodape", { font: F.corpo, size: 8.5 * s, leading: 1.35, color: C.onBand }, warnings)
  };
  __idTrail("estilos e fontes");
  var made = {};
  made.fundo = __idRecipeRect(page, "Fundo", { x: -b, y: -b, width: W + 2 * b, height: H + 2 * b }, C.bg || "Paper");
  var footH = Math.max(14, 20 * s);
  var colX = m, colW = W - 2 * m, textTop, bandX = -b, bandW = W + 2 * b;
  if (layout === "lateral") {
    var split = W * 0.48;
    made.imagem = __idRecipeRect(page, "Imagem", { x: -b, y: -b, width: split + b, height: H + 2 * b }, C.band);
    colX = split + m;
    colW = W - split - 2 * m;
    textTop = m;
    bandX = split;
    bandW = W - split + b;
  } else if (layout === "imagem-cheia") {
    made.imagem = __idRecipeRect(page, "Imagem", { x: -b, y: -b, width: W + 2 * b, height: H + 2 * b }, C.band);
    // solid veil under the text plus a gradient-feathered strip above it, so the photo fades into the text area
    made.veuSolido = __idRecipeRect(page, "Veu", { x: -b, y: H * 0.56, width: W + 2 * b, height: H * 0.44 + b }, C.bg || C.band);
    made.veu = __idRecipeRect(page, "Veu degrade", { x: -b, y: H * 0.26, width: W + 2 * b, height: H * 0.31 }, C.bg || C.band);
    try {
      var gf = made.veu.transparencySettings.gradientFeatherSettings;
      gf.applied = true;
      gf.type = GradientType.LINEAR;
      gf.angle = 90;
    } catch (_eG) {
      try { made.veu.transparencySettings.blendingSettings.opacity = 60; } catch (_eO) {}
      warnings.push("degrad\u00EA do v\u00E9u indispon\u00EDvel: usei opacidade 60 %");
    }
    textTop = H * 0.52;
  } else {
    made.imagem = __idRecipeRect(page, "Imagem", { x: -b, y: -b, width: W + 2 * b, height: H * 0.5 + b }, C.band);
    textTop = H * 0.5 + m * 0.9;
  }
  __idTrail("colocando imagem");
  var w = __idRecipePlace(made.imagem, c.imagePath, FitOptions.FILL_PROPORTIONALLY);
  if (w) warnings.push(w);
  __idTrail("imagem colocada");

  // footer band with contact text and logo
  var footTop = H - footH;
  made.faixa = __idRecipeRect(page, "Faixa rodape", { x: bandX, y: footTop, width: bandW, height: footH + b }, C.band);
  var logoW = c.logoPath ? Math.min(42 * s, colW * 0.35) : 0;
  if (c.footer) {
    made.rodape = __idRecipeFrame(page, "Rodape", { x: colX, y: footTop, width: colW - (logoW ? logoW + 4 : 0), height: footH - 4 });
    made.rodape.textFramePreferences.verticalJustification = VerticalJustification.CENTER_ALIGN; __idCapCenter(made.rodape, "capHeight");
    __idRecipeFill(made.rodape, [[c.footer, st.footer]]);
  }
  if (c.logoPath) {
    made.logo = __idRecipeRect(page, "Logo", { x: colX + colW - logoW, y: footTop + footH * 0.2, width: logoW, height: footH * 0.6 }, "None");
    var wl = __idRecipePlace(made.logo, c.logoPath, FitOptions.PROPORTIONALLY);
    if (wl) warnings.push(wl);
  }

  __idTrail("rodape e logo");
  // call to action: auto-sized button above the footer
  var ctaGap = 8 * s;
  var ctaH = 0;
  if (c.cta) {
    made.cta = __idRecipeFrame(page, "CTA", { x: colX, y: footTop - ctaGap - 12 * s, width: colW * 0.8, height: 12 * s });
    made.cta.fillColor = C.accent;
    made.cta.textFramePreferences.insetSpacing = [3 * s, 5 * s, 3 * s, 5 * s];
    made.cta.textFramePreferences.verticalJustification = VerticalJustification.CENTER_ALIGN; __idCapCenter(made.cta, "capHeight");
    __idRecipeFill(made.cta, [[c.cta, st.cta]]);
    try {
      made.cta.textFramePreferences.autoSizingReferencePoint = AutoSizingReferenceEnum.BOTTOM_LEFT_POINT;
      made.cta.textFramePreferences.useNoLineBreaksForAutoSizing = true;
      made.cta.textFramePreferences.autoSizingType = AutoSizingTypeEnum.HEIGHT_AND_WIDTH;
    } catch (_eA) {}
    var gb = made.cta.geometricBounds;
    ctaH = gb[2] - gb[0];
    if (gb[3] - gb[1] > colW) {
      try {
        made.cta.textFramePreferences.useNoLineBreaksForAutoSizing = false;
        made.cta.textFramePreferences.autoSizingType = AutoSizingTypeEnum.HEIGHT_ONLY;
      } catch (_eA2) {}
      made.cta.geometricBounds = [gb[0], colX, gb[2], colX + colW];
      gb = made.cta.geometricBounds;
      ctaH = gb[2] - gb[0];
    }
  }

  // main text column
  var textBottom = footTop - (c.cta ? ctaGap + ctaH + ctaGap : ctaGap);
  made.texto = __idRecipeFrame(page, "Texto", { x: colX, y: textTop, width: colW, height: Math.max(10, textBottom - textTop) });
  if (layout === "imagem-cheia") made.texto.textFramePreferences.verticalJustification = VerticalJustification.BOTTOM_ALIGN;
  var paras = [[c.kicker, st.kicker], [c.title, st.title], [c.subtitle, st.subtitle], [c.body, st.body]];
  var bullets = c.bullets || [];
  for (var bi = 0; bi < bullets.length; bi++) paras.push([bullets[bi], st.list]);
  __idRecipeFill(made.texto, paras);
  __idTrail("texto preenchido");
  var fit = __idRecipeShrink([made.texto], [st.title, st.subtitle, st.body, st.list, st.kicker], 8);
  __idTrail("ajuste do texto: " + fit.steps + " passo(s)");
  if (fit.steps) warnings.push("texto reduzido " + fit.shrinkPercent + " % para caber" + (fit.stillOverset ? " \u2014 ainda sobra texto: corte o texto ou use um formato maior" : ""));

  var ids = {};
  for (var k in made) if (Object.prototype.hasOwnProperty.call(made, k)) ids[k] = made[k].id;
  __idTrail("fim");
  return { document: String(doc.name), layout: layout, width: W, height: H, bleed: b, margin: m, items: ids, fit: fit, warnings: warnings };
}

function __idRecipeCatalog(doc, params, C, F, W, H, b, m, s, warnings) {
  var recs = params.records || [];
  if (!recs.length) __mcpFail("INVALID_PARAMS", "No records.");
  var cols = params.columns || 2;
  var rows = params.rows || 3;
  var per = cols * rows;
  var nPages = Math.ceil(recs.length / per);
  while (doc.pages.length < nPages) doc.pages.add(LocationOptions.AT_END);
  var st = {
    header: __idRecipeStyle(doc, "MCP Cabecalho", { font: F.titulo, size: 16 * s, leading: 1.1, color: C.onBand }, warnings),
    headerSub: __idRecipeStyle(doc, "MCP Cabecalho 2", { font: F.corpo, size: 8.5 * s, leading: 1.2, color: C.onBand, tracking: 60, caps: true }, warnings),
    name: __idRecipeStyle(doc, "MCP Produto", { font: F.rotulo, size: 11 * s, leading: 1.2, color: C.text, after: 2 * s }, warnings),
    code: __idRecipeStyle(doc, "MCP Codigo", { font: F.corpo, size: 7 * s, leading: 1.2, color: C.text2, tracking: 40, caps: true, after: 2 * s }, warnings),
    desc: __idRecipeStyle(doc, "MCP Descricao", { font: F.corpo, size: 8.5 * s, leading: 1.35, color: C.text2, hyphenate: true }, warnings),
    price: __idRecipeStyle(doc, "MCP Preco", { font: F.titulo, size: 13 * s, leading: 1.1, color: C.accentText }, warnings),
    footer: __idRecipeStyle(doc, "MCP Rodape", { font: F.corpo, size: 7.5 * s, leading: 1.2, color: C.text2 }, warnings)
  };
  var headH = Math.max(16, 22 * s);
  var footH = 10 * s;
  var gap = typeof params.gutter === "number" ? params.gutter : 6 * s;
  var gridTop = headH + m * 0.8;
  var gridH = H - footH - m * 0.6 - gridTop;
  var cellW = (W - 2 * m - (cols - 1) * gap) / cols;
  var cellH = (gridH - (rows - 1) * gap) / rows;
  var imgRatio = typeof params.imageRatio === "number" ? params.imageRatio : 0.58;
  var report = { pages: nPages, cards: 0, imagesMissing: 0, oversetCards: [] };
  for (var p = 0; p < nPages; p++) {
    __idTrail("pagina " + (p + 1) + "/" + nPages);
    var page = doc.pages[p];
    if (C.bg) __idRecipeRect(page, "Fundo", { x: -b, y: -b, width: W + 2 * b, height: H + 2 * b }, C.bg);
    __idRecipeRect(page, "Faixa cabecalho", { x: -b, y: -b, width: W + 2 * b, height: headH + b }, C.band);
    var hf = __idRecipeFrame(page, "Cabecalho", { x: m, y: 4, width: W - 2 * m, height: headH - 6 });
    hf.textFramePreferences.verticalJustification = VerticalJustification.CENTER_ALIGN; __idCapCenter(hf, "capHeight");
    __idRecipeFill(hf, [[params.headerSubtitle, st.headerSub], [params.title || "Cat\u00E1logo", st.header]]);
    var ff = __idRecipeFrame(page, "Rodape", { x: m, y: H - footH - Math.max(4, m * 0.3), width: W - 2 * m, height: footH });
    ff.textFramePreferences.verticalJustification = VerticalJustification.CENTER_ALIGN; __idCapCenter(ff, "capHeight");
    __idRecipeFill(ff, [[(params.footer ? params.footer + "   \u00B7   " : "") + (p + 1) + "/" + nPages, st.footer]]);
    for (var k = 0; k < per; k++) {
      var ri = p * per + k;
      if (ri >= recs.length) break;
      var r = recs[ri];
      var col = k % cols;
      var row = Math.floor(k / cols);
      var x = m + col * (cellW + gap);
      var y = gridTop + row * (cellH + gap);
      var imgH = cellH * imgRatio;
      var img = __idRecipeRect(page, "Imagem " + (ri + 1), { x: x, y: y, width: cellW, height: imgH }, C.band);
      var wi = __idRecipePlace(img, r.image, FitOptions.FILL_PROPORTIONALLY);
      if (wi) { report.imagesMissing++; if (r.image) warnings.push("item " + (ri + 1) + ": " + wi); }
      var priceH = r.price ? 7 * s : 0;
      var tf = __idRecipeFrame(page, "Texto " + (ri + 1), { x: x, y: y + imgH + 3 * s, width: cellW, height: cellH - imgH - 3 * s - priceH });
      __idRecipeFill(tf, [[r.code, st.code], [r.title, st.name], [r.description, st.desc]]);
      if (r.price) {
        var pf = __idRecipeFrame(page, "Preco " + (ri + 1), { x: x, y: y + cellH - priceH, width: cellW, height: priceH });
        pf.textFramePreferences.verticalJustification = VerticalJustification.BOTTOM_ALIGN;
        __idRecipeFill(pf, [[r.price, st.price]]);
      }
      if (tf.overflows) report.oversetCards.push(ri + 1);
      report.cards++;
    }
  }
  if (report.oversetCards.length) {
    // shrink the description style once for all cards, then report what still does not fit
    var steps = 0;
    var anyOver = function () {
      for (var q = 0; q < doc.textFrames.length; q++) if (/^Texto /.test(String(doc.textFrames[q].name)) && doc.textFrames[q].overflows) return true;
      return false;
    };
    while (anyOver() && steps < 3) {
      var ptv = st.desc.pointSize;
      var inPt = typeof ptv === "number" ? ptv * 72 / 25.4 : 8.5 * s;
      var nx = Math.round(inPt * 0.92 * 10) / 10;
      st.desc.pointSize = nx + "pt";
      st.desc.leading = (Math.round(nx * 1.35 * 10) / 10) + "pt";
      steps++;
    }
    var still = [];
    for (var q2 = 0; q2 < doc.textFrames.length; q2++) {
      var t2 = doc.textFrames[q2];
      if (/^Texto /.test(String(t2.name)) && t2.overflows) still.push(Number(String(t2.name).replace("Texto ", "")));
    }
    report.descriptionShrinkSteps = steps;
    report.oversetCards = still.sort(function (a, z) { return a - z; });
    if (still.length) warnings.push("descri\u00E7\u00E3o longa demais nos itens " + still.join(", ") + ": encurte o texto ou use menos itens por p\u00E1gina");
  }
  __idTrail("fim");
  return { document: String(doc.name), width: W, height: H, bleed: b, margin: m, columns: cols, rows: rows, records: recs.length, report: report, warnings: warnings };
}

function __mcpDispatch(action, params, options) {
  params = params || {};
  var prefs = app.scriptPreferences;
  var prevUnit = null;
  var prevInteraction = null;
  var docState = null;
  try {
    prevUnit = prefs.measurementUnit;
    var unitKey = __ID_UNITS[params.units || "mm"];
    if (!unitKey) throw new Error("Unknown units '" + params.units + "'. Use mm, cm, pt, px, in or pica.");
    prefs.measurementUnit = MeasurementUnits[unitKey];
  } catch (eU) {
    if (/Unknown units/.test(String(eU.message))) throw eU;
  }
  try {
    prevInteraction = prefs.userInteractionLevel;
    prefs.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;
  } catch (_eI) {}
  try {
    if (app.documents.length > 0) {
      var vp = app.activeDocument.viewPreferences;
      docState = { doc: app.activeDocument, origin: vp.rulerOrigin, zero: app.activeDocument.zeroPoint };
      vp.rulerOrigin = RulerOrigin.PAGE_ORIGIN;
      app.activeDocument.zeroPoint = [0, 0];
    }
  } catch (_eO) {
    docState = null;
  }
  try {
    return __idDispatch(action, params, options);
  } finally {
    try {
      if (docState && docState.doc.isValid) {
        docState.doc.viewPreferences.rulerOrigin = docState.origin;
        docState.doc.zeroPoint = docState.zero;
      }
    } catch (_eR1) {}
    try {
      if (prevUnit !== null) prefs.measurementUnit = prevUnit;
      if (prevInteraction !== null) prefs.userInteractionLevel = prevInteraction;
    } catch (_eR2) {}
  }
}
