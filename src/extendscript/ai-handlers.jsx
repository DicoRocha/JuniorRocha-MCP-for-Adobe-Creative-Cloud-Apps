/*
 * ai-handlers.jsx
 * Pure ECMAScript 3 ExtendScript handlers for Adobe Illustrator (CEP + Windows COM DoJavaScript + C++ ScriptMessage).
 */

function __aiMakeRgbColor(spec) {
  if (!spec) return null;
  var col = new RGBColor();
  if (typeof spec === "string") {
    var hex = spec.replace("#", "");
    col.red = parseInt(hex.substring(0, 2), 16) || 0;
    col.green = parseInt(hex.substring(2, 4), 16) || 0;
    col.blue = parseInt(hex.substring(4, 6), 16) || 0;
  } else {
    col.red = typeof spec.r === "number" ? spec.r : (spec[0] || 0);
    col.green = typeof spec.g === "number" ? spec.g : (spec[1] || 0);
    col.blue = typeof spec.b === "number" ? spec.b : (spec[2] || 0);
  }
  return col;
}

/** First file matching re inside folder (recursive). */
function __aiFindFirstFile(folder, re) {
  var items = folder.getFiles();
  for (var i = 0; i < items.length; i++) {
    if (items[i] instanceof Folder) {
      var deep = __aiFindFirstFile(items[i], re);
      if (deep) return deep;
    } else if (re.test(items[i].name)) {
      return items[i];
    }
  }
  return null;
}

/** Every file under a folder (recursive) whose name matches. */
function __aiFindAllFiles(folder, re, out) {
  out = out || [];
  var items = folder.getFiles();
  for (var i = 0; i < items.length; i++) {
    if (items[i] instanceof Folder) __aiFindAllFiles(items[i], re, out);
    else if (re.test(items[i].name)) out.push(items[i]);
  }
  return out;
}

/**
 * After a legacy export that re-targeted the document to the exported file, reopen the original
 * file so the next save does not overwrite the export or lose the .ai.
 */
function __aiRestoreDocPath(doc, original) {
  if (!original) return;
  var now = null;
  try {
    now = doc.fullName ? doc.fullName.fsName : null;
  } catch (_eNow) {}
  if (now && !__mcpSamePath(now, original.fsName)) {
    app.open(original);
    doc.close(SaveOptions.DONOTSAVECHANGES);
  }
}

function __aiRequireDoc() {
  if (!app.documents || app.documents.length === 0 || !app.activeDocument) {
    throw new Error("No active document in Adobe Illustrator.");
  }
  return app.activeDocument;
}

function __aiEncodeFileToBase64(fileObj) {
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

function __aiArtboardRect(doc, index) {
  var i = typeof index === "number" ? index : doc.artboards.getActiveArtboardIndex();
  return doc.artboards[i].artboardRect;
}

function __aiUuid(item) {
  try {
    return item.uuid ? String(item.uuid) : null;
  } catch (_e) {
    return null;
  }
}

/** Item summary in artboard coordinates: x/y = top-left corner measured from the artboard's top-left, y down. */
function __aiDescribeItem(item, rect) {
  var gb = item.geometricBounds;
  return {
    uuid: __aiUuid(item),
    name: String(item.name || ""),
    typename: String(item.typename),
    layer: item.layer ? String(item.layer.name) : null,
    x: gb[0] - rect[0],
    y: rect[1] - gb[1],
    width: gb[2] - gb[0],
    height: gb[1] - gb[3],
    hidden: Boolean(item.hidden),
    locked: Boolean(item.locked),
    opacity: item.opacity
  };
}

/**
 * Target items: uuids, itemNames, layerName, or the current selection. When the caller named items
 * that do not exist this throws instead of silently editing the selection.
 */
function __aiCollectItems(doc, params) {
  var out = [];
  var named = false;
  var i, j;
  if (params.uuids instanceof Array && params.uuids.length) {
    named = true;
    for (i = 0; i < params.uuids.length; i++) {
      var hit = null;
      try {
        hit = doc.getPageItemFromUuid(params.uuids[i]);
      } catch (_eU) {
        hit = null;
      }
      if (!hit) {
        for (j = 0; j < doc.pageItems.length; j++) {
          if (__aiUuid(doc.pageItems[j]) === String(params.uuids[i])) {
            hit = doc.pageItems[j];
            break;
          }
        }
      }
      if (hit) out.push(hit);
    }
  }
  if (params.itemNames instanceof Array && params.itemNames.length) {
    named = true;
    for (i = 0; i < params.itemNames.length; i++) {
      for (j = 0; j < doc.pageItems.length; j++) {
        if (doc.pageItems[j].name === params.itemNames[i]) out.push(doc.pageItems[j]);
      }
    }
  }
  if (params.layerName) {
    named = true;
    var lyr = doc.layers.getByName(params.layerName);
    for (i = 0; i < lyr.pageItems.length; i++) out.push(lyr.pageItems[i]);
  }
  if (!named && params.useSelection !== false && doc.selection && doc.selection.length) {
    for (i = 0; i < doc.selection.length; i++) out.push(doc.selection[i]);
  }
  if (out.length === 0) {
    throw new Error(named
      ? "No item matches the given uuids / itemNames / layerName. Use ai_find_objects."
      : "No target items: give uuids, itemNames or layerName, or select objects in Illustrator.");
  }
  return out;
}

function __aiSelectOnly(doc, items) {
  doc.selection = null;
  for (var i = 0; i < items.length; i++) items[i].selected = true;
}

function __aiParseColor(spec) {
  if (spec && typeof spec === "object" && spec.typename) return spec;
  return __aiMakeRgbColor(spec);
}

/** Fill / stroke for paths, compound paths, text and groups (recursively). */
function __aiPaint(item, fill, stroke, strokeWidth) {
  var t = item.typename;
  if (t === "GroupItem") {
    for (var g = 0; g < item.pageItems.length; g++) __aiPaint(item.pageItems[g], fill, stroke, strokeWidth);
    return;
  }
  if (t === "CompoundPathItem") {
    for (var c = 0; c < item.pathItems.length; c++) __aiPaint(item.pathItems[c], fill, stroke, strokeWidth);
    return;
  }
  if (t === "TextFrame") {
    var attrs = item.textRange.characterAttributes;
    if (fill) attrs.fillColor = fill;
    if (stroke) attrs.strokeColor = stroke;
    if (typeof strokeWidth === "number") attrs.strokeWeight = strokeWidth;
    return;
  }
  if (t === "PathItem") {
    if (fill) {
      item.filled = true;
      item.fillColor = fill;
    }
    if (stroke) {
      item.stroked = true;
      item.strokeColor = stroke;
    }
    if (typeof strokeWidth === "number") {
      item.stroked = strokeWidth > 0;
      item.strokeWidth = strokeWidth;
    }
  }
}

function __aiBounds(items, visible) {
  var b = null;
  for (var i = 0; i < items.length; i++) {
    var r = visible ? items[i].visibleBounds : items[i].geometricBounds;
    if (!b) b = [r[0], r[1], r[2], r[3]];
    else {
      b[0] = Math.min(b[0], r[0]);
      b[1] = Math.max(b[1], r[1]);
      b[2] = Math.max(b[2], r[2]);
      b[3] = Math.min(b[3], r[3]);
    }
  }
  return b;
}

/* ---------- Recipe (phase 3): logo package ---------- */

function __aiPkgColor(doc, spec) {
  // spec: {hex, cmyk?}; document colour mode decides the colour model
  if (doc.documentColorSpace === DocumentColorSpace.CMYK) {
    var c = new CMYKColor();
    var v = spec.cmyk;
    if (!v) {
      var h = String(spec.hex).replace("#", "");
      var r = parseInt(h.substring(0, 2), 16) / 255, g = parseInt(h.substring(2, 4), 16) / 255, b = parseInt(h.substring(4, 6), 16) / 255;
      var k = 1 - Math.max(r, g, b);
      v = k >= 0.999 ? [0, 0, 0, 100] : [Math.round((1 - r - k) / (1 - k) * 100), Math.round((1 - g - k) / (1 - k) * 100), Math.round((1 - b - k) / (1 - k) * 100), Math.round(k * 100)];
    }
    c.cyan = v[0]; c.magenta = v[1]; c.yellow = v[2]; c.black = v[3];
    return c;
  }
  return __aiMakeRgbColor(spec.hex);
}

function __aiPkgWhite(doc) { return __aiPkgColor(doc, { hex: "#FFFFFF", cmyk: [0, 0, 0, 0] }); }
function __aiPkgBlack(doc) { return __aiPkgColor(doc, { hex: "#000000", cmyk: [0, 0, 0, 100] }); }

/** Recolours everything inside an item to one colour; counts what cannot be recoloured. */
function __aiPkgRecolor(item, color, rep) {
  var t = item.typename;
  if (t === "GroupItem") {
    for (var i = 0; i < item.pageItems.length; i++) __aiPkgRecolor(item.pageItems[i], color, rep);
  } else if (t === "CompoundPathItem") {
    for (var j = 0; j < item.pathItems.length; j++) __aiPkgRecolor(item.pathItems[j], color, rep);
  } else if (t === "PathItem") {
    if (item.clipping) return;
    if (item.filled) { item.fillColor = color; rep.paths++; }
    if (item.stroked) { item.strokeColor = color; rep.paths++; }
  } else if (t === "TextFrame") {
    item.textRange.characterAttributes.fillColor = color;
    rep.texts++;
  } else if (t === "RasterItem" || t === "PlacedItem") {
    rep.images++;
  } else {
    rep.other++;
  }
}

function __aiPkgItemsIn(doc, rect) {
  // top-level items (parent is a layer) of visible layers, touching the artboard
  var out = [];
  var all = doc.pageItems;
  for (var i = 0; i < all.length; i++) {
    var it = all[i];
    if (it.parent.typename !== "Layer") continue;
    if (it.layer.name === "MCP Pacote de marca") continue;
    var hidden = false;
    try { hidden = it.hidden || !it.layer.visible; } catch (_eH) {}
    if (hidden) continue;
    var b = it.visibleBounds;
    if (b[2] > rect[0] && b[0] < rect[2] && b[1] > rect[3] && b[3] < rect[1]) out.push(it);
  }
  return out;
}

/** Duplicates the art of an artboard into a new group on `layer`. */
function __aiPkgCopyArt(doc, abIndex, layer) {
  var rect = doc.artboards[abIndex].artboardRect;
  var items = __aiPkgItemsIn(doc, rect);
  if (!items.length) __mcpFail("INVALID_PARAMS", "Artboard " + abIndex + " has no visible art.");
  var g = layer.groupItems.add();
  for (var i = items.length - 1; i >= 0; i--) items[i].duplicate(g, ElementPlacement.PLACEATBEGINNING);
  return g;
}

/** Scales a group to fit `frac` of rect [l, t, r, b] and centres it there. */
function __aiPkgFit(g, rect, frac) {
  var gb = g.visibleBounds;
  var w = gb[2] - gb[0], h = gb[1] - gb[3];
  var rw = rect[2] - rect[0], rh = rect[1] - rect[3];
  var s = Math.min(rw * frac / w, rh * frac / h) * 100;
  g.resize(s, s, true, true, true, true, s, Transformation.CENTER);
  gb = g.visibleBounds;
  g.translate((rect[0] + rect[2]) / 2 - (gb[0] + gb[2]) / 2, (rect[1] + rect[3]) / 2 - (gb[1] + gb[3]) / 2);
  return g;
}

function __aiPkgNewArtboard(doc, w, h, name, gap) {
  var maxR = -1e9, top = 0;
  for (var i = 0; i < doc.artboards.length; i++) {
    var r = doc.artboards[i].artboardRect;
    if (r[2] > maxR) { maxR = r[2]; top = r[1]; }
  }
  var rect = [maxR + gap, top, maxR + gap + w, top - h];
  var ab = doc.artboards.add(rect);
  ab.name = name;
  return { index: doc.artboards.length - 1, rect: rect };
}

function __aiPkgRect(layer, rect, color) {
  var p = layer.pathItems.rectangle(rect[1], rect[0], rect[2] - rect[0], rect[1] - rect[3]);
  p.stroked = false;
  p.filled = true;
  p.fillColor = color;
  return p;
}

function __aiPkgText(layer, x, yTop, text, size, color, font) {
  var t = layer.textFrames.add();
  t.contents = text;
  t.textRange.characterAttributes.size = size;
  t.textRange.characterAttributes.fillColor = color;
  if (font) { try { t.textRange.characterAttributes.textFont = app.textFonts.getByName(font); } catch (_eF) {} }
  t.left = x;
  t.top = yTop;
  return t;
}

/** Make / release an opacity mask on the selection (Transparency panel). Filled in after the live probe. */
function __aiRunTransparencyMask(make) {
  __mcpFail("NOT_AVAILABLE", "Opacity masks are not exposed to scripts in this Illustrator version.");
}

/** Arrowheads on the selected paths. Filled in after the live probe. */
function __aiApplyArrowheads(items, startName, endName, scale) {
  __mcpFail("NOT_AVAILABLE", "Arrowheads are not exposed to scripts in this Illustrator version.");
}

function __aiRecipeLogoPackage(params) {
  var doc = __aiRequireDoc();
  var prevUil = app.userInteractionLevel;
  app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
  try {
    if (params.op === "pdf") {
      var aiFile = new File(params.aiPath);
      var pdfFile = __mcpPrepareOutputFile(params.pdfPath);
      var po = new PDFSaveOptions();
      po.preserveEditability = false;
      po.generateThumbnails = true;
      try { po.compatibility = PDFCompatibility.ACROBAT7; } catch (_eC) {}
      doc.saveAs(pdfFile, po);
      doc.close(SaveOptions.DONOTSAVECHANGES);
      app.open(aiFile);
      return { pdf: pdfFile.fsName, exists: new File(pdfFile.fsName).exists, reopened: aiFile.fsName };
    }
    // 1. Work on a copy: the client's original file is never changed
    var srcPath = null;
    try { srcPath = doc.fullName && doc.fullName.exists ? doc.fullName.fsName : null; } catch (_eS) {}
    var copy = __mcpPrepareOutputFile(params.aiPath);
    doc.saveAs(copy, new IllustratorSaveOptions());

    var srcIdx = typeof params.artboardIndex === "number" ? params.artboardIndex : 0;
    var symIdx = typeof params.symbolArtboardIndex === "number" ? params.symbolArtboardIndex : -1;
    if (symIdx < 0) {
      for (var a = 0; a < doc.artboards.length; a++) {
        if (a !== srcIdx && /s[i\u00ED]mbolo|symbol|icone|\u00EDcone|icon|monogram/i.test(doc.artboards[a].name)) { symIdx = a; break; }
      }
    }
    var srcRect = doc.artboards[srcIdx].artboardRect;
    var W = srcRect[2] - srcRect[0], H = srcRect[1] - srcRect[3];
    var gap = Math.max(40, W * 0.15);
    var layer = doc.layers.add();
    layer.name = "MCP Pacote de marca";
    var out = { aiPath: copy.fsName, original: srcPath, colorSpace: String(doc.documentColorSpace), source: { index: srcIdx, name: doc.artboards[srcIdx].name, width: W, height: H }, artboards: [], recolor: {}, warnings: [] };
    try { doc.artboards[srcIdx].name = "cor"; } catch (_eN) {}
    out.artboards.push({ version: "cor", index: srcIdx, width: W, height: H });

    var white = __aiPkgWhite(doc), black = __aiPkgBlack(doc);
    var versions = [["negativa", white], ["mono-preto", black]];
    for (var v = 0; v < versions.length; v++) {
      var nab = __aiPkgNewArtboard(doc, W, H, versions[v][0], gap);
      var g = __aiPkgCopyArt(doc, srcIdx, layer);
      g.translate(nab.rect[0] - srcRect[0], nab.rect[1] - srcRect[1]);
      var rep = { paths: 0, texts: 0, images: 0, other: 0 };
      __aiPkgRecolor(g, versions[v][1], rep);
      g.name = versions[v][0];
      out.recolor[versions[v][0]] = rep;
      if (rep.images) out.warnings.push(versions[v][0] + ": " + rep.images + " imagem(ns) dentro do logo n\u00E3o foram recoloridas \u2014 vetorize-as");
      if (rep.other) out.warnings.push(versions[v][0] + ": " + rep.other + " objeto(s) especiais (s\u00EDmbolo, malha, efeito) n\u00E3o recoloridos \u2014 expanda-os e rode de novo");
      out.artboards.push({ version: versions[v][0], index: nab.index, width: W, height: H });
    }
    if (symIdx >= 0) {
      var sr = doc.artboards[symIdx].artboardRect;
      try { doc.artboards[symIdx].name = "simbolo-cor"; } catch (_eN2) {}
      out.artboards.push({ version: "simbolo-cor", index: symIdx, width: sr[2] - sr[0], height: sr[1] - sr[3] });
    }

    // 2. Square marks: avatar (social) and favicon, on a solid brand colour
    var markIdx = symIdx >= 0 ? symIdx : srcIdx;
    var bg = __aiPkgColor(doc, params.squareBackground || { hex: "#101418" });
    var onBg = params.squareArt === "mono-preto" ? black : (params.squareArt === "cor" ? null : white);
    var sq = [["avatar", 512, params.avatarFill || 0.7], ["favicon", 512, params.faviconFill || 0.86]];
    for (var q = 0; q < sq.length; q++) {
      var ab2 = __aiPkgNewArtboard(doc, sq[q][1], sq[q][1], sq[q][0], gap);
      __aiPkgRect(layer, ab2.rect, bg).name = sq[q][0] + " fundo";
      var g2 = __aiPkgCopyArt(doc, markIdx, layer);
      if (onBg) __aiPkgRecolor(g2, onBg, { paths: 0, texts: 0, images: 0, other: 0 });
      __aiPkgFit(g2, ab2.rect, sq[q][2]);
      g2.name = sq[q][0];
      out.artboards.push({ version: sq[q][0], index: ab2.index, width: sq[q][1], height: sq[q][1] });
    }

    // 3. Usage sheet (A4 landscape): versions on light/dark, clear space, minimum size, colours
    if (params.usageSheet !== false) {
      var SW = 842, SH = 595, M = 36;
      var sh = __aiPkgNewArtboard(doc, SW, SH, "folha-de-uso", gap);
      var R = sh.rect;
      var ink = __aiPkgColor(doc, { hex: "#1A1A1A", cmyk: [0, 0, 0, 90] });
      var grey = __aiPkgColor(doc, { hex: "#5A5F66", cmyk: [0, 0, 0, 65] });
      var light = __aiPkgColor(doc, { hex: "#F2F2F2", cmyk: [0, 0, 0, 5] });
      __aiPkgRect(layer, R, __aiPkgWhite(doc)).name = "folha fundo";
      var F = params.fonts || {};
      __aiPkgText(layer, R[0] + M, R[1] - M, params.title || "Marca \u2014 guia r\u00E1pido de uso", 20, ink, F.titulo);
      var panelW = (SW - 2 * M - 3 * 14) / 4, panelH = 170, py = R[1] - M - 44;
      var panels = [["Cor \u2014 fundos claros", light, null], ["Negativa \u2014 fundos escuros", bg, white], ["Mono \u2014 1 cor / carimbo", light, black], ["\u00C1rea de prote\u00E7\u00E3o", __aiPkgWhite(doc), null]];
      for (var p = 0; p < panels.length; p++) {
        var px = R[0] + M + p * (panelW + 14);
        var pr = [px, py, px + panelW, py - panelH];
        var pane = __aiPkgRect(layer, pr, panels[p][1]);
        if (p === 3) { pane.stroked = true; pane.strokeWidth = 0.5; pane.strokeColor = light; }
        var gp = __aiPkgCopyArt(doc, srcIdx, layer);
        if (panels[p][2]) __aiPkgRecolor(gp, panels[p][2], { paths: 0, texts: 0, images: 0, other: 0 });
        __aiPkgFit(gp, pr, p === 3 ? 0.55 : 0.7);
        if (p === 3) {
          var lb = gp.visibleBounds;
          var cs = (lb[1] - lb[3]) * (params.clearSpace || 0.25);
          var dash = layer.pathItems.rectangle(lb[1] + cs, lb[0] - cs, (lb[2] - lb[0]) + 2 * cs, (lb[1] - lb[3]) + 2 * cs);
          dash.filled = false;
          dash.stroked = true;
          dash.strokeWidth = 0.75;
          dash.strokeDashes = [4, 3];
          dash.strokeColor = __aiPkgColor(doc, params.accent || { hex: "#E63946" });
        }
        __aiPkgText(layer, px, py - panelH - 8, panels[p][0], 8, grey, F.corpo);
      }
      var ty = py - panelH - 40;
      var minTxt = "Tamanho m\u00EDnimo: " + (params.minWidthMm || 25) + " mm de largura no impresso \u00B7 " + (params.minWidthPx || 120) + " px na tela.";
      var csTxt = "\u00C1rea de prote\u00E7\u00E3o: " + Math.round((params.clearSpace || 0.25) * 100) + " % da altura do logo em volta, sem texto ou imagem.";
      __aiPkgText(layer, R[0] + M, ty, minTxt, 9, ink, F.corpo);
      __aiPkgText(layer, R[0] + M, ty - 14, csTxt, 9, ink, F.corpo);
      __aiPkgText(layer, R[0] + M, ty - 28, "N\u00E3o: esticar, girar, trocar as cores, aplicar sombra ou contorno, usar sobre foto polu\u00EDda.", 9, ink, F.corpo);
      var cols = params.colors || [];
      var cy = ty - 70, cx = R[0] + M, chip = 46;
      for (var ci = 0; ci < cols.length && ci < 8; ci++) {
        var x0 = cx + ci * (chip + 52);
        var ch = __aiPkgRect(layer, [x0, cy, x0 + chip, cy - chip], __aiPkgColor(doc, cols[ci]));
        ch.stroked = true; ch.strokeWidth = 0.25; ch.strokeColor = light;
        var lab = (cols[ci].name || "") + "\r" + cols[ci].hex + (cols[ci].cmyk ? "\rCMYK " + cols[ci].cmyk.join(" ") : "");
        __aiPkgText(layer, x0, cy - chip - 6, lab, 6.5, grey, F.corpo);
      }
      out.artboards.push({ version: "folha-de-uso", index: sh.index, width: SW, height: SH });
    }
    doc.save();
    return out;
  } finally {
    app.userInteractionLevel = prevUil;
  }
}

function __mcpDispatch(action, params, _options) {
  if (action === "adobe.ping") {
    return { pong: true, app: "illustrator", version: String(app.version), documents: app.documents.length };
  }
  if (action === "adobe.checkpoint") {
    if (app.documents.length === 0) throw new Error("No open Illustrator document to checkpoint.");
    var cpA = app.activeDocument;
    var cpAOrig = null;
    try {
      if (cpA.path && String(cpA.path) !== "" && cpA.fullName.exists) cpAOrig = cpA.fullName;
    } catch (_eCpAi) {
      cpAOrig = null;
    }
    var cpADest = __mcpCheckpointFile(cpA.name, "ai", params.label, params.folder, cpAOrig);
    if (cpAOrig && /\.ai$/i.test(cpAOrig.name)) {
      var cpADirty = !cpA.saved;
      if (cpADirty) cpA.save();
      __mcpCopyFile(cpAOrig, cpADest);
      return {
        app: "illustrator",
        document: cpA.name,
        checkpointPath: cpADest.fsName,
        method: cpADirty ? "saved the document, then copied the .ai" : "copied the saved .ai",
        savedOriginal: cpADirty,
        documentPathChanged: false
      };
    }
    // Illustrator has no "save a copy": a document without a native .ai file is saved as the checkpoint.
    cpA.saveAs(cpADest, new IllustratorSaveOptions());
    return {
      app: "illustrator",
      document: cpA.name,
      checkpointPath: cpADest.fsName,
      method: "saved as .ai (the document had no .ai file)",
      savedOriginal: false,
      documentPathChanged: true,
      note: "The open document now points to the checkpoint file; later saves go there."
    };
  }
  params = params || {};

  if (action === "ai.layout.info") {
    // Item tree per layer for ai_organize (bounds already in artboard px, top-left origin, y down).
    var docLI = __aiRequireDoc();
    var abLI = typeof params.artboardIndex === "number" ? params.artboardIndex : docLI.artboards.getActiveArtboardIndex();
    var rectLI = docLI.artboards[abLI].artboardRect;
    var kindLI = function (it) {
      var t = String(it.typename);
      if (t === "TextFrame") return "text";
      if (t === "GroupItem") return "group";
      if (t === "PathItem" || t === "CompoundPathItem") return "shape";
      if (t === "PlacedItem" || t === "RasterItem") return "pixel";
      if (t === "SymbolItem") return "smart";
      return "other";
    };
    var nodeLI = function (it, depth) {
      var gb = it.geometricBounds;
      var n = {
        id: __aiUuid(it),
        name: String(it.name || ""),
        kind: kindLI(it),
        bounds: [gb[0] - rectLI[0], rectLI[1] - gb[1], gb[2] - rectLI[0], rectLI[1] - gb[3]],
        visible: !it.hidden
      };
      if (n.kind === "text") {
        try { n.text = String(it.contents).slice(0, 80); } catch (_eTx) {}
      }
      if (n.kind === "group" && depth < 6 && !it.clipped) {
        n.children = [];
        for (var c = 0; c < it.pageItems.length; c++) n.children.push(nodeLI(it.pageItems[c], depth + 1));
      }
      return n;
    };
    var layersLI = [];
    for (var lyI = 0; lyI < docLI.layers.length; lyI++) {
      var lyr = docLI.layers[lyI];
      var kids = [];
      for (var pi = 0; pi < lyr.pageItems.length; pi++) kids.push(nodeLI(lyr.pageItems[pi], 0));
      layersLI.push({ id: "layer:" + lyI, name: String(lyr.name), kind: "group", bounds: null, visible: lyr.visible, children: kids });
    }
    return { documentName: docLI.name, width: rectLI[2] - rectLI[0], height: rectLI[1] - rectLI[3], layers: layersLI };
  }

  if (action === "ai.layout.groupPlan") {
    // Groups by uuid, children first. The group takes the place of its topmost member, so the stacking stays.
    var docGP = __aiRequireDoc();
    var madeGP = [];
    var failedGP = [];
    var byUuid = function (u) {
      try { return docGP.getPageItemFromUuid(String(u)); } catch (_eGu) { return null; }
    };
    var zOf = function (it) {
      // position among siblings, 0 = top
      var par = it.parent;
      for (var z = 0; z < par.pageItems.length; z++) if (par.pageItems[z] === it) return z;
      return 0;
    };
    var buildGP = function (g) {
      var items = [];
      var m;
      for (m = 0; m < (g.members || []).length; m++) {
        var it = byUuid(g.members[m]);
        if (it) items.push(it);
      }
      for (m = 0; m < (g.children || []).length; m++) {
        var sub = buildGP(g.children[m]);
        if (sub) items.push(sub);
      }
      if (items.length < 2) return items.length === 1 ? items[0] : null;
      try {
        items.sort(function (a, b) { return zOf(a) - zOf(b); });
        var grp = items[0].parent.groupItems.add();
        grp.move(items[0], ElementPlacement.PLACEBEFORE);
        for (var k = 0; k < items.length; k++) items[k].move(grp, ElementPlacement.PLACEATEND);
        grp.name = String(g.name);
        madeGP.push({ name: grp.name, uuid: __aiUuid(grp), items: items.length });
        return grp;
      } catch (eGP) {
        failedGP.push({ name: g.name, error: String(eGP) });
        return null;
      }
    };
    for (var gi = 0; gi < (params.groups || []).length; gi++) buildGP(params.groups[gi]);
    return { documentName: docGP.name, created: madeGP, failed: failedGP };
  }

  if (action === "ai.batch") {
    return __mcpBatch(params, "ai");
  }

  if (action === "ai.doc.getInfo") {
    if (!app.documents || app.documents.length === 0) {
      return { hasOpenDocument: false, openDocumentCount: 0 };
    }
    var doc = app.activeDocument;
    var artboards = [];
    for (var a = 0; a < doc.artboards.length; a++) {
      var ab = doc.artboards[a];
      artboards.push({
        index: a,
        name: ab.name,
        artboardRect: ab.artboardRect
      });
    }
    var layers = [];
    for (var l = 0; l < doc.layers.length; l++) {
      var lyr = doc.layers[l];
      layers.push({
        index: l,
        name: lyr.name,
        visible: lyr.visible,
        locked: lyr.locked,
        pageItemsCount: lyr.pageItems ? lyr.pageItems.length : 0
      });
    }
    return {
      hasOpenDocument: true,
      openDocumentCount: app.documents.length,
      name: doc.name,
      width: doc.width,
      height: doc.height,
      colorSpace: String(doc.documentColorSpace),
      activeArtboardIndex: doc.artboards.getActiveArtboardIndex(),
      artboards: artboards,
      layers: layers,
      pageItemsCount: doc.pageItems ? doc.pageItems.length : 0
    };
  }

  if (action === "ai.doc.manage") {
    var op = params.operation || "create";
    if (op === "create") {
      var cs = (params.colorSpace === "CMYK") ? DocumentColorSpace.CMYK : DocumentColorSpace.RGB;
      var w = params.width || 1920;
      var h = params.height || 1080;
      var numAb = params.numArtboards || 1;
      var newDoc = null;
      if (params.title) {
        // Document.name is read-only; the title of a new document comes from a DocumentPreset.
        try {
          var pre = new DocumentPreset();
          pre.title = String(params.title);
          pre.width = w;
          pre.height = h;
          pre.colorMode = cs;
          pre.numArtboards = numAb;
          pre.units = RulerUnits.Points;
          newDoc = app.documents.addDocument(cs === DocumentColorSpace.CMYK ? "Print" : "Web", pre, false);
        } catch (_ePreset) {
          newDoc = null;
        }
      }
      if (!newDoc) newDoc = app.documents.add(cs, w, h, numAb);
      return {
        operation: "create",
        name: newDoc.name,
        width: newDoc.width,
        height: newDoc.height,
        artboardRect: newDoc.artboards[0].artboardRect,
        coordinateNote: "artboardRect is [left, top, right, bottom] with Y growing upward. A point 'd' px below the artboard top is y = top - d."
      };
    }
    if (op === "open") {
      var fOpen = new File(params.filePath);
      if (!fOpen.exists) throw new Error("File not found: " + params.filePath);
      var opened = app.open(fOpen);
      return { operation: "open", name: opened.name, filePath: fOpen.fsName };
    }
    if (op === "save") {
      var docSave = __aiRequireDoc();
      // Never let Illustrator open its Save As dialog: it blocks the app until someone clicks it.
      var prevUil = app.userInteractionLevel;
      app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
      try {
        if (params.filePath) {
          var saveTarget = __mcpPrepareOutputFile(params.filePath);
          docSave.saveAs(saveTarget, new IllustratorSaveOptions());
          __mcpVerifySaved(saveTarget, docSave.fullName ? docSave.fullName.fsName : null);
          return { operation: "save", name: docSave.name, filePath: saveTarget.fsName, saved: true };
        }
        var everSaved = false;
        try {
          everSaved = !!(docSave.fullName && docSave.fullName.exists);
        } catch (_eFull) {}
        if (!everSaved) {
          __mcpFail("INVALID_PARAMS", "This document was never saved: pass filePath so Illustrator does not open its Save As dialog.");
        }
        docSave.save();
        return { operation: "save", name: docSave.name, filePath: docSave.fullName.fsName, saved: true };
      } finally {
        app.userInteractionLevel = prevUil;
      }
    }
    if (op === "close") {
      var docClose = __aiRequireDoc();
      var closedName = docClose.name;
      docClose.close(params.saveChanges ? SaveOptions.SAVECHANGES : SaveOptions.DONOTSAVECHANGES);
      return { operation: "close", closedName: closedName };
    }
    throw new Error("Unsupported ai.doc.manage operation: " + op);
  }

  if (action === "ai.artboard.manage") {
    var docAb = __aiRequireDoc();
    var abOp = params.operation || "add";
    if (abOp === "add") {
      var rect = params.rect || [0, 1080, 1920, 0];
      var addedAb = docAb.artboards.add(rect);
      if (params.name) addedAb.name = params.name;
      return { operation: "add", name: addedAb.name, count: docAb.artboards.length };
    }
    if (abOp === "setActive") {
      docAb.artboards.setActiveArtboardIndex(params.index || 0);
      return { operation: "setActive", activeIndex: docAb.artboards.getActiveArtboardIndex() };
    }
    if (abOp === "remove") {
      docAb.artboards[params.index || 0].remove();
      return { operation: "remove", count: docAb.artboards.length };
    }
    throw new Error("Unsupported ai.artboard.manage operation: " + abOp);
  }

  if (action === "ai.layer.manage") {
    var docL = __aiRequireDoc();
    var lOp = params.operation || "add";
    if (lOp === "add") {
      var newL = docL.layers.add();
      if (params.name) newL.name = params.name;
      return { operation: "add", name: newL.name, count: docL.layers.length };
    }
    var targetL = params.layerName ? docL.layers.getByName(params.layerName) : docL.layers[params.layerIndex || 0];
    if (lOp === "update") {
      if (params.newName) targetL.name = params.newName;
      if (typeof params.visible === "boolean") targetL.visible = params.visible;
      if (typeof params.locked === "boolean") targetL.locked = params.locked;
      return { operation: "update", name: targetL.name, visible: targetL.visible, locked: targetL.locked };
    }
    if (lOp === "delete") {
      var delName = targetL.name;
      targetL.remove();
      return { operation: "delete", deletedName: delName };
    }
    throw new Error("Unsupported ai.layer.manage operation: " + lOp);
  }

  if (action === "ai.vector.createShape") {
    var docS = __aiRequireDoc();
    var pItems = docS.activeLayer.pathItems;
    var st = params.shapeType || "rectangle";
    var top = typeof params.top === "number" ? params.top : 600;
    var left = typeof params.left === "number" ? params.left : 100;
    var width = params.width || 200;
    var height = params.height || 200;
    var shape = null;

    if (st === "rectangle") {
      shape = params.cornerRadius
        ? pItems.roundedRectangle(top, left, width, height, params.cornerRadius, params.cornerRadius)
        : pItems.rectangle(top, left, width, height);
    } else if (st === "ellipse") {
      shape = pItems.ellipse(top, left, width, height);
    } else if (st === "polygon") {
      shape = pItems.polygon(left + width / 2, top - height / 2, params.radius || (width / 2), params.sides || 6);
    } else if (st === "star") {
      shape = pItems.star(
        left + width / 2,
        top - height / 2,
        params.outerRadius || (width / 2),
        params.innerRadius || (width / 4),
        params.points || 5
      );
    } else {
      throw new Error("Unsupported shapeType: " + st);
    }

    if (params.name) shape.name = params.name;
    if (params.fillColor) {
      shape.filled = true;
      shape.fillColor = __aiMakeRgbColor(params.fillColor);
    } else if (params.filled === false) {
      shape.filled = false;
    }

    if (params.strokeColor || params.strokeWidth) {
      shape.stroked = true;
      if (params.strokeColor) shape.strokeColor = __aiMakeRgbColor(params.strokeColor);
      if (typeof params.strokeWidth === "number") shape.strokeWidth = params.strokeWidth;
    } else if (params.stroked === false) {
      shape.stroked = false;
    }

    if (typeof params.opacity === "number") shape.opacity = params.opacity;

    return {
      name: shape.name,
      shapeType: st,
      geometricBounds: shape.geometricBounds
    };
  }

  if (action === "ai.vector.createBezierPath") {
    var docB = __aiRequireDoc();
    var pathItem = docB.activeLayer.pathItems.add();
    if (params.name) pathItem.name = params.name;
    var pts = params.points || [];
    for (var p = 0; p < pts.length; p++) {
      var ptSpec = pts[p];
      var pp = pathItem.pathPoints.add();
      pp.anchor = ptSpec.anchor;
      pp.leftDirection = ptSpec.leftDirection || ptSpec.anchor;
      pp.rightDirection = ptSpec.rightDirection || ptSpec.anchor;
      pp.pointType = (ptSpec.pointType === "smooth") ? PointType.SMOOTH : PointType.CORNER;
    }
    pathItem.closed = params.closed !== false;

    if (params.fillColor) {
      pathItem.filled = true;
      pathItem.fillColor = __aiMakeRgbColor(params.fillColor);
    } else {
      pathItem.filled = false;
    }

    if (params.strokeColor || params.strokeWidth) {
      pathItem.stroked = true;
      if (params.strokeColor) pathItem.strokeColor = __aiMakeRgbColor(params.strokeColor);
      if (typeof params.strokeWidth === "number") pathItem.strokeWidth = params.strokeWidth;
    }

    return {
      name: pathItem.name,
      numPoints: pathItem.pathPoints.length,
      closed: pathItem.closed,
      geometricBounds: pathItem.geometricBounds
    };
  }

  if (action === "ai.text.create") {
    var docT = __aiRequireDoc();
    var tf = docT.activeLayer.textFrames.add();
    tf.contents = params.contents || "Text";
    tf.position = params.position || [100, 500];
    if (params.name) tf.name = params.name;

    var attr = tf.textRange.characterAttributes;
    if (params.fontSize) attr.size = params.fontSize;
    if (params.fillColor) attr.fillColor = __aiMakeRgbColor(params.fillColor);
    if (params.fontName && app.textFonts) {
      try {
        attr.textFont = app.textFonts.getByName(params.fontName);
      } catch (_eFont) {}
    }

    if (params.createOutlines === true) {
      var outlined = tf.createOutline();
      return { outlined: true, geometricBounds: outlined.geometricBounds };
    }

    return {
      name: tf.name,
      contents: tf.contents,
      geometricBounds: tf.geometricBounds
    };
  }

  if (action === "ai.text.onPath") {
    // Text on a circular arc (seal, badge, stamp): top text runs over the top of the circle, outside it;
    // bottom text runs under it, upright, on a slightly larger radius so both sit in the same ring.
    var docP = __aiRequireDoc();
    var abR = docP.artboards[docP.artboards.getActiveArtboardIndex()].artboardRect;
    var cxP = params.center ? params.center[0] : (abR[0] + abR[2]) / 2;
    var cyP = params.center ? params.center[1] : (abR[1] + abR[3]) / 2;
    var rP = params.radius || Math.min(abR[2] - abR[0], abR[1] - abR[3]) * 0.35;
    var sizeP = params.fontSize || Math.max(8, rP * 0.18);
    var made = [];
    var arc = function (r, a0, a1, name) {
      var path = docP.activeLayer.pathItems.add();
      path.name = name;
      var steps = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 90));
      var d = (a1 - a0) / steps;
      var k = (4 / 3) * Math.tan((Math.abs(d) * Math.PI / 180) / 4) * r;
      var sgn = d > 0 ? 1 : -1;
      for (var i = 0; i <= steps; i++) {
        var t = (a0 + d * i) * Math.PI / 180;
        var ax = cxP + r * Math.cos(t), ay = cyP + r * Math.sin(t);
        var tx = -Math.sin(t) * sgn, ty = Math.cos(t) * sgn;
        var pp = path.pathPoints.add();
        pp.anchor = [ax, ay];
        pp.leftDirection = [ax - k * tx, ay - k * ty];
        pp.rightDirection = [ax + k * tx, ay + k * ty];
        pp.pointType = PointType.SMOOTH;
      }
      path.closed = false;
      path.stroked = false;
      path.filled = false;
      return path;
    };
    var style = function (tf) {
      var at = tf.textRange.characterAttributes;
      at.size = sizeP;
      if (params.fillColor) at.fillColor = __aiMakeRgbColor(params.fillColor);
      if (typeof params.tracking === "number") at.tracking = params.tracking;
      if (params.fontName) {
        try {
          at.textFont = app.textFonts.getByName(params.fontName);
        } catch (_eF) {}
      }
      tf.textRange.paragraphAttributes.justification = Justification.CENTER;
    };
    var span = typeof params.arcDegrees === "number" ? params.arcDegrees : 160;
    if (params.text) {
      var top = docP.textFrames.pathText(arc(rP, 90 + span / 2, 90 - span / 2, (params.name || "Selo") + " arco topo"));
      top.contents = params.text;
      top.name = (params.name || "Selo") + " texto topo";
      style(top);
      made.push(top);
    }
    if (params.bottomText) {
      var rb = rP + sizeP * 0.72;
      var bottom = docP.textFrames.pathText(arc(rb, 270 - span / 2, 270 + span / 2, (params.name || "Selo") + " arco base"));
      bottom.contents = params.bottomText;
      bottom.name = (params.name || "Selo") + " texto base";
      style(bottom);
      made.push(bottom);
    }
    if (!made.length) __mcpFail("INVALID_PARAMS", "Pass text and/or bottomText.");
    var out = [];
    for (var m = 0; m < made.length; m++) {
      var item = made[m];
      if (params.createOutlines === true) item = item.createOutline();
      out.push({ name: String(item.name), bounds: item.geometricBounds });
    }
    return { center: [cxP, cyP], radius: rP, fontSize: sizeP, items: out, note: "Text stays editable on its path (unless createOutlines). Check with ai_get_artboard_preview." };
  }

  if (action === "ai.export.artboardPreview") {
    var docPrev = __aiRequireDoc();
    var outFilePath = params.outputPath || (Folder.temp.fsName + "/ai_preview_" + new Date().getTime() + ".png");
    var outF = __mcpPrepareOutputFile(outFilePath);
    var opts = new ExportOptionsPNG24();
    opts.artBoardClipping = true;
    opts.transparency = params.transparency !== false;
    if (typeof params.scale === "number") {
      opts.horizontalScale = params.scale;
      opts.verticalScale = params.scale;
    }
    // B36 (18/11/2026): the PNG export clips to the ACTIVE artboard, so artboardIndex activates it first
    // and the previous one is restored afterwards.
    var prevAbIdx = docPrev.artboards.getActiveArtboardIndex();
    var wantAbIdx = prevAbIdx;
    if (typeof params.artboardIndex === "number") {
      if (params.artboardIndex < 0 || params.artboardIndex >= docPrev.artboards.length) {
        __mcpFail("INVALID_PARAMS", "artboardIndex " + params.artboardIndex + " is out of range (0.." + (docPrev.artboards.length - 1) + ").");
      }
      wantAbIdx = params.artboardIndex;
      docPrev.artboards.setActiveArtboardIndex(wantAbIdx);
    }
    try {
      docPrev.exportFile(outF, ExportType.PNG24, opts);
    } finally {
      if (wantAbIdx !== prevAbIdx) {
        try {
          docPrev.artboards.setActiveArtboardIndex(prevAbIdx);
        } catch (_eAbBack) {}
      }
    }
    var b64 = __aiEncodeFileToBase64(outF);
    return {
      documentName: docPrev.name,
      artboardIndex: wantAbIdx,
      artboardName: String(docPrev.artboards[wantAbIdx].name),
      outputPath: outF.fsName,
      previewBase64: b64,
      previewMimeType: "image/png"
    };
  }

  // 18/11/2026: text centred in a shape by the CAP HEIGHT (rule of the user). An "H" in the same style is
  // outlined on a temporary copy to read the cap top and the baseline; the whole text is outlined on another
  // copy to read the real ink width. Both copies are removed; the live text only moves.
  if (action === "ai.text.centerInShape") {
    var docCs = __aiRequireDoc();
    function byNameCs(nm, kind) {
      for (var q = 0; q < docCs.pageItems.length; q++) {
        var it = docCs.pageItems[q];
        if (it.name === nm && (!kind || it.typename === kind)) return it;
      }
      return null;
    }
    var tfCs = params.textUuid ? docCs.getPageItemFromUuid(params.textUuid) : byNameCs(params.textName, "TextFrame");
    var shCs = params.shapeUuid ? docCs.getPageItemFromUuid(params.shapeUuid) : byNameCs(params.shapeName, null);
    if (!tfCs || tfCs.typename !== "TextFrame") __mcpFail("NOT_FOUND", "Text frame not found (textName / textUuid).");
    if (!shCs) __mcpFail("NOT_FOUND", "Shape not found (shapeName / shapeUuid).");
    var sgb = shCs.geometricBounds; // [left, top, right, bottom], y grows upwards
    var shCxA = (sgb[0] + sgb[2]) / 2, shCyA = (sgb[1] + sgb[3]) / 2;
    function outlineBounds(frame, contents) {
      var cp = frame.duplicate();
      var grp = null;
      try {
        if (contents !== null) cp.contents = contents;
        grp = cp.createOutline();
        var gb = grp.geometricBounds;
        return [gb[0], gb[1], gb[2], gb[3]];
      } finally {
        try {
          if (grp) grp.remove();
          else cp.remove();
        } catch (_eOb) {}
      }
    }
    var inkCs = outlineBounds(tfCs, null);
    var topCs = inkCs[1], botCs = inkCs[3], methodCs = "ink";
    if ((params.mode || "capHeight") === "capHeight") {
      try {
        var hB = outlineBounds(tfCs, "H");
        var nLines = 1;
        try {
          nLines = Math.max(1, tfCs.lines.length);
        } catch (_eLn) {}
        var ca = tfCs.textRange.characterAttributes;
        var leadCs = ca.autoLeading ? ca.size * 1.2 : ca.leading;
        topCs = hB[1];
        botCs = hB[3] - (nLines - 1) * leadCs;
        methodCs = "capHeight";
      } catch (_eCap) {
        methodCs = "ink";
      }
    }
    var dxCs = params.horizontal === false ? 0 : shCxA - (inkCs[0] + inkCs[2]) / 2;
    var dyCs = params.vertical === false ? 0 : shCyA - (topCs + botCs) / 2;
    dxCs += typeof params.offsetX === "number" ? params.offsetX : 0;
    dyCs -= typeof params.offsetY === "number" ? params.offsetY : 0; // offsetY is given downwards, as on screen
    tfCs.translate(dxCs, dyCs);
    return {
      document: docCs.name,
      method: methodCs,
      moved: [Math.round(dxCs * 100) / 100, Math.round(-dyCs * 100) / 100],
      spaceAbove: Math.round((sgb[1] - (topCs + dyCs)) * 100) / 100,
      spaceBelow: Math.round(((botCs + dyCs) - sgb[3]) * 100) / 100,
      spaceLeft: Math.round((inkCs[0] + dxCs - sgb[0]) * 100) / 100,
      spaceRight: Math.round((sgb[2] - (inkCs[2] + dxCs)) * 100) / 100
    };
  }

  // 18/11/2026 — File > Export > Export for Screens: every artboard (or a range) in one call, one file per
  // artboard named after it. Illustrator writes into sub-folders by format/scale, so it renders into a
  // temp folder and the files are copied to outputFolder.
  if (action === "ai.export.screens") {
    var docSc = __aiRequireDoc();
    if (typeof docSc.exportForScreens !== "function") __mcpFail("UNSUPPORTED", "This Illustrator version has no Export for Screens scripting.");
    var outSc = new Folder(params.outputFolder);
    __mcpEnsureFolder(outSc);
    var fmtSc = String(params.format || "png").toLowerCase();
    var typeSc, optSc, extSc;
    if (fmtSc === "jpg" || fmtSc === "jpeg") {
      typeSc = ExportForScreensType.SE_JPEG100;
      optSc = new ExportForScreensOptionsJPEG();
      extSc = /\.jpe?g$/i;
    } else if (fmtSc === "svg") {
      typeSc = ExportForScreensType.SE_SVG;
      optSc = new ExportForScreensOptionsWebOptimizedSVG();
      extSc = /\.svg$/i;
    } else if (fmtSc === "pdf") {
      typeSc = ExportForScreensType.SE_PDF;
      optSc = new ExportForScreensPDFOptions();
      extSc = /\.pdf$/i;
    } else {
      typeSc = ExportForScreensType.SE_PNG24;
      optSc = new ExportForScreensOptionsPNG24();
      try {
        optSc.transparency = params.transparency !== false;
      } catch (_eTr) {}
      extSc = /\.png$/i;
    }
    if (fmtSc === "png" || fmtSc === "jpg" || fmtSc === "jpeg") {
      try {
        optSc.scaleType = ExportForScreensScaleType.SCALEBYFACTOR;
        optSc.scaleTypeValue = (params.scale || 100) / 100;
      } catch (_eScale) {}
    }
    var itemSc = new ExportForScreensItemToExport();
    itemSc.document = false;
    itemSc.artboards = params.artboards ? String(params.artboards) : "1-" + docSc.artboards.length;
    var stageSc = new Folder(Folder.temp.fsName + "/mcp_ai_screens_" + new Date().getTime());
    __mcpEnsureFolder(stageSc);
    docSc.exportForScreens(stageSc, typeSc, optSc, itemSc, "");
    var madeSc = __aiFindAllFiles(stageSc, extSc);
    var filesSc = [];
    for (var fi = 0; fi < madeSc.length; fi++) {
      var nmSc = decodeURI(madeSc[fi].name);
      if (params.prefix) nmSc = String(params.prefix) + nmSc;
      var destSc = new File(outSc.fsName + "/" + nmSc);
      if (destSc.exists) destSc.remove();
      __mcpCopyFile(madeSc[fi], destSc);
      madeSc[fi].remove();
      filesSc.push({ path: destSc.fsName, bytes: destSc.length });
    }
    return { document: docSc.name, method: "exportForScreens", format: fmtSc, artboards: itemSc.artboards, count: filesSc.length, files: filesSc };
  }

  if (action === "ai.export.file") {
    var docEx = __aiRequireDoc();
    var targetFile = __mcpPrepareOutputFile(params.filePath);
    var fmt = (params.format || "svg").toLowerCase();
    if (fmt === "svg") {
      // exportFile(ExportType.SVG) re-targets the open document to the .svg (Illustrator 2027 treats it as
      // Save As) and left Illustrator unresponsive for minutes after writing the file (13/11/2026).
      // exportForScreens writes a copy and leaves the document alone; it puts the file in an "SVG"
      // subfolder named after the artboard, so render into a temp folder and move it.
      var svgOk = false;
      if (typeof docEx.exportForScreens === "function" && typeof ExportForScreensOptionsWebOptimizedSVG !== "undefined") {
        var stage = new Folder(Folder.temp.fsName + "/mcp_ai_svg_" + new Date().getTime());
        __mcpEnsureFolder(stage);
        var efsOpts = new ExportForScreensOptionsWebOptimizedSVG();
        efsOpts.coordinatePrecision = 3;
        try {
          efsOpts.fontType = SVGFontType.OUTLINEFONT;
        } catch (_eFont) {}
        var efsItem = new ExportForScreensItemToExport();
        efsItem.document = false;
        var abIndex = typeof params.artboardIndex === "number" ? params.artboardIndex : docEx.artboards.getActiveArtboardIndex();
        efsItem.artboards = String(abIndex + 1);
        docEx.exportForScreens(stage, ExportForScreensType.SE_SVG, efsOpts, efsItem, "mcp_");
        var produced = __aiFindFirstFile(stage, /\.svg$/i);
        if (produced) {
          if (targetFile.exists) targetFile.remove();
          __mcpCopyFile(produced, targetFile);
          produced.remove();
          svgOk = true;
        }
      }
      if (!svgOk) {
        var svgOpts = new ExportOptionsSVG();
        var keepPath = null;
        try {
          keepPath = docEx.fullName && docEx.fullName.exists ? docEx.fullName : null;
        } catch (_eKeep) {}
        docEx.exportFile(targetFile, ExportType.SVG, svgOpts);
        __aiRestoreDocPath(docEx, keepPath);
      }
    } else if (fmt === "png" || fmt === "jpg" || fmt === "jpeg") {
      // Raster exports render the ACTIVE artboard: switch to the one asked for, then switch back.
      var prevAb = docEx.artboards.getActiveArtboardIndex();
      if (typeof params.artboardIndex === "number") {
        if (params.artboardIndex < 0 || params.artboardIndex >= docEx.artboards.length) {
          __mcpFail("INVALID_PARAMS", "artboardIndex " + params.artboardIndex + " is out of range (0-" + (docEx.artboards.length - 1) + ").");
        }
        docEx.artboards.setActiveArtboardIndex(params.artboardIndex);
      }
      try {
        var rasterScale = typeof params.scale === "number" ? params.scale : 100;
        if (fmt === "png") {
          var pngOpts = new ExportOptionsPNG24();
          pngOpts.artBoardClipping = true;
          pngOpts.antiAliasing = true;
          pngOpts.transparency = params.transparency !== false;
          pngOpts.horizontalScale = rasterScale;
          pngOpts.verticalScale = rasterScale;
          docEx.exportFile(targetFile, ExportType.PNG24, pngOpts);
        } else {
          var jpgOpts = new ExportOptionsJPEG();
          jpgOpts.artBoardClipping = true;
          jpgOpts.antiAliasing = true;
          jpgOpts.qualitySetting = 90;
          jpgOpts.horizontalScale = rasterScale;
          jpgOpts.verticalScale = rasterScale;
          docEx.exportFile(targetFile, ExportType.JPEG, jpgOpts);
        }
      } finally {
        try { docEx.artboards.setActiveArtboardIndex(prevAb); } catch (_eAb) {}
      }
    } else {
      throw new Error("Unsupported export format: " + fmt);
    }
    if (!new File(targetFile.fsName).exists) {
      __mcpFail("SAVE_FAILED", "Illustrator reported no error but " + targetFile.fsName + " does not exist.");
    }
    return { exported: true, format: fmt, filePath: targetFile.fsName };
  }


  if (action === "ai.variants") {
    // One template document → one exported artboard per record. Page items are found by name (= record columns):
    // text frames get the text, placed images are relinked to the file in the cell, 'hide'/'show' toggles an item,
    // a '#RRGGBB' cell recolours a path. Everything goes back to how it was at the end.
    var docV = __aiRequireDoc();
    var recsV = params.records || [];
    if (!recsV.length) __mcpFail("INVALID_PARAMS", "No records.");
    var outV = new Folder(params.outputFolder);
    if (!outV.exists) __mcpEnsureFolder(outV);
    var fmtV = String(params.format || "png").toLowerCase();
    var byName = {};
    var frames = {};
    var columns = [];
    for (var ck in recsV[0]) if (recsV[0].hasOwnProperty(ck) && ck !== "__file") columns.push(ck);
    var all = docV.pageItems;
    for (var ai = 0; ai < all.length; ai++) {
      var nm = String(all[ai].name || "");
      if (!nm) continue;
      for (var cc = 0; cc < columns.length; cc++) {
        if (columns[cc] === nm) {
          if (!byName[nm]) {
            byName[nm] = [];
            frames[nm] = [];
          }
          byName[nm].push(all[ai]);
          frames[nm].push(all[ai].geometricBounds);
        }
      }
    }
    var orphans = [];
    for (var oc = 0; oc < columns.length; oc++) if (!byName[columns[oc]]) orphans.push(columns[oc]);
    var saved = [];
    for (var sk in byName) {
      if (!byName.hasOwnProperty(sk)) continue;
      for (var si = 0; si < byName[sk].length; si++) {
        var it0 = byName[sk][si];
        var st0 = { item: it0, hidden: it0.hidden };
        if (it0.typename === "TextFrame") st0.contents = it0.contents;
        if (it0.typename === "PlacedItem") {
          try {
            st0.file = it0.file;
          } catch (_eF) {}
          st0.bounds = it0.geometricBounds;
        }
        if (it0.typename === "PathItem") st0.fill = it0.fillColor;
        saved.push(st0);
      }
    }
    var files = [];
    var warnings = [];
    try {
      for (var r = 0; r < recsV.length; r++) {
        var rec = recsV[r];
        for (var c2 = 0; c2 < columns.length; c2++) {
          var col = columns[c2];
          var items = byName[col];
          if (!items) continue;
          var val = String(rec[col] === undefined || rec[col] === null ? "" : rec[col]);
          for (var ii = 0; ii < items.length; ii++) {
            var it = items[ii];
            if (val === "hide" || val === "show") {
              it.hidden = val === "hide";
              continue;
            }
            if (it.typename === "TextFrame") {
              it.contents = val.replace(/\\n|\n/g, "\r");
            } else if (it.typename === "PlacedItem") {
              if (!val) continue;
              var f = new File(val);
              if (!f.exists) {
                warnings.push("Row " + (r + 1) + ": file not found for '" + col + "': " + val);
                continue;
              }
              // Always fit into the template's original frame (not the previous record's image).
              var gb = frames[col][ii];
              it.file = f;
              // Relinking can change the size: fit the new image into the original frame, keeping proportions.
              var nb = it.geometricBounds;
              var ow = gb[2] - gb[0], oh = gb[1] - gb[3];
              var nw = nb[2] - nb[0], nh = nb[1] - nb[3];
              if (nw > 0 && nh > 0 && (Math.abs(nw - ow) > 0.5 || Math.abs(nh - oh) > 0.5)) {
                var k = Math.min(ow / nw, oh / nh) * 100;
                it.resize(k, k);
                nb = it.geometricBounds;
                it.translate(gb[0] + (ow - (nb[2] - nb[0])) / 2 - nb[0], gb[1] - (oh - (nb[1] - nb[3])) / 2 - nb[1]);
              }
            } else if (it.typename === "PathItem" && /^#?[0-9a-f]{6}$/i.test(val)) {
              it.fillColor = __aiMakeRgbColor(val.charAt(0) === "#" ? val : "#" + val);
            } else if (val) {
              warnings.push("Row " + (r + 1) + ": '" + col + "' is a " + it.typename + "; only text frames, placed images, paths (#RRGGBB) and hide/show are filled.");
            }
          }
        }
        app.redraw();
        var base = String(rec.__file || ("variant_" + (r < 9 ? "0" : "") + (r + 1))).replace(/[\\\/:*?"<>|]+/g, "_");
        var res = __mcpDispatch("ai.export.file", {
          filePath: outV.fsName + "/" + base + "." + (fmtV === "jpeg" ? "jpg" : fmtV),
          format: fmtV,
          artboardIndex: params.artboardIndex,
          scale: params.scale,
          transparency: params.transparency
        });
        files.push(res.filePath);
      }
    } finally {
      for (var rs = 0; rs < saved.length; rs++) {
        var sv = saved[rs];
        try {
          sv.item.hidden = sv.hidden;
          if (typeof sv.contents === "string") sv.item.contents = sv.contents;
          if (sv.file) {
            sv.item.file = sv.file;
            var cb = sv.item.geometricBounds;
            if (sv.bounds && (Math.abs(cb[2] - cb[0] - (sv.bounds[2] - sv.bounds[0])) > 0.5)) {
              sv.item.resize(((sv.bounds[2] - sv.bounds[0]) / (cb[2] - cb[0])) * 100, ((sv.bounds[1] - sv.bounds[3]) / (cb[1] - cb[3])) * 100);
            }
            cb = sv.item.geometricBounds;
            if (sv.bounds) sv.item.translate(sv.bounds[0] - cb[0], sv.bounds[1] - cb[1]);
          }
          if (sv.fill) sv.item.fillColor = sv.fill;
        } catch (_eRs) {}
      }
    }
    return { exported: files.length, files: files, format: fmtV, columnsWithoutItem: orphans, warnings: warnings.slice(0, 20) };
  }

  if (action === "ai.item.find") {
    var docF = __aiRequireDoc();
    var rectF = __aiArtboardRect(docF, params.artboardIndex);
    var found = [];
    var limitF = params.limit || 200;
    var wantType = params.typename ? String(params.typename) : null;
    var contains = params.nameContains ? String(params.nameContains).toLowerCase() : null;
    for (var f = 0; f < docF.pageItems.length && found.length < limitF; f++) {
      var it = docF.pageItems[f];
      if (wantType && it.typename !== wantType) continue;
      if (params.name && it.name !== params.name) continue;
      if (contains && String(it.name).toLowerCase().indexOf(contains) === -1) continue;
      if (params.layerName && (!it.layer || it.layer.name !== params.layerName)) continue;
      if (params.topLevelOnly !== false && it.parent && it.parent.typename !== "Layer") continue;
      found.push(__aiDescribeItem(it, rectF));
    }
    return { total: docF.pageItems.length, count: found.length, items: found, coordinateNote: "x/y = top-left from the artboard's top-left, y grows downward, in points." };
  }

  if (action === "ai.item.modify") {
    var docM = __aiRequireDoc();
    var rectM = __aiArtboardRect(docM, params.artboardIndex);
    var itemsM = __aiCollectItems(docM, params);
    var outM = [];
    var fillM = params.fillColor ? __aiParseColor(params.fillColor) : null;
    var strokeM = params.strokeColor ? __aiParseColor(params.strokeColor) : null;
    for (var m = 0; m < itemsM.length; m++) {
      var im = itemsM[m];
      if (params.remove === true) {
        outM.push({ removed: true, name: String(im.name || ""), uuid: __aiUuid(im) });
        im.remove();
        continue;
      }
      if (params.name && itemsM.length === 1) im.name = String(params.name);
      if (params.size) {
        if (typeof params.size.width === "number") im.width = params.size.width;
        if (typeof params.size.height === "number") im.height = params.size.height;
      }
      if (typeof params.scale === "number" || params.scale instanceof Array) {
        var sx = params.scale instanceof Array ? params.scale[0] : params.scale;
        var sy = params.scale instanceof Array ? params.scale[1] : params.scale;
        im.resize(sx, sy);
      }
      if (typeof params.rotate === "number") im.rotate(params.rotate);
      if (params.position) {
        im.position = [rectM[0] + params.position.x, rectM[1] - params.position.y];
      }
      if (params.moveBy) {
        im.translate(params.moveBy.x || 0, -(params.moveBy.y || 0));
      }
      if (typeof params.opacity === "number") im.opacity = params.opacity;
      if (params.blendMode) {
        var bmKey = String(params.blendMode).toUpperCase();
        if (bmKey === "SATURATION" || bmKey === "COLOR") bmKey = bmKey + "BLEND";
        if (typeof BlendModes[bmKey] === "undefined") throw new Error("Unknown blend mode '" + params.blendMode + "'.");
        im.blendingMode = BlendModes[bmKey];
      }
      if (fillM || strokeM || typeof params.strokeWidth === "number") __aiPaint(im, fillM, strokeM, params.strokeWidth);
      if (typeof params.hidden === "boolean") im.hidden = params.hidden;
      if (typeof params.locked === "boolean") im.locked = params.locked;
      if (params.moveToLayer) im.move(docM.layers.getByName(params.moveToLayer), ElementPlacement.PLACEATBEGINNING);
      if (params.zOrder) {
        var zMap = { bringToFront: "BRINGTOFRONT", bringForward: "BRINGFORWARD", sendBackward: "SENDBACKWARD", sendToBack: "SENDTOBACK" };
        im.zOrder(ZOrderMethod[zMap[params.zOrder]]);
      }
      outM.push(__aiDescribeItem(im, rectM));
    }
    return { count: outM.length, items: outM };
  }

  if (action === "ai.effect.applyLive") {
    var docL = __aiRequireDoc();
    var rectL = __aiArtboardRect(docL, params.artboardIndex);
    var itemsL = __aiCollectItems(docL, params);
    var outL = [];
    for (var l = 0; l < itemsL.length; l++) {
      itemsL[l].applyEffect(String(params.xml));
      if (params.expandAppearance === true) {
        __aiSelectOnly(docL, [itemsL[l]]);
        app.executeMenuCommand("expandStyle");
        outL.push(__aiDescribeItem(docL.selection[0], rectL));
      } else {
        outL.push(__aiDescribeItem(itemsL[l], rectL));
      }
    }
    return { effect: params.effectName || null, count: outL.length, items: outL };
  }

  if (action === "ai.style.graphic") {
    var docS = __aiRequireDoc();
    var opS = params.operation || "list";
    if (opS === "list") {
      var styles = [];
      for (var s = 0; s < docS.graphicStyles.length; s++) styles.push(String(docS.graphicStyles[s].name));
      return { count: styles.length, styles: styles };
    }
    var style = docS.graphicStyles.getByName(params.styleName);
    var itemsS = __aiCollectItems(docS, params);
    for (var si = 0; si < itemsS.length; si++) {
      if (opS === "merge") style.mergeTo(itemsS[si]);
      else style.applyTo(itemsS[si]);
    }
    return { operation: opS, styleName: params.styleName, count: itemsS.length };
  }

  if (action === "ai.swatch.manage") {
    var docW = __aiRequireDoc();
    var opW = params.operation || "list";
    if (opW === "add") {
      var sw = docW.swatches.add();
      sw.name = String(params.name || "MCP Swatch");
      sw.color = __aiParseColor(params.color);
      return { added: true, name: String(sw.name) };
    }
    var list = [];
    for (var w = 0; w < docW.swatches.length; w++) {
      var c = docW.swatches[w].color;
      var entry = { name: String(docW.swatches[w].name), colorType: String(c.typename) };
      if (c.typename === "RGBColor") entry.rgb = [c.red, c.green, c.blue];
      else if (c.typename === "CMYKColor") entry.cmyk = [c.cyan, c.magenta, c.yellow, c.black];
      list.push(entry);
    }
    return { count: list.length, swatches: list };
  }

  if (action === "ai.color.gradient") {
    var docG = __aiRequireDoc();
    var itemsG = __aiCollectItems(docG, params);
    var stops = params.stops || [];
    if (stops.length < 2) throw new Error("A gradient needs at least 2 stops.");
    var grad = docG.gradients.add();
    grad.name = String(params.name || ("MCP Gradient " + new Date().getTime()));
    grad.type = params.type === "radial" ? GradientType.RADIAL : GradientType.LINEAR;
    while (grad.gradientStops.length < stops.length) grad.gradientStops.add();
    while (grad.gradientStops.length > stops.length) grad.gradientStops[grad.gradientStops.length - 1].remove();
    for (var gs = 0; gs < stops.length; gs++) {
      var st = grad.gradientStops[gs];
      st.rampPoint = typeof stops[gs].offset === "number" ? stops[gs].offset : (gs * 100) / (stops.length - 1);
      st.midPoint = 50;
      st.color = __aiParseColor(stops[gs].color);
      if (typeof stops[gs].opacity === "number") st.opacity = stops[gs].opacity;
    }
    for (var gi = 0; gi < itemsG.length; gi++) {
      var gc = new GradientColor();
      gc.gradient = grad;
      __aiPaint(itemsG[gi], gc, null, undefined);
      if (typeof params.angle === "number" && params.angle !== 0 && grad.type === GradientType.LINEAR) {
        // Rotate only the gradient fill, not the object (changePositions=false, changeFillGradients=true).
        itemsG[gi].rotate(params.angle, false, false, true, false, Transformation.CENTER);
      }
    }
    return { gradient: String(grad.name), stops: stops.length, count: itemsG.length };
  }

  if (action === "ai.arrange.align") {
    var docA = __aiRequireDoc();
    var rectA = __aiArtboardRect(docA, params.artboardIndex);
    var itemsA = __aiCollectItems(docA, params);
    var vis = params.useVisibleBounds === true;
    var ref = params.relativeTo === "artboard" ? [rectA[0], rectA[1], rectA[2], rectA[3]] : __aiBounds(itemsA, vis);
    if (params.relativeTo === "keyObject") ref = vis ? itemsA[0].visibleBounds : itemsA[0].geometricBounds;
    var how = params.align;
    if (how) {
      for (var a = 0; a < itemsA.length; a++) {
        if (params.relativeTo === "keyObject" && a === 0) continue;
        var b = vis ? itemsA[a].visibleBounds : itemsA[a].geometricBounds;
        var dx = 0;
        var dy = 0;
        if (how === "left") dx = ref[0] - b[0];
        else if (how === "right") dx = ref[2] - b[2];
        else if (how === "centerH") dx = (ref[0] + ref[2]) / 2 - (b[0] + b[2]) / 2;
        else if (how === "top") dy = ref[1] - b[1];
        else if (how === "bottom") dy = ref[3] - b[3];
        else if (how === "centerV") dy = (ref[1] + ref[3]) / 2 - (b[1] + b[3]) / 2;
        itemsA[a].translate(dx, dy);
      }
    }
    if (params.distribute && itemsA.length > 2) {
      var horiz = params.distribute === "horizontal";
      var sorted = itemsA.slice(0);
      sorted.sort(function (p, q) {
        var pb = p.geometricBounds;
        var qb = q.geometricBounds;
        return horiz ? pb[0] - qb[0] : qb[1] - pb[1];
      });
      var firstB = sorted[0].geometricBounds;
      var lastB = sorted[sorted.length - 1].geometricBounds;
      if (typeof params.gap === "number") {
        var cursor = horiz ? firstB[2] : firstB[3];
        for (var d = 1; d < sorted.length; d++) {
          var bb = sorted[d].geometricBounds;
          if (horiz) {
            sorted[d].translate(cursor + params.gap - bb[0], 0);
            cursor = sorted[d].geometricBounds[2];
          } else {
            sorted[d].translate(0, cursor - params.gap - bb[1]);
            cursor = sorted[d].geometricBounds[3];
          }
        }
      } else {
        var c0 = horiz ? (firstB[0] + firstB[2]) / 2 : (firstB[1] + firstB[3]) / 2;
        var c1 = horiz ? (lastB[0] + lastB[2]) / 2 : (lastB[1] + lastB[3]) / 2;
        var step = (c1 - c0) / (sorted.length - 1);
        for (var e = 1; e < sorted.length - 1; e++) {
          var eb = sorted[e].geometricBounds;
          var ce = horiz ? (eb[0] + eb[2]) / 2 : (eb[1] + eb[3]) / 2;
          var target = c0 + step * e;
          if (horiz) sorted[e].translate(target - ce, 0);
          else sorted[e].translate(0, target - ce);
        }
      }
    }
    var outA = [];
    for (var o = 0; o < itemsA.length; o++) outA.push(__aiDescribeItem(itemsA[o], rectA));
    return { count: outA.length, items: outA };
  }

  if (action === "ai.pathfinder") {
    var docP = __aiRequireDoc();
    var rectP = __aiArtboardRect(docP, params.artboardIndex);
    var itemsP = __aiCollectItems(docP, params);
    if (itemsP.length < 2 && params.operation !== "outline") throw new Error("Pathfinder needs at least 2 objects.");
    var menuMap = {
      unite: "Live Pathfinder Add",
      minusFront: "Live Pathfinder Subtract",
      intersect: "Live Pathfinder Intersect",
      exclude: "Live Pathfinder Exclude",
      divide: "Live Pathfinder Divide",
      trim: "Live Pathfinder Trim",
      merge: "Live Pathfinder Merge",
      crop: "Live Pathfinder Crop",
      outline: "Live Pathfinder Outline",
      minusBack: "Live Pathfinder Minus Back"
    };
    var cmd = menuMap[params.operation];
    if (!cmd) throw new Error("Unknown pathfinder operation '" + params.operation + "'.");
    __aiSelectOnly(docP, itemsP);
    app.executeMenuCommand("group");
    app.executeMenuCommand(cmd);
    if (params.expand !== false) app.executeMenuCommand("expandStyle");
    var res = docP.selection && docP.selection.length ? docP.selection[0] : null;
    if (res && params.name) res.name = String(params.name);
    return { operation: params.operation, expanded: params.expand !== false, result: res ? __aiDescribeItem(res, rectP) : null };
  }

  if (action === "ai.mask") {
    var docM = __aiRequireDoc();
    var rectM = __aiArtboardRect(docM, params.artboardIndex);
    var itemsM = __aiCollectItems(docM, params);
    var opM = params.operation || "clip";
    if (opM === "clip") {
      // The top object of the set becomes the mask shape; everything below it is clipped.
      if (itemsM.length < 2) __mcpFail("INVALID_PARAMS", "A clipping mask needs at least 2 objects: the shape on top and the artwork below it.");
      __aiSelectOnly(docM, itemsM);
      app.executeMenuCommand("makeMask");
    } else if (opM === "releaseClip") {
      if (!itemsM.length) __mcpFail("INVALID_PARAMS", "Name the clipped group to release.");
      __aiSelectOnly(docM, itemsM);
      app.executeMenuCommand("releaseMask");
    } else if (opM === "opacity" || opM === "releaseOpacity") {
      // Opacity masks have no DOM; the Transparency panel commands are reached through a one-step action.
      if (opM === "opacity" && itemsM.length < 2) __mcpFail("INVALID_PARAMS", "An opacity mask needs 2 objects: the mask on top (white shows, black hides) and the artwork below it.");
      if (!itemsM.length) __mcpFail("INVALID_PARAMS", "Name the masked object.");
      __aiSelectOnly(docM, itemsM);
      __aiRunTransparencyMask(opM === "opacity");
    } else {
      __mcpFail("INVALID_PARAMS", "operation must be clip, releaseClip, opacity or releaseOpacity.");
    }
    var selM = docM.selection && docM.selection.length ? docM.selection[0] : null;
    if (selM && params.name) selM.name = String(params.name);
    return { operation: opM, result: selM ? __aiDescribeItem(selM, rectM) : null, clipped: selM && selM.typename === "GroupItem" ? !!selM.clipped : null };
  }

  if (action === "ai.recipe.popOut") {
    // "Out of bounds" / pop-out with clipping masks, in the open document. The image must already be a cut-out
    // (transparent PNG/PSD: Photoshop removes the background first; Illustrator's own Remove Background has no script API).
    //   Subject top  clip group: a tight rectangle above the cut line + the cut-out -> what sticks out of the shape
    //   Subject      clip group: the shape (clipping path, filled after masking) + the image -> the shape crops the body
    // backgroundFilePath: the original photo goes inside the shape instead (its background shows there).
    var docP = __aiRequireDoc();
    var abP = docP.artboards[docP.artboards.getActiveArtboardIndex()].artboardRect; // [left, top, right, bottom]
    var imgP = null;
    if (params.filePath) {
      var fP = new File(params.filePath);
      if (!fP.exists) __mcpFail("NOT_FOUND", "File not found: " + params.filePath);
      var plP = docP.placedItems.add();
      plP.file = fP;
      if (params.embed !== false) {
        plP.embed();
        imgP = docP.selection && docP.selection.length ? docP.selection[0] : docP.rasterItems[0];
      } else {
        imgP = plP;
      }
      var abW = abP[2] - abP[0], abH = abP[1] - abP[3];
      var wantH = typeof params.placeHeight === "number" ? params.placeHeight : abH * 0.9;
      var scP = (wantH / imgP.height) * 100;
      imgP.resize(scP, scP);
      var cxAb = typeof params.centerX === "number" ? abP[0] + params.centerX : abP[0] + abW / 2;
      var topAb = typeof params.top === "number" ? abP[1] - params.top : abP[1] - (abH - imgP.height) / 2;
      imgP.position = [cxAb - imgP.width / 2, topAb];
    } else if (params.imageName) {
      try { imgP = docP.pageItems.getByName(String(params.imageName)); } catch (eNm) { imgP = null; }
      if (!imgP) __mcpFail("NOT_FOUND", "No object named '" + params.imageName + "'.");
    } else if (docP.selection && docP.selection.length === 1) {
      imgP = docP.selection[0];
    } else if (docP.rasterItems.length + docP.placedItems.length === 1) {
      imgP = docP.rasterItems.length ? docP.rasterItems[0] : docP.placedItems[0];
    } else {
      __mcpFail("INVALID_PARAMS", "Say which image to use: filePath (a cut-out PNG to place), imageName, or select the image.");
    }
    if (imgP.typename !== "RasterItem" && imgP.typename !== "PlacedItem") {
      __mcpFail("INVALID_PARAMS", "The pop-out needs a placed or embedded image; '" + imgP.typename + "' is not one.");
    }
    var gbP = imgP.geometricBounds; // [left, top, right, bottom], y grows upward
    var iW = gbP[2] - gbP[0], iH = gbP[1] - gbP[3];
    // Subject box inside the image (pixels of the image file); default: the whole image.
    var sL = gbP[0], sT = gbP[1], sW2 = iW, sH2 = iH;
    if (params.subjectBox && params.imageSize && params.imageSize.width > 0 && params.imageSize.height > 0) {
      var kx = iW / params.imageSize.width, ky = iH / params.imageSize.height;
      sL = gbP[0] + params.subjectBox.x * kx;
      sT = gbP[1] - params.subjectBox.y * ky;
      sW2 = params.subjectBox.width * kx;
      sH2 = params.subjectBox.height * ky;
    }
    var kindP = params.shape || "circle";
    var shLeft, shTop, shW2, shH2;
    if (params.shapeBounds) {
      shLeft = abP[0] + params.shapeBounds.x;
      shTop = abP[1] - params.shapeBounds.y;
      shW2 = params.shapeBounds.width;
      shH2 = params.shapeBounds.height;
    } else {
      shW2 = sW2 * (typeof params.shapeScale === "number" ? params.shapeScale : 1.5);
      shH2 = kindP === "circle" ? shW2 : shW2 * (typeof params.shapeAspect === "number" ? params.shapeAspect : 1);
      shLeft = sL + sW2 / 2 - shW2 / 2;
      shTop = sT - (typeof params.overflow === "number" ? params.overflow : 0.22) * shH2;
    }
    var warnP = [];
    if (shTop >= sT) warnP.push("The shape starts at or above the top of the subject: nothing sticks out. Lower the shape or raise overflow.");
    var cutP = shTop - shH2 * (typeof params.cutAt === "number" ? params.cutAt : 0.5);

    // Optional: the original photo (with its background) shows inside the shape; it must be the un-trimmed
    // frame the cut-out came from, so both land on the same spot.
    var bgP = null;
    if (params.backgroundFilePath) {
      var fBg = new File(params.backgroundFilePath);
      if (!fBg.exists) __mcpFail("NOT_FOUND", "File not found: " + params.backgroundFilePath);
      var plBg = docP.placedItems.add();
      plBg.file = fBg;
      if (params.embed !== false) {
        plBg.embed();
        bgP = docP.selection && docP.selection.length ? docP.selection[0] : docP.rasterItems[0];
      } else {
        bgP = plBg;
      }
      bgP.resize((iW / bgP.width) * 100, (iH / bgP.height) * 100);
      bgP.position = [gbP[0], gbP[1]];
      bgP.name = "Photo (with background)";
    }

    var grpP = imgP.layer.groupItems.add();
    grpP.name = params.groupName || "Pop-out";
    grpP.move(imgP, ElementPlacement.PLACEBEFORE);
    var mkShape = function (parent) {
      if (kindP === "rectangle") return parent.pathItems.rectangle(shTop, shLeft, shW2, shH2);
      if (kindP === "roundedRectangle") {
        var rr = typeof params.radius === "number" ? params.radius : Math.min(shW2, shH2) * 0.12;
        return parent.pathItems.roundedRectangle(shTop, shLeft, shW2, shH2, rr, rr);
      }
      return parent.pathItems.ellipse(shTop, shLeft, shW2, shH2);
    };
    // Subject: the shape is the clipping path AND the visible shape (fill and stroke are set after the mask is
    // made: making the mask clears them).
    var bodyP = grpP.groupItems.add();
    bodyP.name = "Subject";
    var clipBody = mkShape(bodyP);
    clipBody.name = "Shape";
    // Subject top: a rectangle tight on the part that shows (subject width, subject top down to the cut line).
    var topP = grpP.groupItems.add();
    topP.name = "Subject top";
    var clipTop = topP.pathItems.rectangle(sT, sL, sW2, Math.max(1, sT - cutP));
    clipTop.name = "Clip (above the cut line)";
    if (bgP) {
      imgP.move(topP, ElementPlacement.PLACEATEND);
      bgP.move(bodyP, ElementPlacement.PLACEATEND);
    } else {
      imgP.duplicate(topP, ElementPlacement.PLACEATEND);
      imgP.move(bodyP, ElementPlacement.PLACEATEND);
    }
    clipBody.clipping = true;
    bodyP.clipped = true;
    clipTop.clipping = true;
    topP.clipped = true;
    clipBody.filled = true;
    clipBody.fillColor = __aiParseColor(params.shapeColor || "#C8783C");
    if (params.strokeColor || typeof params.strokeWidth === "number") {
      clipBody.stroked = true;
      clipBody.strokeColor = __aiParseColor(params.strokeColor || "#000000");
      clipBody.strokeWidth = typeof params.strokeWidth === "number" ? params.strokeWidth : 4;
    }
    docP.selection = null;
    return {
      document: docP.name,
      group: grpP.name,
      layers: ["Subject top", "Subject"],
      keepBackground: !!bgP,
      image: { typename: imgP.typename, x: gbP[0] - abP[0], y: abP[1] - gbP[1], width: iW, height: iH },
      subject: { x: sL - abP[0], y: abP[1] - sT, width: sW2, height: sH2 },
      shape: { kind: kindP, x: shLeft - abP[0], y: abP[1] - shTop, width: shW2, height: shH2, filled: clipBody.filled, stroked: clipBody.stroked },
      cutY: abP[1] - cutP,
      clipped: [bodyP.clipped, topP.clipped],
      warnings: warnP
    };
  }

  if (action === "ai.stroke") {
    var docK = __aiRequireDoc();
    var rectK = __aiArtboardRect(docK, params.artboardIndex);
    var itemsK = __aiCollectItems(docK, params);
    if (!itemsK.length) __mcpFail("INVALID_PARAMS", "No objects to change. Name them with uuids, itemNames or layerName.");
    var capsK = { butt: StrokeCap.BUTTENDCAP, round: StrokeCap.ROUNDENDCAP, projecting: StrokeCap.PROJECTINGENDCAP };
    var joinsK = { miter: StrokeJoin.MITERENDJOIN, round: StrokeJoin.ROUNDENDJOIN, bevel: StrokeJoin.BEVELENDJOIN };
    var changedK = [];
    var applyK = function (it) {
      if (it.typename === "GroupItem") { for (var gk = 0; gk < it.pageItems.length; gk++) applyK(it.pageItems[gk]); return; }
      if (it.typename === "CompoundPathItem") { for (var ck = 0; ck < it.pathItems.length; ck++) applyK(it.pathItems[ck]); return; }
      if (it.typename !== "PathItem") return;
      it.stroked = true;
      if (params.color !== undefined) it.strokeColor = __aiParseColor(params.color);
      if (typeof params.width === "number") it.strokeWidth = params.width;
      if (params.dashes instanceof Array) it.strokeDashes = params.dashes;
      if (typeof params.dashOffset === "number") it.strokeDashOffset = params.dashOffset;
      if (params.cap) { if (!capsK[params.cap]) __mcpFail("INVALID_PARAMS", "cap must be butt, round or projecting."); it.strokeCap = capsK[params.cap]; }
      if (params.join) { if (!joinsK[params.join]) __mcpFail("INVALID_PARAMS", "join must be miter, round or bevel."); it.strokeJoin = joinsK[params.join]; }
      if (typeof params.miterLimit === "number") it.strokeMiterLimit = params.miterLimit;
      changedK.push(it);
    };
    for (var ik = 0; ik < itemsK.length; ik++) applyK(itemsK[ik]);
    if (!changedK.length) __mcpFail("INVALID_PARAMS", "None of the objects is a path (text and images have no stroke settings here).");
    var arrowsK = null;
    if (params.arrowStart || params.arrowEnd) {
      __aiSelectOnly(docK, changedK);
      arrowsK = __aiApplyArrowheads(changedK, params.arrowStart, params.arrowEnd, params.arrowScale);
    }
    var outK = [];
    for (var ok = 0; ok < changedK.length && ok < 20; ok++) {
      outK.push({ uuid: __aiUuid(changedK[ok]), name: changedK[ok].name, strokeWidth: changedK[ok].strokeWidth, dashes: changedK[ok].strokeDashes, cap: String(changedK[ok].strokeCap), join: String(changedK[ok].strokeJoin) });
    }
    return { changed: changedK.length, items: outK, arrowheads: arrowsK };
  }

  if (action === "ai.trace") {
    var docT = __aiRequireDoc();
    var rectT = __aiArtboardRect(docT, params.artboardIndex);
    var srcT = null;
    if (params.filePath) {
      var fT = new File(params.filePath);
      if (!fT.exists) __mcpFail("FILE_NOT_FOUND", "Image not found: " + params.filePath);
      srcT = docT.placedItems.add();
      srcT.file = fT;
    } else {
      var itemsT = __aiCollectItems(docT, params);
      for (var it0 = 0; it0 < itemsT.length; it0++) {
        if (itemsT[it0].typename === "PlacedItem" || itemsT[it0].typename === "RasterItem") { srcT = itemsT[it0]; break; }
      }
      if (!srcT) __mcpFail("INVALID_PARAMS", "Image Trace needs a placed or embedded image: name it (uuids, itemNames) or pass filePath.");
    }
    var traced = srcT.trace();
    var optsT = traced.tracing.tracingOptions;
    var presetsT = app.tracingPresetsList;
    if (params.preset) {
      var foundT = false;
      for (var pt0 = 0; pt0 < presetsT.length; pt0++) { if (String(presetsT[pt0]).toLowerCase() === String(params.preset).toLowerCase()) { optsT.loadFromPreset(presetsT[pt0]); foundT = true; break; } }
      if (!foundT) __mcpFail("INVALID_PARAMS", "Unknown Image Trace preset '" + params.preset + "'. Installed: " + presetsT.join(", ") + ".");
    }
    if (typeof params.ignoreWhite === "boolean") optsT.ignoreWhite = params.ignoreWhite;
    if (typeof params.maxColors === "number") optsT.maxColors = params.maxColors;
    if (typeof params.threshold === "number") optsT.threshold = params.threshold;
    app.redraw();
    var pathsT = null, areasT = null;
    try { pathsT = traced.tracing.pathCount; areasT = traced.tracing.areaCount; } catch (eTr) {}
    var resT = traced;
    if (params.expand !== false) resT = traced.tracing.expandTracing();
    if (params.name) resT.name = String(params.name);
    return { expanded: params.expand !== false, preset: params.preset || null, paths: pathsT, areas: areasT, result: __aiDescribeItem(resT, rectT), presets: params.listPresets ? presetsT : undefined };
  }

  if (action === "ai.textStyle") {
    var docY = __aiRequireDoc();
    var kindY = params.kind === "character" ? "character" : "paragraph";
    var collY = kindY === "character" ? docY.characterStyles : docY.paragraphStyles;
    var opY = params.operation || "list";
    var findY = function (name) { for (var fy = 0; fy < collY.length; fy++) { if (collY[fy].name === name) return collY[fy]; } return null; };
    var describeY = function (st) {
      var ca = st.characterAttributes, o = { name: st.name };
      try { o.font = ca.textFont ? ca.textFont.name : null; } catch (e1) { o.font = null; }
      try { o.size = ca.size; } catch (e2) {}
      try { o.leading = ca.autoLeading ? "auto" : ca.leading; } catch (e3) {}
      try { o.tracking = ca.tracking; } catch (e4) {}
      if (kindY === "paragraph") { try { o.justification = String(st.paragraphAttributes.justification).replace("Justification.", "").toLowerCase(); } catch (e5) {} }
      return o;
    };
    var setY = function (st) {
      var a = params.attributes || {}, ca = st.characterAttributes;
      if (a.font) { var fontY = null; try { fontY = app.textFonts.getByName(a.font); } catch (eF) { fontY = null; } if (!fontY) __mcpFail("FONT_NOT_FOUND", "Font '" + a.font + "' is not installed (use the PostScript name, e.g. Montserrat-SemiBold)."); ca.textFont = fontY; }
      if (typeof a.size === "number") ca.size = a.size;
      if (typeof a.leading === "number") { ca.autoLeading = false; ca.leading = a.leading; }
      if (typeof a.tracking === "number") ca.tracking = a.tracking;
      if (a.color !== undefined) ca.fillColor = __aiParseColor(a.color);
      if (typeof a.allCaps === "boolean") ca.capitalization = a.allCaps ? FontCapsOption.ALLCAPS : FontCapsOption.NORMALCAPS;
      if (kindY === "paragraph") {
        var pa = st.paragraphAttributes;
        var justY = { left: Justification.LEFT, center: Justification.CENTER, right: Justification.RIGHT, justify: Justification.FULLJUSTIFYLASTLINELEFT };
        if (a.justification) { if (!justY[a.justification]) __mcpFail("INVALID_PARAMS", "justification must be left, center, right or justify."); pa.justification = justY[a.justification]; }
        if (typeof a.spaceBefore === "number") pa.spaceBefore = a.spaceBefore;
        if (typeof a.spaceAfter === "number") pa.spaceAfter = a.spaceAfter;
        if (typeof a.firstLineIndent === "number") pa.firstLineIndent = a.firstLineIndent;
        if (typeof a.hyphenation === "boolean") pa.hyphenation = a.hyphenation;
      }
    };
    if (opY !== "list" && !params.name) __mcpFail("INVALID_PARAMS", "name is required.");
    var stY = params.name ? findY(params.name) : null;
    var appliedY = 0;
    if (opY === "create") {
      if (stY) __mcpFail("STYLE_EXISTS", "A " + kindY + " style named '" + params.name + "' already exists. Use operation update.");
      stY = collY.add(params.name);
      setY(stY);
    } else if (opY === "update") {
      if (!stY) __mcpFail("STYLE_NOT_FOUND", "No " + kindY + " style named '" + params.name + "'.");
      setY(stY);
      if (params.newName) stY.name = String(params.newName);
    } else if (opY === "apply") {
      if (!stY) __mcpFail("STYLE_NOT_FOUND", "No " + kindY + " style named '" + params.name + "'.");
      var itemsY = __aiCollectItems(docY, params);
      for (var iy = 0; iy < itemsY.length; iy++) {
        if (itemsY[iy].typename !== "TextFrame") continue;
        stY.applyTo(itemsY[iy].textRange, params.clearOverrides !== false);
        appliedY++;
      }
      if (!appliedY) __mcpFail("INVALID_PARAMS", "None of the objects is text. Name text objects with uuids or itemNames.");
    } else if (opY === "remove") {
      if (!stY) __mcpFail("STYLE_NOT_FOUND", "No " + kindY + " style named '" + params.name + "'.");
      stY.remove();
      stY = null;
    } else if (opY !== "list") {
      __mcpFail("INVALID_PARAMS", "operation must be list, create, update, apply or remove.");
    }
    var listY = [];
    for (var ly = 0; ly < collY.length && ly < 100; ly++) listY.push(describeY(collY[ly]));
    return { kind: kindY, operation: opY, style: stY ? describeY(stY) : null, appliedTo: opY === "apply" ? appliedY : undefined, styles: listY };
  }

  if (action === "ai.raw.executeMenuOrAction") {
    if (params.menuCommand) {
      app.executeMenuCommand(params.menuCommand);
      return { executedMenuCommand: params.menuCommand };
    }
    if (params.actionName && params.actionSet) {
      app.doScript(params.actionName, params.actionSet);
      return { executedAction: params.actionName, actionSet: params.actionSet };
    }
    throw new Error("Provide either menuCommand or (actionName + actionSet).");
  }

  if (action === "ai.raw.sendCppScriptMessage") {
    if (typeof app.sendScriptMessage !== "function") {
      throw new Error("app.sendScriptMessage is not available in this Illustrator version.");
    }
    var pluginName = params.pluginName || "ScriptMessage";
    var selector = params.selector || "Send Text";
    var inputStr = typeof params.payload === "string" ? params.payload : JSON.stringify(params.payload || {});
    var cppResponse = app.sendScriptMessage(pluginName, selector, inputStr);
    return {
      pluginName: pluginName,
      selector: selector,
      response: cppResponse
    };
  }

  if (action === "ai.template.brand") {
    // Brand template (.ait): one artboard per format with the brand background, a "Marca" swatch group and
    // character styles Titulo / Corpo / Rotulo in the kit fonts. Opens as an untitled copy.
    var Ct = params.colors;
    var Ft = params.fonts || {};
    var boards = params.artboards || [{ name: "feed4x5", width: 1080, height: 1350 }];
    var docT = app.documents.add(DocumentColorSpace.RGB, boards[0].width, boards[0].height);
    var warnT = [];
    try {
      var grp = null;
      try {
        grp = docT.swatchGroups.add();
        grp.name = "Marca";
      } catch (_eGrp) {}
      var roles = ["fundo", "superficie", "texto", "textoSecundario", "destaque"];
      var sw = {};
      for (var r = 0; r < roles.length; r++) {
        var s = docT.swatches.add();
        s.name = "Marca " + roles[r];
        s.color = __aiMakeRgbColor(Ct[roles[r]]);
        if (grp) {
          try {
            grp.addSwatch(s);
          } catch (_eAdd) {}
        }
        sw[roles[r]] = s.color;
      }
      var cs = [["Titulo", Ft.titulo, 64, "texto"], ["Corpo", Ft.corpo, 30, "textoSecundario"], ["Rotulo", Ft.rotulo, 26, "destaque"]];
      for (var c = 0; c < cs.length; c++) {
        var st = docT.characterStyles.add(cs[c][0]);
        try {
          st.characterAttributes.textFont = app.textFonts.getByName(cs[c][1]);
        } catch (_eFont) {
          warnT.push("font not found: " + cs[c][1]);
        }
        st.characterAttributes.size = cs[c][2];
        st.characterAttributes.fillColor = sw[cs[c][3]];
      }
      var x = 0;
      var gap = 100;
      for (var a = 0; a < boards.length; a++) {
        var B = boards[a];
        var rect = [x, 0, x + B.width, -B.height];
        var ab;
        if (a === 0) {
          ab = docT.artboards[0];
          ab.artboardRect = rect;
        } else ab = docT.artboards.add(rect);
        ab.name = B.name;
        var bg = docT.pathItems.rectangle(0, x, B.width, B.height);
        bg.name = "Fundo " + B.name;
        bg.stroked = false;
        bg.filled = true;
        bg.fillColor = sw.fundo;
        var tf = docT.textFrames.areaText(docT.pathItems.rectangle(-B.height * 0.55, x + 60, B.width - 120, B.height * 0.3));
        tf.name = "Titulo " + B.name;
        tf.contents = "T\u00EDtulo";
        docT.characterStyles.getByName("Titulo").applyTo(tf.textRange, true);
        x += B.width + gap;
      }
      try {
        docT.layers[0].name = "Arte";
      } catch (_eLn) {}
      var base = String(params.outputPath).replace(/\.ai[t]?$/i, "");
      var aiF = new File(base + ".ai");
      if (!aiF.parent.exists) aiF.parent.create();
      docT.saveAs(aiF, new IllustratorSaveOptions());
      docT.close(SaveOptions.DONOTSAVECHANGES);
      docT = null;
      var tplF = new File(base + ".ait");
      if (tplF.exists) tplF.remove();
      new File(base + ".ai").rename(tplF.name);
      return { file: tplF.fsName, artboards: boards.length, swatches: roles.length, characterStyles: ["Titulo", "Corpo", "Rotulo"], warnings: warnT };
    } finally {
      if (docT) {
        try {
          docT.close(SaveOptions.DONOTSAVECHANGES);
        } catch (_eC) {}
      }
    }
  }

  if (action === "ai.recipe.logoPackage") {
    return __aiRecipeLogoPackage(params);
  }

  if (action === "ai.raw.executeExtendScript") {
    var res = __mcpEvalUserCode(params.code);
    return {
      executed: true,
      result: typeof res === "undefined" ? null : res
    };
  }

  if (action === "adobe.inspectDom") {
    return __mcpInspectDomObject(params.targetExpression || "app", params.maxProperties || 150);
  }

  __mcpUnsupported("Unknown Illustrator action: " + action);
}
