/*
 * pr-handlers.jsx
 * Pure ECMAScript 3 ExtendScript + QE DOM handlers for Adobe Premiere Pro (CEP bridge).
 */

var __PR_TICKS_PER_SECOND = 254016000000;

function __prSecondsToTicks(sec) {
  return String(Math.round((Number(sec) || 0) * __PR_TICKS_PER_SECOND));
}

/** Removes the last QE component with this display name from a QE clip (undo of a wrong effect). */
function __prQeRemoveComponentNamed(qeClip, name) {
  for (var k = qeClip.numComponents - 1; k >= 0; k--) {
    var cp = qeClip.getComponentAt(k);
    if (cp && cp.name === name) {
      cp.remove();
      return true;
    }
  }
  return false;
}

function __prRequireProject() {
  if (!app.project) {
    throw new Error("No Premiere Pro project is currently open.");
  }
  return app.project;
}

function __prRequireActiveSequence() {
  var proj = __prRequireProject();
  if (!proj.activeSequence) {
    throw new Error("No active sequence in Premiere Pro.");
  }
  return proj.activeSequence;
}

/** Depth-first search with a match test. */
function __prFindProjectItemWhere(bin, test) {
  if (!bin || !bin.children) return null;
  for (var i = 0; i < bin.children.numItems; i++) {
    var child = bin.children[i];
    if (test(child)) return child;
    if (child.type === ProjectItemType.BIN) {
      var nested = __prFindProjectItemWhere(child, test);
      if (nested) return nested;
    }
  }
  return null;
}

/**
 * Finds a project item by exact name, then by its Dynamic Link comp name ("Comp/Project.aep" answers
 * to "Comp"), then by media path. Name first: every comp linked from one .aep shares the same path.
 */
function __prFindProjectItemByNameOrPath(bin, nameOrPath) {
  var want = String(nameOrPath);
  var hit = __prFindProjectItemWhere(bin, function (c) { return c.name === want; });
  if (hit) return hit;
  hit = __prFindProjectItemWhere(bin, function (c) {
    var n = String(c.name);
    var slash = n.lastIndexOf("/");
    return slash > 0 && /\.aepx?$/i.test(n) && n.substring(0, slash) === want;
  });
  if (hit) return hit;
  // media path: Windows answers with backslashes, callers often pass forward slashes; compare normalised
  var wantPath = __prNormPath(want);
  return __prFindProjectItemWhere(bin, function (c) {
    return c.type !== ProjectItemType.BIN && c.getMediaPath && __prNormPath(c.getMediaPath()) === wantPath;
  });
}

function __prNormPath(p) {
  return String(p || "").replace(/\\/g, "/").toLowerCase();
}

function __prCollectProjectItems(bin, depth, maxDepth) {
  var items = [];
  if (!bin || !bin.children || depth > maxDepth) return items;
  for (var i = 0; i < bin.children.numItems; i++) {
    var it = bin.children[i];
    var node = {
      name: it.name,
      nodeId: it.nodeId || null,
      type: it.type === ProjectItemType.BIN ? "bin" : "clip",
      mediaPath: (typeof it.getMediaPath === "function") ? it.getMediaPath() : null
    };
    if (it.type === ProjectItemType.BIN) {
      node.children = __prCollectProjectItems(it, depth + 1, maxDepth);
    }
    items.push(node);
  }
  return items;
}

function __prGetTrack(seq, trackType, trackIndex) {
  var tracks = trackType === "audio" ? seq.audioTracks : seq.videoTracks;
  var idx = typeof trackIndex === "number" ? trackIndex : 0;
  if (idx < 0 || idx >= tracks.numTracks) {
    throw new Error("Track " + idx + " (" + (trackType || "video") + ") does not exist; the sequence has " + tracks.numTracks + ".");
  }
  return tracks[idx];
}

function __prGetClip(track, clipIndex) {
  var idx = typeof clipIndex === "number" ? clipIndex : 0;
  if (idx < 0 || idx >= track.clips.numItems) {
    throw new Error("Clip index " + idx + " does not exist; the track has " + track.clips.numItems + " clip(s).");
  }
  return track.clips[idx];
}

/** QE counts gaps as items: returns the QE item that matches DOM clip number `domIndex`. */
function __prQeClipAt(qeTrack, domIndex) {
  var seen = -1;
  for (var i = 0; i < qeTrack.numItems; i++) {
    var item = qeTrack.getItemAt(i);
    if (item && String(item.type) !== "Empty") {
      seen++;
      if (seen === domIndex) {
        return item;
      }
    }
  }
  throw new Error("QE clip " + domIndex + " not found on this track.");
}

function __prQeTrack(trackType, trackIndex) {
  app.enableQE();
  var qeSeq = qe.project.getActiveSequence();
  if (!qeSeq) throw new Error("QE active sequence not available.");
  return trackType === "audio" ? qeSeq.getAudioTrackAt(trackIndex || 0) : qeSeq.getVideoTrackAt(trackIndex || 0);
}

function __prQeNameList(kind) {
  app.enableQE();
  var raw = null;
  if (kind === "videoEffects") raw = qe.project.getVideoEffectList();
  else if (kind === "audioEffects") raw = qe.project.getAudioEffectList();
  else if (kind === "videoTransitions") raw = qe.project.getVideoTransitionList();
  else if (kind === "audioTransitions") raw = qe.project.getAudioTransitionList();
  else throw new Error("Unknown list kind: " + kind);
  var out = [];
  if (raw) {
    for (var i = 0; i < raw.length; i++) {
      out.push(String(raw[i]));
    }
  }
  return out;
}

/** QE returns a non-null placeholder for unknown names, so names are checked against Premiere's own list. */
function __prCanonicalName(kind, wanted) {
  var names = __prQeNameList(kind);
  var lower = String(wanted || "").toLowerCase();
  for (var i = 0; i < names.length; i++) {
    if (names[i].toLowerCase() === lower) {
      return names[i];
    }
  }
  var err = new Error("'" + wanted + "' is not in Premiere's " + kind + " list. Names follow Premiere's language; use pr_list_effects.");
  err.name = "EFFECT_NOT_FOUND";
  throw err;
}

function __prSafeValue(prop) {
  try {
    var v = prop.getValue();
    if (typeof v === "number" || typeof v === "string" || typeof v === "boolean" || v instanceof Array) {
      return v;
    }
    return null;
  } catch (_e) {
    return null;
  }
}

/** Readback of every component (effect) on a clip with its parameters and current values. */
function __prDescribeComponents(clip) {
  var out = [];
  for (var ci = 0; ci < clip.components.numItems; ci++) {
    var c = clip.components[ci];
    var props = [];
    for (var pi = 0; pi < c.properties.numItems; pi++) {
      var p = c.properties[pi];
      var timeVarying = false;
      try {
        timeVarying = p.isTimeVarying();
      } catch (_eT) {}
      var pname = String(p.displayName || "");
      if (pname === "" || pname.charAt(0) === "_") {
        continue;
      }
      props.push({ index: pi, displayName: pname, value: __prSafeValue(p), timeVarying: timeVarying });
    }
    out.push({ index: ci, displayName: String(c.displayName), matchName: String(c.matchName), properties: props });
  }
  return out;
}

function __prFindComponent(clip, nameOrIndex) {
  if (typeof nameOrIndex === "number") {
    return clip.components[nameOrIndex] || null;
  }
  var lower = String(nameOrIndex || "").toLowerCase();
  var found = null;
  for (var ci = 0; ci < clip.components.numItems; ci++) {
    var c = clip.components[ci];
    if (String(c.displayName).toLowerCase() === lower || String(c.matchName).toLowerCase() === lower) {
      found = c;
    }
  }
  return found;
}

function __prFindComponentProperty(component, displayName) {
  var lower = String(displayName).toLowerCase();
  for (var pi = 0; pi < component.properties.numItems; pi++) {
    var p = component.properties[pi];
    if (String(p.displayName).toLowerCase() === lower) {
      return p;
    }
  }
  return null;
}

/** Sets static values and/or keyframes on a component; unknown parameters are reported. */
function __prApplyComponentValues(component, values, keyframes) {
  var ignored = [];
  if (values) {
    for (var key in values) {
      if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
      var p = __prFindComponentProperty(component, key);
      if (!p) {
        ignored.push({ key: key, reason: "parameter not found" });
        continue;
      }
      try {
        p.setValue(values[key], true);
      } catch (eSet) {
        ignored.push({ key: key, reason: String(eSet.message || eSet) });
      }
    }
  }
  if (keyframes) {
    for (var k = 0; k < keyframes.length; k++) {
      var kf = keyframes[k];
      var kp = __prFindComponentProperty(component, kf.parameter);
      if (!kp) {
        ignored.push({ key: kf.parameter, reason: "parameter not found (keyframe)" });
        continue;
      }
      try {
        if (!kp.isTimeVarying()) kp.setTimeVarying(true);
        var t = new Time();
        t.seconds = kf.time;
        kp.addKey(t);
        kp.setValueAtKey(t, kf.value, true);
      } catch (eKf) {
        ignored.push({ key: kf.parameter, reason: "keyframe: " + String(eKf.message || eKf) });
      }
    }
  }
  return ignored;
}

function __prClipIndices(track, params) {
  var list = [];
  if (params.allClips === true) {
    for (var i = 0; i < track.clips.numItems; i++) list.push(i);
  } else if (params.clipIndices instanceof Array) {
    list = params.clipIndices;
  } else {
    list.push(typeof params.clipIndex === "number" ? params.clipIndex : 0);
  }
  return list;
}

/* ---------- timeline editing (razor, extract, slip, trim, move) ---------- */

/** Timecode of the frame at `sec`, read from QE's CTI so drop-frame and odd frame rates are right. */
function __prTcAt(seq, sec) {
  seq.setPlayerPosition(__prSecondsToTicks(sec));
  app.enableQE();
  return String(qe.project.getActiveSequence().CTI.timecode);
}

/** The clip and everything linked to it (video + audio), or the clip alone (links are lost on one-track razors). */
function __prGroup(item, linked) {
  var out = [];
  if (linked !== false) {
    var L = null;
    try {
      L = item.getLinkedItems();
    } catch (_eL) {
      L = null;
    }
    if (L && L.numItems) {
      for (var i = 0; i < L.numItems; i++) out.push(L[i]);
      return out;
    }
  }
  out.push(item);
  return out;
}

function __prDescribeItem(k) {
  return {
    name: String(k.name),
    mediaType: String(k.mediaType),
    track: k.parentTrackIndex,
    start: Math.round(k.start.seconds * 1000) / 1000,
    end: Math.round(k.end.seconds * 1000) / 1000,
    sourceIn: Math.round(k.inPoint.seconds * 1000) / 1000
  };
}

/** Target clip by trackType/trackIndex and clipIndex, or the clip under atSeconds on that track. */
function __prTargetClip(seq, params) {
  var track = __prGetTrack(seq, params.trackType || "video", typeof params.trackIndex === "number" ? params.trackIndex : 0);
  if (typeof params.atSeconds === "number") {
    for (var i = 0; i < track.clips.numItems; i++) {
      var c = track.clips[i];
      if (c.start.seconds - 0.0005 <= params.atSeconds && params.atSeconds < c.end.seconds) return c;
    }
    throw new Error("No clip under " + params.atSeconds + " s on " + (params.trackType || "video") + " track " + (params.trackIndex || 0) + ".");
  }
  return __prGetClip(track, params.clipIndex);
}

function __prTime(sec) {
  var t = new Time();
  t.seconds = sec;
  return t;
}

/** Nearest clip edge to `sec` on the given tracks (all when none): where a razor actually landed. */
function __prNearestEdge(seq, sec, tracks) {
  var best = null;
  var lists = [];
  var i;
  if (tracks && tracks.length) {
    for (i = 0; i < tracks.length; i++) lists.push(__prGetTrack(seq, tracks[i].type || "video", tracks[i].index));
  } else {
    for (i = 0; i < seq.videoTracks.numTracks; i++) lists.push(seq.videoTracks[i]);
    for (i = 0; i < seq.audioTracks.numTracks; i++) lists.push(seq.audioTracks[i]);
  }
  for (var t = 0; t < lists.length; t++) {
    for (var c = 0; c < lists[t].clips.numItems; c++) {
      var e = lists[t].clips[c].end.seconds;
      if (best === null || Math.abs(e - sec) < Math.abs(best - sec)) best = e;
    }
  }
  return best === null ? null : Math.round(best * 10000) / 10000;
}

/** Sets the In/Out to place a clip on its own: Premiere treats a negative tick count as "not set". */
function __prSeqPoint(seq, which) {
  try {
    var v = Number(which === "in" ? seq.getInPoint() : seq.getOutPoint());
    return v >= 0 ? v : null;
  } catch (_eP) {
    return null;
  }
}

/* ---------- motion graphics templates ---------- */

/** Fills a placed .mogrt by parameter display name; returns { available, set }. */
function __prSetMogrtValues(ti, vals) {
  var mgComp = ti.getMGTComponent ? ti.getMGTComponent() : null;
  var setReport = [];
  var available = [];
  if (!mgComp) return { available: available, set: setReport };
  for (var mp = 0; mp < mgComp.properties.numItems; mp++) available.push(String(mgComp.properties[mp].displayName));
  vals = vals || {};
  for (var key in vals) {
    if (!Object.prototype.hasOwnProperty.call(vals, key)) continue;
    var prop = mgComp.properties.getParamForDisplayName ? mgComp.properties.getParamForDisplayName(key) : null;
    if (!prop) prop = __prFindComponentProperty(mgComp, key);
    if (!prop) {
      setReport.push({ name: key, ok: false, reason: "not in the template" });
      continue;
    }
    var cur = prop.getValue();
    var v = vals[key];
    try {
      if (typeof cur === "string" && cur.charAt(0) === "{" && typeof v === "string") {
        // AE text parameters come as a JSON text document: replace only the text.
        var doc = JSON.parse(cur);
        doc.textEditValue = v;
        if (doc.fontTextRunLength) doc.fontTextRunLength = [v.length];
        prop.setValue(JSON.stringify(doc), true);
      } else {
        prop.setValue(v, true);
      }
      setReport.push({ name: key, ok: true });
    } catch (eMg) {
      setReport.push({ name: key, ok: false, reason: String(eMg.message || eMg) });
    }
  }
  return { available: available, set: setReport };
}

/** First text parameter of a placed .mogrt (its value is a JSON text document). */
function __prMogrtTextParam(ti) {
  var mgComp = ti.getMGTComponent ? ti.getMGTComponent() : null;
  if (!mgComp) return null;
  for (var i = 0; i < mgComp.properties.numItems; i++) {
    var v = null;
    try {
      v = mgComp.properties[i].getValue();
    } catch (_eV) {}
    if (typeof v === "string" && v.charAt(0) === "{" && v.indexOf("textEditValue") >= 0) return String(mgComp.properties[i].displayName);
  }
  return null;
}

function __mcpDispatch(action, params, _options) {
  if (action === "adobe.ping") {
    return { pong: true, app: "premiere", version: String(app.version), project: app.project ? String(app.project.name) : null };
  }
  if (params && params.expectedProject) {
    // Guard set by pr_expect_project: never write to a project other than the one the work is meant for.
    var nmExp = app.project && app.project.name ? String(app.project.name) : "";
    if (nmExp.toLowerCase() !== String(params.expectedProject).toLowerCase()) {
      __mcpFail(
        "PROJECT_MISMATCH",
        "The active Premiere project is '" + (nmExp || "none") + "', not '" + params.expectedProject + "'. Nothing was changed. " +
          "Activate the right project, or call pr_expect_project again (name, or clear: true)."
      );
    }
  }
  if (action === "adobe.checkpoint") {
    if (!app.project || !app.project.path) throw new Error("No open Premiere Pro project to checkpoint.");
    var cpR = app.project;
    var cpROrig = new File(cpR.path);
    cpR.save();
    var cpRDest = __mcpCheckpointFile(cpROrig.name, "prproj", params.label, params.folder, cpROrig);
    __mcpCopyFile(cpROrig, cpRDest);
    return {
      app: "premiere",
      project: String(cpR.name),
      checkpointPath: cpRDest.fsName,
      method: "saved the project, then copied the .prproj",
      savedOriginal: true,
      documentPathChanged: false
    };
  }
  params = params || {};

  if (action === "pr.batch") {
    return __mcpBatch(params, "pr");
  }

  if (action === "pr.project.getInfo") {
    var proj = __prRequireProject();
    var seqs = [];
    if (proj.sequences) {
      for (var i = 0; i < proj.sequences.numSequences; i++) {
        var s = proj.sequences[i];
        seqs.push({
          index: i,
          name: s.name,
          sequenceID: s.sequenceID,
          videoTracksCount: s.videoTracks ? s.videoTracks.numTracks : 0,
          audioTracksCount: s.audioTracks ? s.audioTracks.numTracks : 0
        });
      }
    }
    return {
      name: proj.name,
      path: proj.path,
      activeSequenceName: proj.activeSequence ? proj.activeSequence.name : null,
      sequencesCount: seqs.length,
      sequences: seqs,
      rootItems: __prCollectProjectItems(proj.rootItem, 0, 2)
    };
  }

  if (action === "pr.project.manage") {
    var op = params.operation || "save";
    if (op === "new") {
      var newF = __mcpPrepareOutputFile(params.filePath);
      if (!/\.prproj$/i.test(newF.fsName)) __mcpFail("INVALID_PARAMS", "filePath for a new project must end in .prproj.");
      if (newF.exists) __mcpFail("INVALID_PARAMS", "A project already exists at " + newF.fsName + "; open it instead.");
      var prevPath = app.project ? app.project.path : null;
      var createdNew = app.newProject(newF.fsName);
      // newProject leaves the previous project open and, for some calls (and the UXP panel), still active:
      // on 13/11/2026 pr_get_project_info kept reporting the old project. Close the others (saved first,
      // unless closePrevious is false) so the new one is the only, active project.
      var closedPrev = [];
      var projList = app.projects || { numProjects: 0 };
      if (params.closePrevious !== false && projList.numProjects) {
        for (var cpi = projList.numProjects - 1; cpi >= 0; cpi--) {
          var other = projList[cpi];
          if (other && !__mcpSamePath(other.path, newF.fsName)) {
            closedPrev.push(String(other.path));
            other.closeDocument(1, 0);
          }
        }
      }
      var activeNew = null;
      projList = app.projects || { numProjects: 0 };
      for (var api = 0; api < projList.numProjects; api++) {
        if (__mcpSamePath(projList[api].path, newF.fsName)) activeNew = projList[api];
      }
      if (!activeNew && app.project && __mcpSamePath(app.project.path, newF.fsName)) activeNew = app.project;
      if (!createdNew || !activeNew) {
        __mcpFail("SAVE_FAILED", "Premiere did not create the project at " + newF.fsName + ".");
      }
      if (app.project && !__mcpSamePath(app.project.path, newF.fsName) && typeof app.openDocument === "function") {
        app.openDocument(newF.fsName);
      }
      return {
        operation: "new",
        path: activeNew.path,
        active: app.project ? __mcpSamePath(app.project.path, newF.fsName) : false,
        previousProject: prevPath,
        closedProjects: closedPrev
      };
    }
    var projM = __prRequireProject();
    if (op === "save") {
      if (params.filePath) {
        var saveAsF = __mcpPrepareOutputFile(params.filePath);
        projM.saveAs(saveAsF.fsName);
        __mcpVerifySaved(saveAsF, app.project ? app.project.path : null);
        return { operation: "save", path: saveAsF.fsName };
      }
      projM.save();
      return { operation: "save", path: projM.path };
    }
    if (op === "open") {
      app.openDocument(params.filePath);
      return { operation: "open", filePath: params.filePath };
    }
    if (op === "createBin") {
      var newBin = projM.rootItem.createBin(params.binName || "New Bin");
      return { operation: "createBin", name: newBin ? newBin.name : params.binName };
    }
    throw new Error("Unsupported pr.project.manage operation: " + op);
  }

  if (action === "pr.media.import") {
    var projImp = __prRequireProject();
    var files = params.filePaths || (params.filePath ? [params.filePath] : []);
    if (files.length === 0) {
      throw new Error("Provide filePaths array to import.");
    }
    var targetBin = projImp.rootItem;
    if (params.targetBinName) {
      var foundBin = __prFindProjectItemByNameOrPath(projImp.rootItem, params.targetBinName);
      if (!foundBin || foundBin.type !== ProjectItemType.BIN) {
        // A missing bin is created at the project root instead of failing the import.
        foundBin = projImp.rootItem.createBin(String(params.targetBinName));
        if (!foundBin) foundBin = __prFindProjectItemByNameOrPath(projImp.rootItem, params.targetBinName);
      }
      if (!foundBin) {
        throw new Error("Bin '" + params.targetBinName + "' could not be created.");
      }
      targetBin = foundBin;
    }
    // After Effects projects come in through Dynamic Link. importFiles would open the
    // "Import After Effects Composition" dialog and block Premiere, so use the AE import calls.
    var plainFiles = [];
    var aeResults = [];
    for (var fi = 0; fi < files.length; fi++) {
      if (/\.aep$/i.test(String(files[fi]))) {
        var aepF = new File(files[fi]);
        if (!aepF.exists) throw new Error("After Effects project not found: " + files[fi]);
        var aeOk;
        if (params.aeCompNames && params.aeCompNames.length) {
          aeOk = projImp.importAEComps(aepF.fsName, params.aeCompNames, targetBin);
        } else {
          aeOk = projImp.importAllAEComps(aepF.fsName, targetBin);
        }
        aeResults.push({ project: aepF.fsName, comps: params.aeCompNames || "all", imported: Boolean(aeOk) });
      } else {
        plainFiles.push(files[fi]);
      }
    }
    var ok = plainFiles.length ? projImp.importFiles(plainFiles, true, targetBin, Boolean(params.importAsNumberedStills)) : true;
    var outImp = { imported: Boolean(ok), count: files.length, files: files };
    if (aeResults.length) outImp.dynamicLink = aeResults;
    return outImp;
  }

  if (action === "pr.sequence.getState") {
    var seq = __prRequireActiveSequence();
    var vTracks = [];
    for (var v = 0; v < seq.videoTracks.numTracks; v++) {
      var vt = seq.videoTracks[v];
      var vClips = [];
      for (var vc = 0; vc < vt.clips.numItems; vc++) {
        var cl = vt.clips[vc];
        vClips.push({
          index: vc,
          name: cl.name,
          startSeconds: cl.start ? cl.start.seconds : 0,
          endSeconds: cl.end ? cl.end.seconds : 0,
          durationSeconds: cl.duration ? cl.duration.seconds : 0,
          inPointSeconds: cl.inPoint ? cl.inPoint.seconds : 0,
          outPointSeconds: cl.outPoint ? cl.outPoint.seconds : 0,
          disabled: Boolean(cl.disabled)
        });
      }
      vTracks.push({
        index: v,
        name: vt.name,
        isMuted: Boolean(vt.isMuted && vt.isMuted()),
        clipsCount: vClips.length,
        clips: vClips
      });
    }

    var aTracks = [];
    for (var a = 0; a < seq.audioTracks.numTracks; a++) {
      var at = seq.audioTracks[a];
      var aClips = [];
      for (var ac = 0; ac < at.clips.numItems; ac++) {
        var acl = at.clips[ac];
        aClips.push({
          index: ac,
          name: acl.name,
          startSeconds: acl.start ? acl.start.seconds : 0,
          endSeconds: acl.end ? acl.end.seconds : 0,
          durationSeconds: acl.duration ? acl.duration.seconds : 0,
          disabled: Boolean(acl.disabled)
        });
      }
      aTracks.push({
        index: a,
        name: at.name,
        isMuted: Boolean(at.isMuted && at.isMuted()),
        clipsCount: aClips.length,
        clips: aClips
      });
    }

    var playheadPos = seq.getPlayerPosition ? seq.getPlayerPosition().seconds : 0;

    return {
      name: seq.name,
      sequenceID: seq.sequenceID,
      frameSizeHorizontal: seq.frameSizeHorizontal,
      frameSizeVertical: seq.frameSizeVertical,
      playheadSeconds: playheadPos,
      videoTracks: vTracks,
      audioTracks: aTracks
    };
  }

  if (action === "pr.sequence.create") {
    var projSeq = __prRequireProject();
    if (params.fromClipName) {
      var mediaItem = __prFindProjectItemByNameOrPath(projSeq.rootItem, params.fromClipName);
      if (!mediaItem) throw new Error("Clip not found in project: " + params.fromClipName);
      var createdSeq = projSeq.createNewSequenceFromClips(params.name || "Sequence 01", [mediaItem], projSeq.rootItem);
      var cleared = 0;
      if (params.empty) {
        // keep the clip's format (size, fps, audio) but start with an empty timeline
        var groups = [createdSeq.videoTracks, createdSeq.audioTracks];
        for (var g = 0; g < groups.length; g++) {
          for (var ti = 0; ti < groups[g].numTracks; ti++) {
            var cl = groups[g][ti].clips;
            for (var ci = cl.numItems - 1; ci >= 0; ci--) { cl[ci].remove(false, false); cleared++; }
          }
        }
      }
      return { name: createdSeq.name, sequenceID: createdSeq.sequenceID, clearedClips: cleared };
    }
    // project.createNewSequence() opens the New Sequence dialog and blocks the app, so it is never called:
    // the sequence is made from a preset file through QE, which shows nothing.
    var presetFile = null;
    if (params.presetPath) {
      presetFile = new File(params.presetPath);
      if (!presetFile.exists) throw new Error("Sequence preset not found: " + params.presetPath);
    } else {
      var appRoot = String(app.path).replace(/[\\\/]+$/, "");
      var presetRoots = [appRoot + "/Settings/SequencePresets", appRoot + "/Contents/Settings/SequencePresets"];
      var wanted = ["HD 1080p/HD 1080p 29.97 fps.sqpreset", "HD 1080p/HD 1080p 30 fps.sqpreset", "HD 1080p/HD 1080p 25 fps.sqpreset"];
      for (var pr0 = 0; pr0 < presetRoots.length && !presetFile; pr0++) {
        for (var pw0 = 0; pw0 < wanted.length && !presetFile; pw0++) {
          var cand = new File(presetRoots[pr0] + "/" + wanted[pw0]);
          if (cand.exists) presetFile = cand;
        }
        if (!presetFile) {
          var hd = new Folder(presetRoots[pr0] + "/HD 1080p");
          var any = hd.exists ? hd.getFiles("*.sqpreset") : [];
          if (any.length) presetFile = any[0];
        }
      }
    }
    if (!presetFile) {
      throw new Error("No sequence preset file was found, and creating a sequence without one would open the New Sequence dialog. Pass presetPath (a .sqpreset) or fromClipName.");
    }
    var seqName = params.name || "Sequence 01";
    app.enableQE();
    var madeSeq = qe.project.newSequence(seqName, presetFile.fsName);
    var activeNew = projSeq.activeSequence;
    if (!madeSeq || !activeNew || activeNew.name !== seqName) throw new Error("Premiere did not create the sequence from preset " + presetFile.fsName);
    return { name: activeNew.name, sequenceID: activeNew.sequenceID, preset: presetFile.displayName };
  }

  if (action === "pr.timeline.placeClip") {
    var projPlace = __prRequireProject();
    var seqPlace = __prRequireActiveSequence();
    var clipItem = __prFindProjectItemByNameOrPath(projPlace.rootItem, params.clipNameOrPath);
    if (!clipItem) {
      throw new Error("Project item not found: " + params.clipNameOrPath);
    }
    var trackIdx = params.videoTrackIndex || 0;
    var vTrack = seqPlace.videoTracks[trackIdx];
    if (!vTrack) {
      throw new Error("Video track index out of bounds: " + trackIdx);
    }
    var timeTicks = __prSecondsToTicks(params.timeSeconds || 0);
    if (params.mode === "insert") {
      vTrack.insertClip(clipItem, timeTicks);
    } else {
      vTrack.overwriteClip(clipItem, timeTicks);
    }
    return {
      placed: true,
      mode: params.mode || "overwrite",
      clipName: clipItem.name,
      videoTrackIndex: trackIdx,
      timeSeconds: params.timeSeconds || 0
    };
  }

  if (action === "pr.timeline.modifyClip") {
    var seqMod = __prRequireActiveSequence();
    var trackType = params.trackType || "video";
    var trk = (trackType === "audio")
      ? seqMod.audioTracks[params.trackIndex || 0]
      : seqMod.videoTracks[params.trackIndex || 0];
    if (!trk) throw new Error("Track not found.");
    var tClip = trk.clips[params.clipIndex || 0];
    if (!tClip) throw new Error("Clip not found at index " + (params.clipIndex || 0));

    if (typeof params.disabled === "boolean") {
      tClip.disabled = params.disabled;
    }
    if (params.remove === true) {
      tClip.remove(Boolean(params.ripple), Boolean(params.alignToVideo));
      return { removed: true };
    }
    if (params.componentProperties && tClip.components) {
      for (var ci = 0; ci < tClip.components.numItems; ci++) {
        var comp = tClip.components[ci];
        if (!params.componentName || comp.displayName === params.componentName || comp.matchName === params.componentName) {
          for (var pi = 0; pi < comp.properties.numItems; pi++) {
            var prop = comp.properties[pi];
            if (Object.prototype.hasOwnProperty.call(params.componentProperties, prop.displayName)) {
              prop.setValue(params.componentProperties[prop.displayName], true);
            }
          }
        }
      }
    }
    return { updated: true, clipName: tClip.name };
  }

  if (action === "pr.markers.manage") {
    var seqMk = __prRequireActiveSequence();
    var markers = seqMk.markers;
    var mOp = params.operation || "add";
    if (mOp === "add") {
      var mk = markers.createMarker(params.timeSeconds || 0);
      if (params.name) mk.name = params.name;
      if (params.comments) mk.comments = params.comments;
      if (typeof params.durationSeconds === "number") {
        mk.end = (params.timeSeconds || 0) + params.durationSeconds;
      }
      return { operation: "add", name: mk.name, timeSeconds: params.timeSeconds || 0 };
    }
    if (mOp === "list") {
      var mList = [];
      var cur = markers.getFirstMarker();
      while (cur) {
        mList.push({
          name: cur.name,
          comments: cur.comments,
          startSeconds: cur.start ? cur.start.seconds : 0,
          endSeconds: cur.end ? cur.end.seconds : 0
        });
        cur = markers.getNextMarker(cur);
      }
      return { count: mList.length, markers: mList };
    }
    throw new Error("Unsupported pr.markers.manage operation: " + mOp);
  }

  if (action === "pr.effect.list") {
    return { kind: params.kind, names: __prQeNameList(params.kind || "videoEffects") };
  }

  if (action === "pr.clip.speed") {
    var seqSp = __prRequireActiveSequence();
    var trackSp = __prGetTrack(seqSp, "video", params.trackIndex);
    var clipSp = __prTargetClip(seqSp, params);
    var idxSp = -1;
    for (var sI = 0; sI < trackSp.clips.numItems; sI++) { if (trackSp.clips[sI].nodeId === clipSp.nodeId) idxSp = sI; }
    var qeSp = __prQeClipAt(__prQeTrack("video", params.trackIndex), idxSp);
    var beforeSp = { start: clipSp.start.seconds, end: clipSp.end.seconds };
    params.__previousSpeed = clipSp.getSpeed();
    if (typeof params.speedPercent === "number" || typeof params.reverse === "boolean") {
      var pctSp = typeof params.speedPercent === "number" ? params.speedPercent : 100;
      if (!(pctSp > 0)) __mcpFail("INVALID_PARAMS", "speedPercent must be greater than 0 (100 = normal, 50 = half speed).");
      qeSp.setSpeed(pctSp / 100, "", !!params.reverse, params.ripple !== false, false);
    }
    if (params.frameInterpolation) {
      var modesSp = { frameSampling: 0, frameBlending: 1, opticalFlow: 2 };
      if (modesSp[params.frameInterpolation] === undefined) __mcpFail("INVALID_PARAMS", "frameInterpolation must be frameSampling, frameBlending or opticalFlow.");
      qeSp.setTimeInterpolationType(modesSp[params.frameInterpolation]);
    }
    var afterSp = __prTargetClip(seqSp, { trackIndex: params.trackIndex, clipIndex: idxSp });
    // A clip cut out of a longer source has spare material after its out point, and Premiere then keeps the
    // duration and shows more of the source instead of shortening the clip (measured 21/11/2026: 2 s at 200 % stayed
    // 2 s). Bring the end to where the same content ends at the new speed, and close the gap when ripple is on.
    var trimmedSp = false;
    var warnSp = [];
    if (typeof params.speedPercent === "number" && params.keepDuration !== true) {
      var oldRate = Math.abs(Number(params.__previousSpeed) || 1);
      // Use the speed Premiere actually applied: on some cut clips it applies less than what was asked.
      var newRate = Math.abs(Number(afterSp.getSpeed()) || params.speedPercent / 100);
      var wantEnd = beforeSp.start + ((beforeSp.end - beforeSp.start) * oldRate) / newRate;
      var deltaSp = afterSp.end.seconds - wantEnd;
      var mv;
      if (deltaSp > 0.02) {
        // faster: shorten the clip, then pull the next clips up
        afterSp.end = __prTime(wantEnd);
        trimmedSp = true;
        if (params.ripple !== false) {
          for (mv = idxSp + 1; mv < trackSp.clips.numItems; mv++) {
            try { trackSp.clips[mv].move(-deltaSp); } catch (_eMv) {}
          }
        }
        afterSp = __prTargetClip(seqSp, { trackIndex: params.trackIndex, clipIndex: idxSp });
      } else if (deltaSp < -0.02) {
        // slower: the clip needs more room. Push the next clips later first (last one first, so none lands on
        // another), then lengthen the clip into the space. Without ripple it would cover the next clip.
        var growSp = -deltaSp;
        var hasNextSp = idxSp + 1 < trackSp.clips.numItems;
        if (hasNextSp && params.ripple === false) {
          warnSp.push("The clip plays slower but keeps its length, so the end of its content is cut off: lengthening it would cover the next clip. Use ripple (default) to push the next clips later.");
        } else {
          for (mv = trackSp.clips.numItems - 1; mv > idxSp; mv--) {
            try { trackSp.clips[mv].move(growSp); } catch (_eMv2) {}
          }
          afterSp.end = __prTime(wantEnd);
          afterSp = __prTargetClip(seqSp, { trackIndex: params.trackIndex, clipIndex: idxSp });
          trimmedSp = true;
          var shortSp = wantEnd - afterSp.end.seconds;
          if (shortSp > 0.02) {
            // Premiere stopped the end earlier (not enough source material): close the gap that would be left
            for (mv = idxSp + 1; mv < trackSp.clips.numItems; mv++) {
              try { trackSp.clips[mv].move(-shortSp); } catch (_eMv3) {}
            }
            warnSp.push("Premiere lengthened the clip only to " + (Math.round(afterSp.end.seconds * 1000) / 1000) + " s instead of " + (Math.round(wantEnd * 1000) / 1000) + " s (not enough source material after the cut), so the end of its content is cut off.");
          }
        }
      }
    }
    var gotSp = Math.round(afterSp.getSpeed() * 10000) / 100;
    if (typeof params.speedPercent === "number" && Math.abs(gotSp - params.speedPercent) > 1) {
      warnSp.push("Premiere applied " + gotSp + " % instead of " + params.speedPercent + " %. This happens on some clips cut out of a longer source; check the clip, or apply the speed before cutting.");
    }
    return { clip: afterSp.name, speedPercent: gotSp, reversed: afterSp.isSpeedReversed() ? true : false, before: beforeSp, after: { start: afterSp.start.seconds, end: afterSp.end.seconds }, trimmedToNewSpeed: trimmedSp, warnings: warnSp };
  }

  if (action === "pr.sequence.points") {
    var seqPt = __prRequireActiveSequence();
    var opPt = params.operation || "get";
    if (opPt === "setInOut") {
      if (typeof params.inSeconds === "number") seqPt.setInPoint(params.inSeconds);
      if (typeof params.outSeconds === "number") seqPt.setOutPoint(params.outSeconds);
    } else if (opPt === "workArea") {
      if (typeof params.enabled === "boolean") seqPt.setWorkAreaEnabled(params.enabled);
      // the work area setters take ticks (the in/out point setters take seconds)
      if (typeof params.inSeconds === "number") seqPt.setWorkAreaInPoint(__prSecondsToTicks(params.inSeconds));
      if (typeof params.outSeconds === "number") seqPt.setWorkAreaOutPoint(__prSecondsToTicks(params.outSeconds));
      var waIn = Number(seqPt.getWorkAreaInPoint()), waOut = Number(seqPt.getWorkAreaOutPoint());
      if ((typeof params.inSeconds === "number" && Math.abs(waIn - params.inSeconds) > 0.05) || (typeof params.outSeconds === "number" && Math.abs(waOut - params.outSeconds) > 0.05)) {
        __mcpFail("NOT_APPLIED", "Premiere did not move the work area (it stayed at " + waIn + "-" + waOut + " s): this version ignores the script call. Use setInOut, which works, or set the work area by hand.");
      }
    } else if (opPt === "addTracks") {
      var nV = Number(params.video) || 0, nA = Number(params.audio) || 0;
      if (!nV && !nA) __mcpFail("INVALID_PARAMS", "addTracks needs video and/or audio: how many tracks to add.");
      app.enableQE();
      var qeSeqPt = qe.project.getActiveSequence();
      qeSeqPt.addTracks(nV, seqPt.videoTracks.numTracks - 1, nA, 1, seqPt.audioTracks.numTracks - 1, 0, 0, 0);
    } else if (opPt !== "get") {
      __mcpFail("INVALID_PARAMS", "operation must be get, setInOut, workArea or addTracks.");
    }
    // Premiere answers -400000 for an in/out point that is not set
    var numPt = function (v) { var n = Number(v); return isNaN(n) || n < -1000 ? null : Math.round(n * 1000) / 1000; };
    return {
      sequence: seqPt.name, operation: opPt,
      inSeconds: numPt(seqPt.getInPoint()), outSeconds: numPt(seqPt.getOutPoint()),
      workArea: { enabled: seqPt.isWorkAreaEnabled() ? true : false, inSeconds: numPt(seqPt.getWorkAreaInPoint()), outSeconds: numPt(seqPt.getWorkAreaOutPoint()) },
      videoTracks: seqPt.videoTracks.numTracks, audioTracks: seqPt.audioTracks.numTracks
    };
  }

  if (action === "pr.item.label") {
    var projLb = __prRequireProject();
    var namesLb = params.clipNames || [];
    if (!namesLb.length) __mcpFail("INVALID_PARAMS", "clipNames is required: names of items in the Project panel.");
    var colorLb = Number(params.label);
    if (isNaN(colorLb) || colorLb < 0 || colorLb > 15) __mcpFail("INVALID_PARAMS", "label must be a number from 0 to 15 (the label colours in the order of Premiere's preferences).");
    var doneLb = [], missLb = [];
    for (var lb = 0; lb < namesLb.length; lb++) {
      var itLb = __prFindProjectItemByNameOrPath(projLb.rootItem, namesLb[lb]);
      if (!itLb) { missLb.push(namesLb[lb]); continue; }
      itLb.setColorLabel(colorLb);
      doneLb.push({ name: itLb.name, label: itLb.getColorLabel() });
    }
    if (!doneLb.length) __mcpFail("CLIP_NOT_FOUND", "None of the items was found in the Project panel: " + missLb.join(", "));
    return { labelled: doneLb, notFound: missLb };
  }

  if (action === "pr.color") {
    // Lumetri Color on a clip with the same control names as the Camera Raw and Lightroom tools.
    var seqCo = __prRequireActiveSequence();
    var trackCo = __prGetTrack(seqCo, "video", params.trackIndex);
    var clipCo = __prTargetClip(seqCo, params);
    var idxCo = -1;
    for (var cI = 0; cI < trackCo.clips.numItems; cI++) { if (trackCo.clips[cI].nodeId === clipCo.nodeId) idxCo = cI; }
    var mapCo = { temperature: "Temperature", tint: "Tint", exposure: "Exposure", contrast: "Contrast", highlights: "Highlights", shadows: "Shadows", whites: "Whites", blacks: "Blacks", saturation: "Saturation", vibrance: "Vibrance", sharpen: "Sharpen", fadedFilm: "Faded Film" };
    var compCo = __prFindComponent(clipCo, "Lumetri Color") || __prFindComponent(clipCo, "AE.ADBE Lumetri");
    var addedCo = false;
    if (!compCo) {
      var effCo = qe.project.getVideoEffectByName(__prCanonicalName("videoEffects", "Lumetri Color"));
      if (!effCo) { var nfCo = new Error("The Lumetri Color effect was not found under that name (effect names follow Premiere's language). Use pr_list_effects and pr_apply_effect."); nfCo.name = "EFFECT_NOT_FOUND"; throw nfCo; }
      var beforeCo = clipCo.components.numItems;
      __prQeClipAt(__prQeTrack("video", params.trackIndex), idxCo).addVideoEffect(effCo);
      if (clipCo.components.numItems <= beforeCo) throw new Error("Premiere did not add Lumetri Color to the clip.");
      compCo = clipCo.components[clipCo.components.numItems - 1];
      addedCo = true;
    }
    var valuesCo = {}, unknownCo = [], sCo = params.settings || {};
    for (var kCo in sCo) { if (!sCo.hasOwnProperty(kCo)) continue; if (!mapCo[kCo]) unknownCo.push(kCo); else valuesCo[mapCo[kCo]] = sCo[kCo]; }
    if (unknownCo.length) __mcpFail("INVALID_PARAMS", "Unknown colour settings: " + unknownCo.join(", ") + ". Available: temperature, tint, exposure, contrast, highlights, shadows, whites, blacks, saturation, vibrance, sharpen, fadedFilm.");
    var ignoredCo = __prApplyComponentValues(compCo, valuesCo, null);
    var readCo = {};
    for (var rCo in mapCo) { if (!mapCo.hasOwnProperty(rCo)) continue; var pCo = __prFindComponentProperty(compCo, mapCo[rCo]); if (pCo) readCo[rCo] = __prSafeValue(pCo); }
    return { clip: clipCo.name, effectAdded: addedCo, values: readCo, ignored: ignoredCo };
  }

  if (action === "pr.effect.apply") {
    var seqEa = __prRequireActiveSequence();
    var typeEa = params.trackType === "audio" ? "audio" : "video";
    var trackEa = __prGetTrack(seqEa, typeEa, params.trackIndex);
    var qeTrackEa = __prQeTrack(typeEa, params.trackIndex);
    var effName = __prCanonicalName(typeEa === "audio" ? "audioEffects" : "videoEffects", params.effectName);
    var effObj = typeEa === "audio" ? qe.project.getAudioEffectByName(effName) : qe.project.getVideoEffectByName(effName);
    if (!effObj) {
      var nf = new Error("Effect '" + params.effectName + "' not found. Names follow Premiere's language; use pr_list_effects.");
      nf.name = "EFFECT_NOT_FOUND";
      throw nf;
    }
    var indicesEa = __prClipIndices(trackEa, params);
    var appliedEa = [];
    for (var ia = 0; ia < indicesEa.length; ia++) {
      var domClip = __prGetClip(trackEa, indicesEa[ia]);
      var before = domClip.components.numItems;
      var qeClipEa = __prQeClipAt(qeTrackEa, indicesEa[ia]);
      if (typeEa === "audio") qeClipEa.addAudioEffect(effObj);
      else qeClipEa.addVideoEffect(effObj);
      var added = domClip.components.numItems > before ? domClip.components[domClip.components.numItems - 1] : null;
      if (!added) {
        throw new Error("Premiere did not add '" + effName + "' to clip " + indicesEa[ia] + " (" + domClip.name + ").");
      }
      var ignoredEa = added ? __prApplyComponentValues(added, params.parameters, params.keyframes) : [];
      var askedKeys = {};
      var askedCount = 0;
      var pk;
      if (params.parameters) for (pk in params.parameters) if (!askedKeys[pk]) { askedKeys[pk] = 1; askedCount++; }
      if (params.keyframes) for (var kq = 0; kq < params.keyframes.length; kq++) if (!askedKeys[params.keyframes[kq].parameter]) { askedKeys[params.keyframes[kq].parameter] = 1; askedCount++; }
      var ignoredNames = {};
      var ignoredCount = 0;
      for (var iq = 0; iq < ignoredEa.length; iq++) if (!ignoredNames[ignoredEa[iq].key]) { ignoredNames[ignoredEa[iq].key] = 1; ignoredCount++; }
      if (askedCount > 0 && ignoredCount === askedCount) {
        // Two installed effects can share a display name (native "Gaussian Blur" and a third-party one,
        // 13/11/2026): QE picks the first. None of the requested parameters exist, so this is the wrong one.
        var wrongMatch = String(added.matchName);
        __prQeRemoveComponentNamed(qeClipEa, String(added.displayName));
        var amb = new Error(
          "'" + effName + "' resolved to " + wrongMatch + ", which has none of the parameters asked for (" +
            ignoredEa[0].key + "...). It was removed again. Another installed effect probably shares this name: " +
            "pick a unique name with pr_list_effects (e.g. the '(Legacy)' variant)."
        );
        amb.name = "EFFECT_AMBIGUOUS";
        throw amb;
      }
      appliedEa.push({
        clipIndex: indicesEa[ia],
        clipName: String(domClip.name),
        component: added ? __prDescribeComponents(domClip)[domClip.components.numItems - 1] : null,
        ignoredParameters: ignoredEa
      });
    }
    var outEa = { effectName: effName, trackType: typeEa, trackIndex: params.trackIndex || 0, clips: appliedEa };
    if (appliedEa.length && appliedEa[0].component && !/^AE\.ADBE |^AE\.ADBE$|^ADBE/.test(String(appliedEa[0].component.matchName))) {
      outEa.warnings = ["'" + effName + "' is a third-party effect (" + appliedEa[0].component.matchName + "); check it is the one you meant."];
    }
    return outEa;
  }

  if (action === "pr.effect.setParams") {
    var seqSp = __prRequireActiveSequence();
    var trackSp = __prGetTrack(seqSp, params.trackType === "audio" ? "audio" : "video", params.trackIndex);
    var indicesSp = __prClipIndices(trackSp, params);
    var resultsSp = [];
    for (var is = 0; is < indicesSp.length; is++) {
      var clipSp = __prGetClip(trackSp, indicesSp[is]);
      var compSp = __prFindComponent(clipSp, typeof params.componentIndex === "number" ? params.componentIndex : params.componentName);
      if (!compSp) {
        throw new Error("Component '" + String(params.componentName || params.componentIndex) + "' not found on clip " + indicesSp[is] + ". Use pr_list_clip_effects.");
      }
      var ignoredSp = __prApplyComponentValues(compSp, params.parameters, params.keyframes);
      resultsSp.push({ clipIndex: indicesSp[is], component: String(compSp.displayName), ignoredParameters: ignoredSp });
    }
    return { updated: resultsSp };
  }

  if (action === "pr.effect.listOnClip") {
    var seqLc = __prRequireActiveSequence();
    var trackLc = __prGetTrack(seqLc, params.trackType === "audio" ? "audio" : "video", params.trackIndex);
    var clipLc = __prGetClip(trackLc, params.clipIndex);
    return { clipName: String(clipLc.name), components: __prDescribeComponents(clipLc) };
  }

  if (action === "pr.transition.apply") {
    var seqTr = __prRequireActiveSequence();
    var typeTr = params.trackType === "audio" ? "audio" : "video";
    var trackTr = __prGetTrack(seqTr, typeTr, params.trackIndex);
    var qeTrackTr = __prQeTrack(typeTr, params.trackIndex);
    var transName = __prCanonicalName(typeTr === "audio" ? "audioTransitions" : "videoTransitions", params.transitionName);
    var transObj = typeTr === "audio"
      ? qe.project.getAudioTransitionByName(transName)
      : qe.project.getVideoTransitionByName(transName);
    if (!transObj) {
      var tnf = new Error("Transition '" + params.transitionName + "' not found. Names follow Premiere's language; use pr_list_effects with kind videoTransitions.");
      tnf.name = "EFFECT_NOT_FOUND";
      throw tnf;
    }
    var fps = 30;
    try {
      fps = 1 / seqTr.getSettings().videoFrameRate.seconds;
    } catch (_eF) {}
    var durFrames = typeof params.durationSeconds === "number" ? Math.max(1, Math.round(params.durationSeconds * fps)) : null;
    var warningsTr = [];
    var addOne = function (qeItem, atStart) {
      if (durFrames !== null) {
        try {
          qeItem.addTransition(transObj, atStart, String(durFrames), "0", 0.5, false, true);
          return;
        } catch (eDur) {
          warningsTr.push("Custom duration not accepted by this Premiere version; default duration used.");
        }
      }
      qeItem.addTransition(transObj, atStart);
    };
    var placed = [];
    if (params.allCuts === true) {
      for (var c = 0; c < trackTr.clips.numItems - 1; c++) {
        var a = trackTr.clips[c];
        var b = trackTr.clips[c + 1];
        if (Math.abs(a.end.seconds - b.start.seconds) < 0.001) {
          addOne(__prQeClipAt(qeTrackTr, c), false);
          placed.push({ cutAfterClip: c, atSeconds: a.end.seconds });
        }
      }
    } else {
      var idxTr = typeof params.clipIndex === "number" ? params.clipIndex : 0;
      __prGetClip(trackTr, idxTr);
      var pos = params.position || "end";
      if (pos === "start" || pos === "both") {
        addOne(__prQeClipAt(qeTrackTr, idxTr), true);
        placed.push({ clipIndex: idxTr, edge: "start" });
      }
      if (pos === "end" || pos === "both") {
        addOne(__prQeClipAt(qeTrackTr, idxTr), false);
        placed.push({ clipIndex: idxTr, edge: "end" });
      }
    }
    var onTrack = null;
    try {
      onTrack = trackTr.transitions.numItems;
    } catch (_eT) {}
    return { transitionName: transName, trackType: typeTr, trackIndex: params.trackIndex || 0, placed: placed, count: placed.length, transitionsOnTrack: onTrack, warnings: warningsTr };
  }

  if (action === "pr.audio.setVolume") {
    var seqVo = __prRequireActiveSequence();
    var trackVo = __prGetTrack(seqVo, "audio", params.trackIndex);
    var indicesVo = __prClipIndices(trackVo, params);
    var level = Math.pow(10, (Number(params.db) - 15) / 20);
    var doneVo = [];
    for (var iv = 0; iv < indicesVo.length; iv++) {
      var clipVo = __prGetClip(trackVo, indicesVo[iv]);
      var volume = null;
      for (var cv = 0; cv < clipVo.components.numItems; cv++) {
        var cand = clipVo.components[cv];
        if (String(cand.matchName) === "audioVolume" || String(cand.displayName) === "Volume") {
          volume = cand;
          break;
        }
      }
      if (!volume) throw new Error("Clip " + indicesVo[iv] + " has no Volume component.");
      var levelProp = volume.properties[1] || volume.properties[0];
      for (var vp = 0; vp < volume.properties.numItems; vp++) {
        if (String(volume.properties[vp].displayName) === "Level") levelProp = volume.properties[vp];
      }
      levelProp.setValue(level, true);
      doneVo.push({ clipIndex: indicesVo[iv], clipName: String(clipVo.name), db: Number(params.db), levelValue: level });
    }
    return { trackIndex: params.trackIndex || 0, clips: doneVo };
  }

  if (action === "pr.captions.import") {
    // SRT/SCC/XML → caption track (ExtendScript createCaptionTrack; UXP has no equivalent yet).
    var projCap = __prRequireProject();
    var seqCap = __prRequireActiveSequence();
    var capFile = new File(params.filePath);
    if (!capFile.exists) __mcpFail("FILE_NOT_FOUND", "Caption file not found: " + params.filePath);
    var capItem = __prFindProjectItemWhere(projCap.rootItem, function (c) {
      return c.type !== ProjectItemType.BIN && c.getMediaPath && c.getMediaPath() === capFile.fsName;
    });
    if (!capItem) {
      projCap.importFiles([capFile.fsName], true, projCap.getInsertionBin(), false);
      capItem = __prFindProjectItemWhere(projCap.rootItem, function (c) {
        return c.type !== ProjectItemType.BIN && c.getMediaPath && c.getMediaPath() === capFile.fsName;
      });
    }
    if (!capItem) __mcpFail("IMPORT_FAILED", "Premiere did not import " + params.filePath + " as captions.");
    var formats = {
      subtitle: Sequence.CAPTION_FORMAT_SUBTITLE,
      cea608: Sequence.CAPTION_FORMAT_608,
      cea708: Sequence.CAPTION_FORMAT_708,
      teletext: Sequence.CAPTION_FORMAT_TELETEXT,
      ebu: Sequence.CAPTION_FORMAT_OPEN_EBU,
      op42: Sequence.CAPTION_FORMAT_OP42,
      op47: Sequence.CAPTION_FORMAT_OP47
    };
    var fmtKey = params.format || "subtitle";
    var fmtVal = typeof formats[fmtKey] !== "undefined" ? formats[fmtKey] : Sequence.CAPTION_FORMAT_SUBTITLE;
    var before = seqCap.captionTracks ? seqCap.captionTracks.numTracks : -1;
    var okCap = seqCap.createCaptionTrack(capItem, Number(params.startSeconds) || 0, fmtVal);
    var after = seqCap.captionTracks ? seqCap.captionTracks.numTracks : -1;
    return {
      created: okCap !== false,
      captionItem: String(capItem.name),
      format: fmtKey,
      startSeconds: Number(params.startSeconds) || 0,
      captionTracksBefore: before,
      captionTracksAfter: after,
      note: "Caption style (font, size, background) is set in Premiere's Essential Graphics / Properties panel or with a caption style preset."
    };
  }

  if (action === "pr.cut.assemble") {
    // Places only the kept ranges of one source clip, back to back (= removing the pauses), audio included.
    var projAs = __prRequireProject();
    var seqAs = __prRequireActiveSequence();
    var itemAs = __prFindProjectItemByNameOrPath(projAs.rootItem, params.clipNameOrPath);
    if (!itemAs) throw new Error("Project item not found: " + params.clipNameOrPath);
    var vIdx = typeof params.videoTrackIndex === "number" ? params.videoTrackIndex : 0;
    var trackAs = seqAs.videoTracks[vIdx];
    if (!trackAs) __mcpFail("INVALID_PARAMS", "Video track index out of bounds: " + vIdx);
    var keep = params.keep || [];
    if (!keep.length) __mcpFail("INVALID_PARAMS", "keep is empty.");
    var at = Number(params.timeSeconds) || 0;
    var placed = [];
    var hadIn = itemAs.getInPoint ? itemAs.getInPoint().seconds : 0;
    var hadOut = itemAs.getOutPoint ? itemAs.getOutPoint().seconds : 0;
    var mediaType = 4; // 4 = video + audio
    try {
      for (var kk = 0; kk < keep.length; kk++) {
        var rg = keep[kk];
        var len = Number(rg.end) - Number(rg.start);
        if (!(len > 0.02)) continue;
        itemAs.setInPoint(__prSecondsToTicks(rg.start), mediaType);
        itemAs.setOutPoint(__prSecondsToTicks(rg.end), mediaType);
        trackAs.overwriteClip(itemAs, __prSecondsToTicks(at));
        placed.push({ sourceStart: Number(rg.start), sourceEnd: Number(rg.end), timelineStart: Math.round(at * 1000) / 1000 });
        at += len;
      }
    } finally {
      try {
        itemAs.setInPoint(__prSecondsToTicks(hadIn), mediaType);
        if (hadOut > hadIn) itemAs.setOutPoint(__prSecondsToTicks(hadOut), mediaType);
        else if (itemAs.clearOutPoint) itemAs.clearOutPoint();
      } catch (_eRestore) {}
    }
    return { clip: String(itemAs.name), videoTrackIndex: vIdx, segments: placed.length, placed: placed, endSeconds: Math.round(at * 1000) / 1000 };
  }

  if (action === "pr.audio.keyframes") {
    // Volume keyframes in SEQUENCE seconds (converted to each clip's media time) — music ducking, fades.
    var seqAk = __prRequireActiveSequence();
    var trackAk = __prGetTrack(seqAk, "audio", params.trackIndex);
    var indicesAk = __prClipIndices(trackAk, params);
    var keysAk = params.keys || [];
    var report = [];
    for (var ia = 0; ia < indicesAk.length; ia++) {
      var clipAk = __prGetClip(trackAk, indicesAk[ia]);
      var vol = null;
      for (var ca = 0; ca < clipAk.components.numItems; ca++) {
        var cc = clipAk.components[ca];
        if (String(cc.matchName) === "audioVolume" || String(cc.displayName) === "Volume") {
          vol = cc;
          break;
        }
      }
      if (!vol) throw new Error("Clip " + indicesAk[ia] + " has no Volume component.");
      var lvl = null;
      for (var vq = 0; vq < vol.properties.numItems; vq++) {
        if (String(vol.properties[vq].displayName) === "Level") lvl = vol.properties[vq];
      }
      if (!lvl) lvl = vol.properties[1];
      var cStart = clipAk.start.seconds;
      var cEnd = clipAk.end.seconds;
      var cIn = clipAk.inPoint.seconds;
      if (params.clearExisting !== false && lvl.isTimeVarying()) {
        lvl.setTimeVarying(false);
      }
      if (!lvl.isTimeVarying()) lvl.setTimeVarying(true);
      var n = 0;
      for (var ki = 0; ki < keysAk.length; ki++) {
        var kt = Number(keysAk[ki].time);
        if (kt < cStart - 0.001 || kt > cEnd + 0.001) continue;
        var tk = new Time();
        tk.seconds = kt - cStart + cIn;
        lvl.addKey(tk);
        lvl.setValueAtKey(tk, Math.pow(10, (Number(keysAk[ki].db) - 15) / 20), true);
        n++;
      }
      report.push({ clipIndex: indicesAk[ia], clipName: String(clipAk.name), keysSet: n, clipStart: cStart, clipEnd: cEnd });
    }
    return { trackIndex: params.trackIndex || 0, clips: report };
  }

  if (action === "pr.mogrt.insert") {
    // Motion Graphics template (.mogrt from AE or Premiere) on the timeline, with its text/values set.
    var seqMg = __prRequireActiveSequence();
    var mgFile = new File(params.filePath);
    if (!mgFile.exists) __mcpFail("FILE_NOT_FOUND", "MOGRT not found: " + params.filePath);
    var vMg = typeof params.videoTrackIndex === "number" ? params.videoTrackIndex : 1;
    var aMg = typeof params.audioTrackIndex === "number" ? params.audioTrackIndex : 0;
    while (seqMg.videoTracks.numTracks <= vMg) {
      app.enableQE();
      qe.project.getActiveSequence().addTracks(1, seqMg.videoTracks.numTracks, 0);
    }
    var ti = seqMg.importMGT(mgFile.fsName, __prSecondsToTicks(params.timeSeconds || 0), vMg, aMg);
    if (!ti) __mcpFail("IMPORT_FAILED", "Premiere could not place " + params.filePath + " (is it a valid .mogrt?).");
    if (typeof params.durationSeconds === "number" && params.durationSeconds > 0) {
      var endT = new Time();
      endT.seconds = ti.start.seconds + params.durationSeconds;
      ti.end = endT;
    }
    var mgRes = __prSetMogrtValues(ti, params.values);
    return {
      placed: true,
      name: String(ti.name),
      videoTrackIndex: vMg,
      start: ti.start.seconds,
      end: ti.end.seconds,
      parameters: mgRes.available,
      set: mgRes.set
    };
  }

  if (action === "pr.timeline.edit") {
    var seqE = __prRequireActiveSequence();
    var opE = params.operation;
    var prevPos = null;
    try {
      prevPos = seqE.getPlayerPosition().ticks;
    } catch (_ePp) {}
    try {
      if (opE === "razor") {
        var times = params.times instanceof Array ? params.times : [params.timeSeconds];
        var cuts = [];
        for (var rz = 0; rz < times.length; rz++) {
          if (typeof times[rz] !== "number") __mcpFail("INVALID_PARAMS", "razor needs timeSeconds or times (seconds).");
          var tcR = __prTcAt(seqE, times[rz]);
          var qsR = qe.project.getActiveSequence();
          if (params.tracks instanceof Array && params.tracks.length) {
            for (var tk = 0; tk < params.tracks.length; tk++) {
              var trSpec = params.tracks[tk];
              var qt = trSpec.type === "audio" ? qsR.getAudioTrackAt(trSpec.index) : qsR.getVideoTrackAt(trSpec.index);
              if (!qt) __mcpFail("INVALID_PARAMS", "Track " + trSpec.type + " " + trSpec.index + " does not exist.");
              qt.razor(tcR);
            }
          } else {
            qsR.razor(tcR);
          }
          cuts.push({ requested: times[rz], timecode: tcR, cutAt: __prNearestEdge(seqE, times[rz], params.tracks) });
        }
        return { operation: "razor", cuts: cuts, note: "Cuts land on frame boundaries. Clips cut on one track only lose their link to the other track's part." };
      }
      if (opE === "extract") {
        if (typeof params.startSeconds !== "number" || typeof params.endSeconds !== "number" || params.endSeconds <= params.startSeconds) {
          __mcpFail("INVALID_PARAMS", "extract needs startSeconds < endSeconds.");
        }
        var endBefore = Number(seqE.end) / __PR_TICKS_PER_SECOND;
        var oldIn = __prSeqPoint(seqE, "in");
        var oldOut = __prSeqPoint(seqE, "out");
        var tcIn = __prTcAt(seqE, params.startSeconds);
        var tcOut = __prTcAt(seqE, params.endSeconds);
        var qsE = qe.project.getActiveSequence();
        qsE.setInPoint(tcIn);
        qsE.setOutPoint(tcOut);
        var okE = qsE.extract();
        var restored = false;
        try {
          if (oldIn !== null && oldOut !== null) {
            seqE.setInPoint(oldIn);
            seqE.setOutPoint(oldOut);
            restored = true;
          }
        } catch (_eRs) {}
        var endAfter = Number(seqE.end) / __PR_TICKS_PER_SECOND;
        return {
          operation: "extract",
          ok: okE !== false,
          from: tcIn,
          to: tcOut,
          removedSeconds: Math.round((endBefore - endAfter) * 1000) / 1000,
          sequenceEndBefore: Math.round(endBefore * 1000) / 1000,
          sequenceEndAfter: Math.round(endAfter * 1000) / 1000,
          inOutRestored: restored,
          note: "Ripple delete on every unlocked track; lock a track to keep it (e.g. the music bed)."
        };
      }
      var target = __prTargetClip(seqE, params);
      var group = __prGroup(target, params.linked);
      var gi;
      if (opE === "slip") {
        var off = Number(params.offsetSeconds) || 0;
        for (gi = 0; gi < group.length; gi++) {
          if (group[gi].inPoint.seconds + off < 0) __mcpFail("INVALID_PARAMS", "Slip would start before the beginning of the source (" + group[gi].name + ").");
        }
        for (gi = 0; gi < group.length; gi++) {
          var it = group[gi];
          var dur = it.end.seconds - it.start.seconds;
          var newIn = it.inPoint.seconds + off;
          it.inPoint = __prTime(newIn);
          it.outPoint = __prTime(newIn + dur);
        }
      } else if (opE === "trim") {
        var hasS = typeof params.startSeconds === "number";
        var hasE = typeof params.endSeconds === "number";
        if (!hasS && !hasE) __mcpFail("INVALID_PARAMS", "trim needs startSeconds and/or endSeconds (new clip edges on the timeline).");
        var newStart = hasS ? params.startSeconds : target.start.seconds;
        var newEnd = hasE ? params.endSeconds : target.end.seconds;
        if (newEnd - newStart < 0.01) __mcpFail("INVALID_PARAMS", "The clip would be shorter than a frame.");
        var delta = newStart - target.start.seconds;
        for (gi = 0; gi < group.length; gi++) {
          if (hasS && group[gi].inPoint.seconds + delta < 0) __mcpFail("INVALID_PARAMS", "The new start reaches before the beginning of the source media.");
        }
        for (gi = 0; gi < group.length; gi++) {
          var g = group[gi];
          if (hasE) g.end = __prTime(newEnd);
          if (hasS) {
            // Moving the start alone slides the picture: shift the source In by the same amount (verified frame by frame).
            var inBefore = g.inPoint.seconds;
            g.start = __prTime(newStart);
            g.inPoint = __prTime(inBefore + delta);
          }
        }
      } else if (opE === "move") {
        var d = typeof params.toSeconds === "number" ? params.toSeconds - target.start.seconds : Number(params.offsetSeconds) || 0;
        if (target.start.seconds + d < 0) __mcpFail("INVALID_PARAMS", "The clip would start before 0 s.");
        for (gi = 0; gi < group.length; gi++) group[gi].move(d);
      } else {
        __mcpFail("INVALID_PARAMS", "Unknown operation '" + opE + "'. Use razor, extract, slip, trim or move.");
      }
      var after = [];
      for (gi = 0; gi < group.length; gi++) after.push(__prDescribeItem(group[gi]));
      return { operation: opE, items: after, linkedItems: group.length };
    } finally {
      try {
        if (prevPos !== null && params.keepPlayhead !== false) seqE.setPlayerPosition(prevPos);
      } catch (_eRp) {}
    }
  }

  if (action === "pr.sequence.autoReframe") {
    var projR = __prRequireProject();
    var seqR = projR.activeSequence;
    if (params.sequenceName) {
      seqR = null;
      for (var sr = 0; sr < projR.sequences.numSequences; sr++) if (projR.sequences[sr].name === params.sequenceName) seqR = projR.sequences[sr];
      if (!seqR) __mcpFail("NOT_FOUND", "Sequence '" + params.sequenceName + "' not found.");
    }
    if (!seqR) __mcpFail("NO_SEQUENCE", "No active sequence.");
    var num = params.numerator, den = params.denominator;
    if (params.aspect) {
      var m = /^(\d+)\s*[:x\/]\s*(\d+)$/.exec(String(params.aspect));
      if (!m) __mcpFail("INVALID_PARAMS", "aspect like '1:1', '4:5', '9:16' or '16:9'.");
      num = Number(m[1]);
      den = Number(m[2]);
    }
    if (!num || !den) __mcpFail("INVALID_PARAMS", "Give aspect ('4:5') or numerator and denominator.");
    var newName = params.newName || (seqR.name + "_" + num + "x" + den);
    var ns = seqR.autoReframeSequence(num, den, params.motion || "default", newName, params.useNestedSequences === true);
    if (!ns) __mcpFail("REFRAME_FAILED", "Auto Reframe did not return a sequence (needs Premiere 14.2+ and video on the tracks).");
    var stR = ns.getSettings();
    if (params.open !== false) projR.openSequence(ns.sequenceID);
    return {
      source: String(seqR.name),
      sequence: String(ns.name),
      sequenceID: String(ns.sequenceID),
      width: stR.videoFrameWidth,
      height: stR.videoFrameHeight,
      motion: params.motion || "default",
      note: "Text, logos and captions are reframed with the picture: check titles and safe areas (pr_export_frame_or_sequence)."
    };
  }

  if (action === "pr.mogrt.captions") {
    var seqMc = __prRequireActiveSequence();
    var mcPath = params.filePath;
    var mcDefault = false;
    var mcScale = 100;
    if (!mcPath && params.defaultTemplates) {
      // Built-in caption templates: 1080x1920 and 1920x1080, scaled to the sequence height.
      var mcVert = Number(seqMc.frameSizeVertical) > Number(seqMc.frameSizeHorizontal);
      mcPath = mcVert ? params.defaultTemplates.vertical : params.defaultTemplates.horizontal;
      mcScale = (Number(seqMc.frameSizeVertical) / (mcVert ? 1920 : 1080)) * 100;
      mcDefault = true;
    }
    if (!mcPath) __mcpFail("INVALID_PARAMS", "Give filePath (a caption .mogrt).");
    var mcFile = new File(mcPath);
    if (!mcFile.exists) __mcpFail("FILE_NOT_FOUND", "MOGRT not found: " + mcPath);
    var cues = params.cues || [];
    if (!cues.length) __mcpFail("INVALID_PARAMS", "No caption cues.");
    var vMc = typeof params.videoTrackIndex === "number" ? params.videoTrackIndex : 2;
    var aMc = typeof params.audioTrackIndex === "number" ? params.audioTrackIndex : 0;
    while (seqMc.videoTracks.numTracks <= vMc) {
      app.enableQE();
      qe.project.getActiveSequence().addTracks(1, seqMc.videoTracks.numTracks, 0);
    }
    var off = Number(params.offsetSeconds) || 0;
    var textParam = params.textParam || null;
    var placed = 0;
    var failures = [];
    var paramsSeen = null;
    for (var q = 0; q < cues.length; q++) {
      var cue = cues[q];
      var st = cue.start + off;
      var en = cue.end + off;
      if (en <= st) continue;
      var tiC = null;
      try {
        tiC = seqMc.importMGT(mcFile.fsName, __prSecondsToTicks(st), vMc, aMc);
      } catch (eImp) {
        failures.push({ cue: q + 1, reason: String(eImp.message || eImp) });
        continue;
      }
      if (!tiC) {
        failures.push({ cue: q + 1, reason: "importMGT returned nothing" });
        continue;
      }
      tiC.end = __prTime(en);
      if (!textParam) textParam = __prMogrtTextParam(tiC);
      if (!textParam) __mcpFail("NO_TEXT_PARAM", "The template has no text parameter; expose the caption text in Essential Graphics (ae_export_mogrt) or pass textParam.");
      var vals = {};
      if (params.extraValues) for (var ev in params.extraValues) if (params.extraValues.hasOwnProperty(ev)) vals[ev] = params.extraValues[ev];
      vals[textParam] = String(cue.text);
      var rep = __prSetMogrtValues(tiC, vals);
      if (!paramsSeen) paramsSeen = rep.available;
      for (var rr = 0; rr < rep.set.length; rr++) if (!rep.set[rr].ok) failures.push({ cue: q + 1, reason: rep.set[rr].name + ": " + rep.set[rr].reason });
      if (mcDefault && Math.abs(mcScale - 100) > 0.5) {
        try {
          for (var mcC = 0; mcC < tiC.components.numItems; mcC++) {
            if (String(tiC.components[mcC].matchName) === "AE.ADBE Motion") tiC.components[mcC].properties[1].setValue(mcScale, true);
          }
        } catch (_eSc) {}
      }
      placed++;
    }
    return { template: mcFile.fsName, builtInTemplate: mcDefault, scalePercent: Math.round(mcScale * 10) / 10, placed: placed, cues: cues.length, videoTrackIndex: vMc, textParam: textParam, parameters: paramsSeen, failures: failures.slice(0, 20), failureCount: failures.length };
  }


  if (action === "pr.audit") {
    var seqAu = __prRequireActiveSequence();
    var stAu = seqAu.getSettings();
    var readTracks = function (tracks, kind) {
      var out = [];
      for (var t = 0; t < tracks.numTracks; t++) {
        var tr = tracks[t];
        var clips = [];
        for (var c = 0; c < tr.clips.numItems; c++) {
          var k = tr.clips[c];
          var offline = false;
          try {
            offline = k.projectItem ? k.projectItem.isOffline() : false;
          } catch (_eO) {}
          var speed = 1;
          try {
            speed = k.getSpeed();
          } catch (_eS) {}
          clips.push({ name: String(k.name), start: Math.round(k.start.seconds * 1000) / 1000, end: Math.round(k.end.seconds * 1000) / 1000, disabled: !!k.disabled, offline: offline, speed: speed, mgt: k.isMGT ? !!k.isMGT() : false });
        }
        var locked = false, muted = false;
        try {
          locked = tr.isLocked();
        } catch (_eL) {}
        try {
          muted = tr.isMuted();
        } catch (_eM) {}
        out.push({ kind: kind, index: t, name: String(tr.name), locked: locked, muted: muted, clips: clips });
      }
      return out;
    };
    var fps = 0;
    try {
      fps = 1 / stAu.videoFrameRate.seconds;
    } catch (_eF) {}
    return {
      sequence: String(seqAu.name),
      width: stAu.videoFrameWidth,
      height: stAu.videoFrameHeight,
      fps: Math.round(fps * 1000) / 1000,
      durationSeconds: Math.round((Number(seqAu.end) / __PR_TICKS_PER_SECOND) * 1000) / 1000,
      video: readTracks(seqAu.videoTracks, "video"),
      audio: readTracks(seqAu.audioTracks, "audio")
    };
  }


  if (action === "pr.audio.placeBed") {
    // Music bed on an audio track, from startSeconds, trimmed at endSeconds (end of the edit).
    var projB = __prRequireProject();
    var seqB = __prRequireActiveSequence();
    var itemB = __prFindProjectItemByNameOrPath(projB.rootItem, params.clipNameOrPath);
    if (!itemB) throw new Error("Project item not found: " + params.clipNameOrPath);
    var aIdx = typeof params.audioTrackIndex === "number" ? params.audioTrackIndex : 1;
    while (seqB.audioTracks.numTracks <= aIdx) {
      app.enableQE();
      qe.project.getActiveSequence().addTracks(0, 0, 1);
    }
    var trB = seqB.audioTracks[aIdx];
    var before = trB.clips.numItems;
    trB.overwriteClip(itemB, __prSecondsToTicks(params.startSeconds || 0));
    var placedB = null;
    for (var cb = 0; cb < trB.clips.numItems; cb++) {
      var k = trB.clips[cb];
      if (Math.abs(k.start.seconds - (params.startSeconds || 0)) < 0.05) placedB = k;
    }
    if (!placedB) throw new Error("The music did not land on audio track " + (aIdx + 1) + ".");
    var trimmed = false;
    if (typeof params.endSeconds === "number" && placedB.end.seconds > params.endSeconds) {
      placedB.end = __prTime(params.endSeconds);
      trimmed = true;
    }
    return { clip: String(placedB.name), audioTrackIndex: aIdx, start: placedB.start.seconds, end: placedB.end.seconds, trimmed: trimmed, clipsBefore: before };
  }

  if (action === "pr.effect.applyQe") {
    app.enableQE();
    var qeSeq = qe.project.getActiveSequence();
    if (!qeSeq) throw new Error("QE Active Sequence not available.");
    var qeTrack = (params.trackType === "audio")
      ? qeSeq.getAudioTrackAt(params.trackIndex || 0)
      : qeSeq.getVideoTrackAt(params.trackIndex || 0);
    var qeClip = qeTrack.getItemAt(params.clipIndex || 0);
    if (!qeClip) throw new Error("QE Clip not found.");

    if (params.transitionName) {
      var trans = (params.trackType === "audio")
        ? qe.project.getAudioTransitionByName(params.transitionName)
        : qe.project.getVideoTransitionByName(params.transitionName);
      qeClip.addTransition(trans, Boolean(params.atStart));
      return { appliedTransition: params.transitionName };
    }

    var eff = (params.trackType === "audio")
      ? qe.project.getAudioEffectByName(params.effectName)
      : qe.project.getVideoEffectByName(params.effectName);
    if (params.trackType === "audio") {
      qeClip.addAudioEffect(eff);
    } else {
      qeClip.addVideoEffect(eff);
    }
    return { appliedEffect: params.effectName };
  }

  if (action === "pr.export.frameOrSequence") {
    var seqEx = __prRequireActiveSequence();
    if (params.mode === "frame") {
      app.enableQE();
      if (typeof params.timeSeconds === "number") {
        seqEx.setPlayerPosition(String(Math.round(params.timeSeconds * 254016000000)));
      }
      var qeS = qe.project.getActiveSequence();
      var timecode = qeS.CTI.timecode;
      // 18/11/2026: Folder.temp pointed to a folder that does not exist ("Temp\\Temp") and Premiere showed an
      // error dialog. Default to a folder beside the project; fall back to an existing temp folder.
      var outPath = params.outputPath;
      if (!outPath) {
        var frameDir = null;
        try {
          if (app.project && app.project.path) frameDir = new Folder(new File(app.project.path).parent.fsName + "/_mcp_quadros");
        } catch (_eDir) {}
        if (!frameDir) {
          frameDir = Folder.temp;
          if (!frameDir.exists && frameDir.parent && frameDir.parent.exists) frameDir = frameDir.parent;
        }
        if (!frameDir.exists) frameDir.create();
        outPath = frameDir.fsName + "/pr_frame_" + new Date().getTime() + ".png";
      }
      // QE's exportFramePNG always appends ".png", so pass the path without it (avoids "frame.png.png").
      if (!/\.png$/i.test(outPath)) outPath += ".png";
      // LIVE FINDING (Premiere 27, 18/11/2026): QE's exportFramePNG fails with "Unknown error exception" when
      // the path has forward slashes (the default folder was built with "/"). Always hand it the native path.
      outPath = new File(outPath).fsName;
      __mcpPrepareOutputFile(outPath);
      qeS.exportFramePNG(timecode, outPath.replace(/\.png$/i, ""));
      return { mode: "frame", outputPath: outPath, timecode: timecode };
    }
    var outMedia = __mcpPrepareOutputFile(params.outputPath).fsName;
    var preset = params.presetPath || "";
    if (preset) {
      // AME wants a native path ("C:\\…"); "C:/…" from the agent made encodeSequence fail.
      var presetFile = new File(preset);
      if (!presetFile.exists) __mcpFail("FILE_NOT_FOUND", "Export preset not found: " + preset);
      preset = presetFile.fsName;
    }
    if (!preset) {
      // 18/11/2026: without a preset nothing is written (AME job stays "running", direct export returns no file).
      var defPreset = null;
      // macOS (20/11/2026): the presets live in <bundle>.app/Contents/MediaIO, so both roots are tried, like sequence presets.
      try {
        var defRoot = String(app.path).replace(/[\\\/]+$/, "");
        var defRel = "/MediaIO/systempresets/4E49434B_48323634/00 - Match Source - High bitrate.epr";
        defPreset = new File(defRoot + defRel);
        if (!defPreset.exists) defPreset = new File(defRoot + "/Contents" + defRel);
      } catch (_ePre) {}
      if (defPreset && defPreset.exists) {
        preset = defPreset.fsName;
      } else {
        __mcpFail("INVALID_PARAMS", "Sequence export needs presetPath (.epr). No default H.264 'Match Source - High bitrate' preset was found in the Premiere folder.");
      }
    }
    if (params.queueInAME === true) {
      // Media Encoder renders in the background: Premiere stays free and the call returns at once.
      // launchEncoder() throws "Unknown error exception" when AME is already running (14/11/2026).
      try { app.encoder.launchEncoder(); } catch (_eLaunch) {}
      var jobId = app.encoder.encodeSequence(seqEx, outMedia, preset, app.encoder.ENCODE_ENTIRE, 1);
      app.encoder.startBatch();
      return { mode: "sequence", engine: "media-encoder", jobId: String(jobId), outputPath: outMedia, status: "queued", next: "Check that the file exists and stops growing (media_analyze_audio or a frame grab) before using it." };
    }
    seqEx.exportAsMediaDirect(outMedia, preset, app.encoder.ENCODE_ENTIRE);
    var outFile = new File(outMedia);
    if (!outFile.exists) __mcpFail("EXPORT_FAILED", "Premiere did not write " + outMedia + ". Check the preset (" + preset + ") and that the sequence has content.");
    return { mode: "sequence", engine: "premiere", outputPath: outMedia, preset: preset, exists: true, bytes: outFile.length };
  }

  if (action === "pr.raw.executeExtendScript") {
    if (params.enableQE !== false && typeof app.enableQE === "function") {
      app.enableQE();
    }
    var res = __mcpEvalUserCode(params.code);
    return {
      executed: true,
      result: typeof res === "undefined" ? null : res
    };
  }

  if (action === "adobe.inspectDom") {
    if (typeof app.enableQE === "function") {
      app.enableQE();
    }
    return __mcpInspectDomObject(params.targetExpression || "app.project", params.maxProperties || 150);
  }

  __mcpUnsupported("Unknown Premiere Pro action: " + action);
}
