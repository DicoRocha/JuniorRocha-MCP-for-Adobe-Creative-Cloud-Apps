-- lr.* actions for the Junior Rocha MCP Lightroom Classic bridge (Lua 5.1, Lightroom SDK 6+).
-- Errors are tables { code = "...", message = "..." }; everything returned must be JSON-serialisable.
local LrApplication = import "LrApplication"
local LrApplicationView = import "LrApplicationView"
local LrTasks = import "LrTasks"
local LrFileUtils = import "LrFileUtils"
local LrPathUtils = import "LrPathUtils"
local LrExportSession = import "LrExportSession"
local LrStringUtils = import "LrStringUtils"
local LrDate = import "LrDate"

local json = require("json")

local H = {}
local handlers = {}
local writeDepth = 0

-------------------------------------------------------------------------------
-- helpers
-------------------------------------------------------------------------------

local function fail(code, message)
  error({ code = code, message = message }, 0)
end

function H.errorInfo(err)
  if type(err) == "table" then
    return { code = tostring(err.code or "LR_ERROR"), message = tostring(err.message or json.encode(err)) }
  end
  local msg = tostring(err)
  return { code = "LR_ERROR", message = msg }
end

local function catalog()
  return LrApplication.activeCatalog()
end

-- Catalog write access as ONE undo step. Nested calls (batch, lr_execute_lua) run inside the outer one.
local function write(name, fn)
  if writeDepth > 0 then
    return fn()
  end
  local result
  local inner = function(...)
    writeDepth = writeDepth + 1
    -- LrTasks.pcall, not pcall: SDK calls such as applyDevelopSettings yield, and Lua 5.1 cannot yield across a plain pcall.
    local ok, r = LrTasks.pcall(fn, ...)
    writeDepth = writeDepth - 1
    if not ok then error(r, 0) end
    result = r
  end
  local status = catalog():withWriteAccessDo(name or "MCP", inner, { timeout = 60 })
  if status == "aborted" then
    fail("CATALOG_BUSY", "Lightroom did not grant catalog write access within 60 s (another edit or dialog is running).")
  end
  return result
end
H.write = write

local function normPath(p)
  if type(p) ~= "string" then return "" end
  local s = p:gsub("\\", "/"):lower()
  s = s:gsub("/+$", "")
  return s
end

local function arrayOf(t)
  if type(t) ~= "table" then return {} end
  return t
end

local function contains(hay, needle)
  if not needle or needle == "" then return true end
  if type(hay) ~= "string" then return false end
  return hay:lower():find(needle:lower(), 1, true) ~= nil
end

local PICK_NAMES = { [1] = "picked", [0] = "unflagged", [-1] = "rejected" }
local PICK_VALUES = { picked = 1, unflagged = 0, rejected = -1 }

local function labelName(raw)
  if raw == nil or raw == "" then return "none" end
  return raw
end

local base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
local function base64(data)
  local ok, enc = pcall(function() return LrStringUtils.encodeBase64(data) end)
  if ok and type(enc) == "string" then
    return (enc:gsub("%s", ""))
  end
  local out, len = {}, #data
  for i = 1, len, 3 do
    local a, b, c = data:byte(i, i + 2)
    local n = a * 65536 + (b or 0) * 256 + (c or 0)
    local c1 = math.floor(n / 262144) % 64
    local c2 = math.floor(n / 4096) % 64
    local c3 = math.floor(n / 64) % 64
    local c4 = n % 64
    out[#out + 1] = base64Chars:sub(c1 + 1, c1 + 1) .. base64Chars:sub(c2 + 1, c2 + 1) ..
      (b and base64Chars:sub(c3 + 1, c3 + 1) or "=") .. (c and base64Chars:sub(c4 + 1, c4 + 1) or "=")
  end
  return table.concat(out)
end
H.base64 = base64

-------------------------------------------------------------------------------
-- photos
-------------------------------------------------------------------------------

local function describePhotos(photos)
  local cat = catalog()
  photos = arrayOf(photos)
  if #photos == 0 then return {} end
  local raw = cat:batchGetRawMetadata(photos, {
    "path", "rating", "pickStatus", "colorNameForLabel", "dateTimeOriginalISO8601", "dimensions", "fileFormat", "isVirtualCopy",
    "isoSpeedRating"
  })
  local fmt = cat:batchGetFormattedMetadata(photos, { "fileName", "keywordTags", "title", "copyName" })
  local list = {}
  for i, photo in ipairs(photos) do
    local r = raw[photo] or {}
    local f = fmt[photo] or {}
    local dims = r.dimensions
    list[i] = {
      id = photo.localIdentifier,
      path = r.path,
      fileName = f.fileName,
      copyName = (f.copyName ~= "" and f.copyName) or nil,
      virtualCopy = r.isVirtualCopy == true,
      format = r.fileFormat,
      rating = r.rating or 0,
      pick = PICK_NAMES[r.pickStatus or 0] or "unflagged",
      label = labelName(r.colorNameForLabel),
      width = type(dims) == "table" and dims.width or nil,
      height = type(dims) == "table" and dims.height or nil,
      captureDate = r.dateTimeOriginalISO8601,
      -- ISO decides the noise reduction (foto-revelacao: noise by ISO)
      iso = tonumber(r.isoSpeedRating),
      title = (f.title ~= "" and f.title) or nil,
      keywords = (f.keywordTags ~= "" and f.keywordTags) or nil
    }
  end
  return list
end
H.describePhotos = describePhotos

local idCache = nil
-- LIVE FINDING (Lightroom Classic 16, 18/11/2026): a photo whose AI edits (masks from a preset, blemish
-- removal, synced settings) were not computed yet makes the export stop on the dialog "AI Updates
-- Recommended". No dialog may reach the person: the AI settings are brought up to date here first.
-- Measured: needsUpdateAISettings() is true right after a preset with an AI mask, and
-- catalog:updateAISettings({photo}) inside write access clears it (about 4 s per photo).
local function updateAISettingsFor(photos, maxSeconds)
  local need = {}
  for _, photo in ipairs(photos or {}) do
    if type(photo.needsUpdateAISettings) == "function" then
      local ok, needs = LrTasks.pcall(function() return photo:needsUpdateAISettings() end)
      if ok and needs then need[#need + 1] = photo end
    end
  end
  local cat = catalog()
  if #need == 0 or type(cat.updateAISettings) ~= "function" then return { updated = 0, pending = 0 } end
  write("MCP: update AI settings", function() cat:updateAISettings(need) end)
  local waited, limit = 0, maxSeconds or 180
  local function pending()
    local n = 0
    for _, photo in ipairs(need) do
      local ok, needs = LrTasks.pcall(function() return photo:needsUpdateAISettings() end)
      if ok and needs then n = n + 1 end
    end
    return n
  end
  local left = pending()
  while left > 0 and waited < limit do
    LrTasks.sleep(0.5)
    waited = waited + 0.5
    left = pending()
  end
  return { updated = #need - left, pending = left, waitedSeconds = waited }
end

local function photoById(id)
  local cat = catalog()
  id = tonumber(id)
  if not id then fail("INVALID_PARAMS", "Photo id must be a number.") end
  local ok, photo = pcall(function() return cat:getPhotoByLocalId(id) end)
  if ok and photo then return photo end
  if not idCache or not idCache[id] then
    idCache = {}
    for _, p in ipairs(cat:getAllPhotos()) do idCache[p.localIdentifier] = p end
  end
  local p = idCache[id]
  if not p then fail("PHOTO_NOT_FOUND", "No photo with id " .. tostring(id) .. " in the catalog.") end
  return p
end

local function targetPhotos(params, allowEmpty)
  local ids = params.ids
  local photos = {}
  if type(ids) == "table" and #ids > 0 then
    for i, id in ipairs(ids) do photos[i] = photoById(id) end
  elseif params.useSelection ~= false then
    photos = catalog():getTargetPhotos() or {}
  end
  if #photos == 0 and not allowEmpty then
    fail("NO_PHOTOS", "No photos to act on: pass ids (from lr_find_photos) or select photos in Lightroom.")
  end
  return photos
end

local function onePhoto(id)
  if id ~= nil then return photoById(id) end
  local p = catalog():getTargetPhoto()
  if not p then fail("NO_PHOTOS", "No active photo: pass an id or select a photo in Lightroom.") end
  return p
end

-------------------------------------------------------------------------------
-- folders & collections
-------------------------------------------------------------------------------

local function walkFolders(folders, fn)
  for _, folder in ipairs(arrayOf(folders)) do
    if fn(folder) then return folder end
    local found = walkFolders(folder:getChildren(), fn)
    if found then return found end
  end
  return nil
end

local function findFolder(path)
  local want = normPath(path)
  local folder = walkFolders(catalog():getFolders(), function(f) return normPath(f:getPath()) == want end)
  if not folder then fail("FOLDER_NOT_FOUND", "Folder not in the catalog: " .. tostring(path)) end
  return folder
end

local function collectCollections(parent, prefix, out)
  for _, c in ipairs(arrayOf(parent:getChildCollections())) do
    out[#out + 1] = { collection = c, path = prefix .. c:getName() }
  end
  for _, set in ipairs(arrayOf(parent:getChildCollectionSets())) do
    collectCollections(set, prefix .. set:getName() .. "/", out)
  end
  return out
end

local function findCollection(name, mustExist)
  if type(name) ~= "string" or name == "" then fail("INVALID_PARAMS", "A collection name is required.") end
  local want = name:lower()
  for _, entry in ipairs(collectCollections(catalog(), "", {})) do
    if entry.path:lower() == want or entry.collection:getName():lower() == want then
      return entry.collection, entry.path
    end
  end
  if mustExist ~= false then fail("COLLECTION_NOT_FOUND", "Collection not found: " .. name) end
  return nil
end

local function findOrCreateSet(path)
  if not path or path == "" then return nil end
  local cat, parent = catalog(), nil
  for part in tostring(path):gmatch("[^/]+") do
    parent = cat:createCollectionSet(part, parent, true)
  end
  return parent
end

-------------------------------------------------------------------------------
-- catalog
-------------------------------------------------------------------------------

handlers["lr.catalog.getInfo"] = function()
  local cat = catalog()
  local sources = {}
  for i, s in ipairs(arrayOf(cat:getActiveSources())) do
    if type(s) == "string" then
      sources[i] = { kind = s }
    else
      local okT, kind = pcall(function() return s:type() end)
      local okN, name = pcall(function() return s:getName() end)
      local okP, path = pcall(function() return s:getPath() end)
      sources[i] = { kind = okT and kind or "source", name = okN and name or nil, path = okP and path or nil }
    end
  end
  local active = cat:getTargetPhoto()
  local targets = cat:getTargetPhotos() or {}
  local selected = {}
  for i = 1, math.min(#targets, 50) do selected[i] = targets[i] end
  return {
    lightroomVersion = LrApplication.versionString(),
    catalogPath = cat:getPath(),
    photoCount = #cat:getAllPhotos(),
    module = LrApplicationView.getCurrentModuleName(),
    activeSources = sources,
    activePhoto = active and describePhotos({ active })[1] or nil,
    targetCount = #targets,
    targetPhotos = describePhotos(selected),
    note = "targetPhotos = the selection, or the whole filmstrip when nothing is selected."
  }
end

handlers["lr.photo.find"] = function(p)
  local cat = catalog()
  local source = p.source or "selection"
  local photos
  if source == "selection" then
    photos = cat:getTargetPhotos() or {}
  elseif source == "folder" then
    photos = findFolder(p.folderPath):getPhotos(p.includeSubfolders ~= false)
  elseif source == "collection" then
    photos = findCollection(p.collection):getPhotos()
  elseif source == "all" then
    photos = cat:getAllPhotos()
  else
    fail("INVALID_PARAMS", "Unknown source '" .. tostring(source) .. "'.")
  end
  photos = arrayOf(photos)
  local described = describePhotos(photos)
  local limit = tonumber(p.limit) or 200
  local out, matched = {}, 0
  for _, d in ipairs(described) do
    local keep = contains(d.fileName, p.filenameContains) and contains(d.keywords, p.keyword)
    if keep and p.minRating then keep = (d.rating or 0) >= p.minRating end
    if keep and p.pick then keep = d.pick == p.pick end
    if keep and p.label then keep = d.label == p.label end
    if keep then
      matched = matched + 1
      if #out < limit then out[#out + 1] = d end
    end
  end
  return { source = source, scanned = #photos, matched = matched, returned = #out, truncated = matched > #out, photos = out }
end

handlers["lr.photo.select"] = function(p)
  local photos = targetPhotos({ ids = p.ids, useSelection = false })
  catalog():setSelectedPhotos(photos[1], photos)
  return { selected = #photos, activeId = photos[1].localIdentifier }
end

handlers["lr.photo.setMetadata"] = function(p)
  local photos = targetPhotos(p)
  local cat = catalog()
  write("MCP: metadata", function()
    local addKw = {}
    for _, name in ipairs(arrayOf(p.addKeywords)) do
      addKw[#addKw + 1] = cat:createKeyword(name, {}, true, nil, true)
    end
    for _, photo in ipairs(photos) do
      if p.rating ~= nil then photo:setRawMetadata("rating", (p.rating > 0) and p.rating or nil) end
      if p.pick ~= nil then photo:setRawMetadata("pickStatus", PICK_VALUES[p.pick] or 0) end
      if p.label ~= nil then
        if p.label == "none" then
          if not pcall(function() photo:setRawMetadata("colorNameForLabel", "none") end) then
            photo:setRawMetadata("colorNameForLabel", "")
          end
        else
          photo:setRawMetadata("colorNameForLabel", p.label)
        end
      end
      if p.title ~= nil then photo:setRawMetadata("title", p.title) end
      if p.caption ~= nil then photo:setRawMetadata("caption", p.caption) end
      if p.copyright ~= nil then photo:setRawMetadata("copyright", p.copyright) end
      for _, kw in ipairs(addKw) do photo:addKeyword(kw) end
      if p.removeKeywords and #p.removeKeywords > 0 then
        local remove = {}
        for _, name in ipairs(p.removeKeywords) do remove[name:lower()] = true end
        for _, kw in ipairs(arrayOf(photo:getRawMetadata("keywords"))) do
          if remove[kw:getName():lower()] then photo:removeKeyword(kw) end
        end
      end
    end
  end)
  return { updated = #photos, photos = describePhotos(photos) }
end

handlers["lr.photo.import"] = function(p)
  local cat = catalog()
  local added, errors = {}, {}
  write("MCP: import", function()
    for _, rawPath in ipairs(arrayOf(p.paths)) do
      -- 18/11/2026: on Windows addPhoto fails ("could not be read") with forward slashes.
      local path = rawPath
      if WIN_ENV then path = string.gsub(path, "/", "\\") end
      if not LrFileUtils.exists(path) then
        errors[#errors + 1] = { path = path, error = "file not found" }
      else
        local existing = cat:findPhotoByPath(path)
        if existing then
          added[#added + 1] = existing
        else
          local ok, photo = LrTasks.pcall(function() return cat:addPhoto(path) end)
          if ok and photo then added[#added + 1] = photo else errors[#errors + 1] = { path = path, error = tostring(photo) } end
        end
      end
    end
  end)
  if p.collection and #added > 0 then
    write("MCP: import to collection", function()
      local c = findCollection(p.collection, false) or cat:createCollection(p.collection, nil, true)
      c:addPhotos(added)
    end)
  end
  idCache = nil
  return { added = #added, photos = describePhotos(added), errors = errors }
end

-------------------------------------------------------------------------------
-- develop
-------------------------------------------------------------------------------

local function pick(settings, keys)
  if type(keys) ~= "table" or #keys == 0 then return settings end
  local out = json.object()
  for _, k in ipairs(keys) do out[k] = settings[k] end
  return out
end

-- Plain copy for photo:applyDevelopSettings, which deep-copies its argument and rejects tables with a
-- metatable ("deepCopy does not support metatables"): json.object() tables carry one.
local function plainCopy(t)
  if type(t) ~= "table" then return t end
  local out = {}
  for k, v in pairs(t) do out[k] = plainCopy(v) end
  return out
end

handlers["lr.develop.getSettings"] = function(p)
  local photo = onePhoto(p.id)
  return { id = photo.localIdentifier, settings = pick(photo:getDevelopSettings() or {}, p.keys) }
end

handlers["lr.develop.apply"] = function(p)
  if type(p.settings) ~= "table" or next(p.settings) == nil then fail("INVALID_PARAMS", "settings must be a non-empty object.") end
  local photos = targetPhotos(p)
  local historyName = p.historyName or "MCP"
  write("MCP: develop", function()
    local plain = plainCopy(p.settings)
    for _, photo in ipairs(photos) do photo:applyDevelopSettings(plain, historyName) end
  end)
  local keys = {}
  for k in pairs(p.settings) do keys[#keys + 1] = k end
  return {
    updated = #photos,
    readback = { id = photos[1].localIdentifier, settings = pick(photos[1]:getDevelopSettings() or {}, keys) }
  }
end

local function allPresets()
  local list = {}
  for _, folder in ipairs(arrayOf(LrApplication.developPresetFolders())) do
    local fname = folder:getName()
    for _, preset in ipairs(arrayOf(folder:getDevelopPresets())) do
      list[#list + 1] = { folder = fname, name = preset:getName(), uuid = preset:getUuid(), preset = preset }
    end
  end
  return list
end

handlers["lr.develop.listPresets"] = function(p)
  local folders, order, total = {}, {}, 0
  local words = {}
  for w in tostring(p.search or ""):lower():gmatch("%S+") do words[#words + 1] = w end
  for _, entry in ipairs(allPresets()) do
    local hay = (entry.folder .. " " .. entry.name):lower()
    local keep = true
    for _, w in ipairs(words) do if not hay:find(w, 1, true) then keep = false break end end
    if keep then
      if not folders[entry.folder] then folders[entry.folder] = {}; order[#order + 1] = entry.folder end
      table.insert(folders[entry.folder], entry.name)
      total = total + 1
    end
  end
  local out = {}
  for i, name in ipairs(order) do out[i] = { folder = name, presets = folders[name] } end
  return { total = total, folders = out }
end

handlers["lr.develop.applyPreset"] = function(p)
  local want, wantFolder = tostring(p.presetName or ""):lower(), p.folder and tostring(p.folder):lower()
  local preset, suggestions = nil, {}
  for _, entry in ipairs(allPresets()) do
    if entry.name:lower() == want and (not wantFolder or entry.folder:lower() == wantFolder) then
      preset = entry
      break
    end
    if want ~= "" and entry.name:lower():find(want, 1, true) and #suggestions < 10 then
      suggestions[#suggestions + 1] = entry.folder .. " / " .. entry.name
    end
  end
  if not preset then
    fail("PRESET_NOT_FOUND", "Develop preset not found: " .. tostring(p.presetName) ..
      (#suggestions > 0 and (". Similar: " .. table.concat(suggestions, "; ")) or ". Use lr_list_develop_presets."))
  end
  local photos = targetPhotos(p)
  write("MCP: preset " .. preset.name, function()
    for _, photo in ipairs(photos) do photo:applyDevelopPreset(preset.preset) end
  end)
  local ai = updateAISettingsFor(photos)
  return { applied = preset.folder .. " / " .. preset.name, updated = #photos, aiSettings = ai }
end

handlers["lr.develop.copySettings"] = function(p)
  local from = photoById(p.fromId)
  local settings = plainCopy(pick(from:getDevelopSettings() or {}, p.keys))
  local photos = targetPhotos(p)
  local targets = {}
  for _, photo in ipairs(photos) do
    if photo.localIdentifier ~= from.localIdentifier then targets[#targets + 1] = photo end
  end
  if #targets == 0 then fail("NO_PHOTOS", "No target photos other than the source photo.") end
  write("MCP: copy develop settings", function()
    for _, photo in ipairs(targets) do photo:applyDevelopSettings(settings, "MCP: settings from " .. tostring(from.localIdentifier)) end
  end)
  local count = 0
  for _ in pairs(settings) do count = count + 1 end
  return { fromId = from.localIdentifier, updated = #targets, keysCopied = count }
end

-- 18/11/2026: Sync by settings GROUP (SDK 16: photo:copySettings(preset, groups) + photo:pasteSettings()).
-- This is the only scripted way to carry edits that have no parameter API, such as the AI Blemish Removal
-- (group "distractionRemovalBlemish"): apply it once on a reference photo, then sync the group to the series.
handlers["lr.develop.syncGroups"] = function(p)
  local from = photoById(p.fromId)
  if type(from.copySettings) ~= "function" then
    fail("ACTION_NOT_SUPPORTED", "This Lightroom version has no photo:copySettings (needs Lightroom Classic 10.3+; settings groups need 16.0).")
  end
  local groups, names = {}, {}
  for _, g in ipairs(arrayOf(p.groups)) do
    groups[g] = true
    names[#names + 1] = g
  end
  if #names == 0 then fail("INVALID_PARAMS", "groups is required, e.g. { 'distractionRemovalBlemish' }.") end
  local photos = targetPhotos(p)
  local targets = {}
  for _, photo in ipairs(photos) do
    if photo.localIdentifier ~= from.localIdentifier then targets[#targets + 1] = photo end
  end
  if #targets == 0 then fail("NO_PHOTOS", "No target photos other than the source photo.") end
  -- LIVE FINDING (Lightroom Classic 16, 18/11/2026): copySettings / pasteSettings return a boolean and do not
  -- raise; pasteSettings must run inside catalog write access, and AI edits (blemishes, masks) are only
  -- recomputed on the target when updateAISettings is true.
  local okCopy, copied = LrTasks.pcall(function() return from:copySettings("custom", groups) end)
  if not okCopy then fail("COPY_FAILED", "copySettings refused the groups (" .. table.concat(names, ", ") .. "): " .. tostring(copied)) end
  if copied == false then fail("COPY_FAILED", "copySettings returned false for the groups (" .. table.concat(names, ", ") .. ").") end
  local updated, errors = 0, {}
  write("MCP: sync settings groups", function()
    for _, photo in ipairs(targets) do
      local ok, res = LrTasks.pcall(function() return photo:pasteSettings(p.updateAI ~= false, p.replaceMasks == true) end)
      if ok and res ~= false then
        updated = updated + 1
      else
        errors[#errors + 1] = { id = photo.localIdentifier, error = ok and "pasteSettings returned false" or tostring(res) }
      end
    end
  end)
  local aiSync = updateAISettingsFor(targets)
  return { fromId = from.localIdentifier, groups = names, updated = updated, errors = errors, aiSettings = aiSync,
    note = "AI edits (blemishes, people, masks) are recomputed on each photo: check every photo before exporting. " ..
      "The source photo must really carry the edit: a group that is empty on the source changes nothing." }
end

handlers["lr.develop.snapshot"] = function(p)
  local photos = targetPhotos(p)
  if type(p.name) ~= "string" or p.name == "" then fail("INVALID_PARAMS", "Snapshot name is required.") end
  write("MCP: snapshot", function()
    for _, photo in ipairs(photos) do
      if type(photo.createDevelopSnapshot) ~= "function" then
        fail("ACTION_NOT_SUPPORTED", "This Lightroom version has no photo:createDevelopSnapshot (needs Lightroom Classic 9+).")
      end
      photo:createDevelopSnapshot(p.name, true)
    end
  end)
  return { created = p.name, photos = #photos }
end

handlers["lr.develop.autoTone"] = function(p)
  local LrDevelopController = import "LrDevelopController"
  local photo = onePhoto(p.id)
  catalog():setSelectedPhotos(photo, { photo })
  if LrApplicationView.getCurrentModuleName() ~= "develop" then
    LrApplicationView.switchToModule("develop")
  end
  LrTasks.sleep(1.0)
  LrDevelopController.setAutoTone()
  LrTasks.sleep(1.0)
  return {
    id = photo.localIdentifier,
    module = "develop",
    settings = pick(photo:getDevelopSettings() or {}, {
      "Exposure2012", "Contrast2012", "Highlights2012", "Shadows2012", "Whites2012", "Blacks2012", "Vibrance", "Saturation"
    })
  }
end

-- Local masks (A3, 16/11/2026): the SDK creates AI / gradient / range masks and sets the local sliders of the
-- selected mask. Needs the Develop module with the photo active; AI masks take a few seconds to compute.
local MASK_TYPES = { brush = true, gradient = true, radialGradient = true, rangeMask = true, aiSelection = true }

local function developOn(photo)
  local LrDevelopController = import "LrDevelopController"
  catalog():setSelectedPhotos(photo, { photo })
  if LrApplicationView.getCurrentModuleName() ~= "develop" then
    LrApplicationView.switchToModule("develop")
  end
  LrTasks.sleep(1.0)
  LrDevelopController.goToMasking()
  LrTasks.sleep(0.5)
  return LrDevelopController
end

local function maskList(DC)
  local out = {}
  for i, m in ipairs(DC.getAllMasks() or {}) do
    local tools = {}
    for _, t in ipairs(m.Tools or {}) do tools[#tools + 1] = tostring(t.Type) .. (t.Subtype and ("/" .. tostring(t.Subtype)) or "") .. (t.Inverted and " (invertida)" or "") end
    out[#out + 1] = { index = i, id = m.ID, name = m.Name, tools = tools }
  end
  return out
end

local function applyLocal(DC, adjustments)
  local read = {}
  for k, v in pairs(adjustments or {}) do
    local key = (k:sub(1, 6) == "local_") and k or ("local_" .. k)
    DC.setValue(key, v)
  end
  LrTasks.sleep(0.8)
  for k in pairs(adjustments or {}) do
    local key = (k:sub(1, 6) == "local_") and k or ("local_" .. k)
    read[key] = DC.getValue(key)
  end
  return read
end

handlers["lr.develop.mask"] = function(p)
  local photo = onePhoto(p.id)
  local DC = developOn(photo)
  local op = p.operation or "list"
  if op == "list" then
    return { id = photo.localIdentifier, masks = maskList(DC) }
  end
  if op == "create" then
    local mtype = p.maskType or "aiSelection"
    if not MASK_TYPES[mtype] then fail("INVALID_PARAMS", "maskType must be brush, gradient, radialGradient, rangeMask or aiSelection.") end
    local before = #(DC.getAllMasks() or {})
    DC.createNewMask(mtype, p.maskSubtype)
    -- AI masks are computed asynchronously: wait until the new mask is listed
    local waited = 0
    while #(DC.getAllMasks() or {}) <= before and waited < (p.waitSeconds or 30) do
      LrTasks.sleep(0.5)
      waited = waited + 0.5
    end
    local masks = DC.getAllMasks() or {}
    if #masks <= before then fail("MASK_NOT_CREATED", "Lightroom did not create the mask in time (AI masks need a moment; is there a " .. tostring(p.maskSubtype) .. " in the photo?).") end
    local new = masks[#masks]
    LrTasks.sleep(1.0)
    DC.selectMask(new.ID)
    LrTasks.sleep(0.5)
    if p.invert then DC.invertMask(new.ID) LrTasks.sleep(0.5) end
    local read = applyLocal(DC, p.adjustments)
    return { id = photo.localIdentifier, created = new.ID, name = new.Name, waitedSeconds = waited, adjustments = read, masks = maskList(DC) }
  end
  local masks = DC.getAllMasks() or {}
  local target = nil
  for i, m in ipairs(masks) do
    if (p.maskId and m.ID == p.maskId) or (p.maskName and m.Name == p.maskName) or (p.maskIndex and i == p.maskIndex) then target = m end
  end
  if not target then fail("MASK_NOT_FOUND", "Mask not found; operation 'list' shows ids, names and indexes.") end
  if op == "adjust" then
    DC.selectMask(target.ID)
    LrTasks.sleep(0.5)
    return { id = photo.localIdentifier, mask = target.ID, adjustments = applyLocal(DC, p.adjustments) }
  end
  if op == "delete" then
    DC.deleteMask(target.ID)
    LrTasks.sleep(0.5)
    return { id = photo.localIdentifier, deleted = target.ID, masks = maskList(DC) }
  end
  fail("INVALID_PARAMS", "operation must be list, create, adjust or delete.")
end

-------------------------------------------------------------------------------
-- collections
-------------------------------------------------------------------------------

handlers["lr.collection.manage"] = function(p)
  local cat = catalog()
  local op = p.operation or "list"
  if op == "list" then
    local out = {}
    for i, entry in ipairs(collectCollections(cat, "", {})) do
      local c = entry.collection
      local okS, smart = pcall(function() return c:isSmartCollection() end)
      out[i] = { name = c:getName(), path = entry.path, smart = okS and smart or false, count = #arrayOf(c:getPhotos()) }
    end
    return { collections = out }
  elseif op == "create" then
    local created
    write("MCP: create collection", function()
      local parent = findOrCreateSet(p.parentSet)
      created = cat:createCollection(p.name, parent, true)
      if p.ids and #p.ids > 0 then created:addPhotos(targetPhotos({ ids = p.ids })) end
    end)
    return { created = p.name, parentSet = p.parentSet, count = #arrayOf(created and created:getPhotos()) }
  elseif op == "add" or op == "remove" then
    local c = findCollection(p.name)
    local photos = targetPhotos({ ids = p.ids })
    write("MCP: " .. op .. " collection photos", function()
      if op == "add" then c:addPhotos(photos) else c:removePhotos(photos) end
    end)
    return { collection = c:getName(), [op == "add" and "added" or "removed"] = #photos, count = #arrayOf(c:getPhotos()) }
  elseif op == "photos" then
    local c, path = findCollection(p.name)
    local photos = arrayOf(c:getPhotos())
    return { collection = path, count = #photos, photos = describePhotos(photos) }
  end
  fail("INVALID_PARAMS", "Unknown collection operation '" .. tostring(op) .. "'.")
end

-------------------------------------------------------------------------------
-- export & preview
-------------------------------------------------------------------------------

local METADATA_OPTIONS = {
  all = "all",
  copyrightOnly = "copyrightOnly",
  copyrightAndContact = "copyrightAndContactOnly",
  allExceptCameraInfo = "allExceptCameraInfo"
}
local SHARPEN_LEVEL = { low = 1, standard = 2, high = 3 }

handlers["lr.export"] = function(p)
  local photos
  if p.collection then
    photos = arrayOf(findCollection(p.collection):getPhotos())
  else
    photos = targetPhotos(p)
  end
  if #photos == 0 then fail("NO_PHOTOS", "Nothing to export.") end
  if type(p.folder) ~= "string" or p.folder == "" then fail("INVALID_PARAMS", "folder (absolute path) is required.") end
  LrFileUtils.createAllDirectories(p.folder)

  local format = p.format or "JPEG"
  local settings = {
    LR_export_destinationType = "specificFolder",
    LR_export_destinationPathPrefix = p.folder,
    LR_export_useSubfolder = false,
    LR_format = format,
    LR_collisionHandling = p.collision or "rename",
    LR_reimportExportedPhoto = false,
    LR_renamingTokensOn = false,
    LR_extensionCase = "lowercase",
    LR_includeVideoFiles = false,
    LR_export_postProcessing = "doNothing",
    LR_embeddedMetadataOption = METADATA_OPTIONS[p.metadata or "all"] or "all",
    LR_removeLocationMetadata = false,
    LR_export_colorSpace = p.colorSpace or "sRGB",
    LR_export_bitDepth = 8
  }
  if format == "JPEG" then
    settings.LR_jpeg_quality = (tonumber(p.quality) or 85) / 100
    settings.LR_jpeg_useLimitSize = false
  elseif format == "TIFF" then
    local tiffCompression = { none = "compressionMethod_None", zip = "compressionMethod_ZIP", lzw = "compressionMethod_LZW" }
    settings.LR_tiff_compressionMethod = tiffCompression[p.tiffCompression or "zip"] or "compressionMethod_ZIP"
    settings.LR_export_bitDepth = (tonumber(p.bitDepth) == 8) and 8 or 16
  end
  if p.longEdge and format ~= "ORIGINAL" and format ~= "DNG" then
    settings.LR_size_doConstrain = true
    settings.LR_size_resizeType = "longEdge"
    settings.LR_size_maxWidth = p.longEdge
    settings.LR_size_maxHeight = p.longEdge
    settings.LR_size_units = "pixels"
    settings.LR_size_doNotEnlarge = true
    settings.LR_size_resolution = 72
    settings.LR_size_resolutionUnits = "inch"
  else
    settings.LR_size_doConstrain = false
  end
  if p.sharpen and p.sharpen ~= "none" and format ~= "ORIGINAL" and format ~= "DNG" then
    settings.LR_outputSharpeningOn = true
    settings.LR_outputSharpeningMedia = p.sharpen
    settings.LR_outputSharpeningLevel = SHARPEN_LEVEL[p.sharpenAmount or "standard"] or 2
  else
    settings.LR_outputSharpeningOn = false
  end

  -- Optional output names: fileNames[i] belongs to the i-th photo (ids order, or catalog order).
  local wantedName = {}
  if type(p.fileNames) == "table" then
    for i, photo in ipairs(photos) do
      local n = p.fileNames[i]
      if type(n) == "string" and n ~= "" then wantedName[photo.localIdentifier] = n end
    end
  end

  local aiExport = updateAISettingsFor(photos)
  if aiExport.pending > 0 then
    fail("AI_SETTINGS_PENDING", aiExport.pending .. " photo(s) still have AI edits to compute (masks, blemish removal). " ..
      "Exporting now would open the 'AI Updates Recommended' dialog. Wait and retry.")
  end
  local session = LrExportSession { photosToExport = photos, exportSettings = settings }
  session:doExportOnCurrentTask()
  local files, failed = {}, 0
  for _, rendition in session:renditions() do
    local ok, pathOrMessage = rendition:waitForRender()
    local id = rendition.photo and rendition.photo.localIdentifier or nil
    local entry = { id = id, ok = ok == true }
    if ok then
      entry.path = pathOrMessage
      local base = id and wantedName[id]
      if base then
        base = base:gsub("[\\/:%*%?\"<>|]", "_"):gsub("%.%w+$", "")
        local target = LrPathUtils.child(LrPathUtils.parent(pathOrMessage), base .. "." .. LrPathUtils.extension(pathOrMessage))
        if target ~= pathOrMessage then
          if LrFileUtils.exists(target) then
            if (p.collision or "rename") == "overwrite" then
              LrFileUtils.delete(target)
            else
              target = LrFileUtils.chooseUniqueFileName(target)
            end
          end
          local moved = LrFileUtils.move(pathOrMessage, target)
          if moved then entry.path = target else entry.renameError = "could not rename to " .. target end
        end
      end
    else
      entry.error = tostring(pathOrMessage); failed = failed + 1
    end
    files[#files + 1] = entry
  end
  return { folder = p.folder, format = format, exported = #files - failed, failed = failed, files = files }
end

-- One thumbnail request. Lightroom often answers first with a small cached thumbnail and then with
-- the requested size; right after a Develop change it may answer "error loading thumb" instead.
local function requestThumb(photo, size, timeout)
  local best, err, calls = nil, nil, 0
  local holder = photo:requestJpegThumbnail(size, size, function(data, message)
    calls = calls + 1
    if data and (not best or #data > #best) then best = data end
    if message then err = message end
  end)
  local waited = 0
  while not best and not err and waited < timeout do
    LrTasks.sleep(0.2)
    waited = waited + 0.2
  end
  local extra = 0
  while best and calls < 2 and extra < 1.5 do
    LrTasks.sleep(0.25)
    extra = extra + 0.25
  end
  holder = nil
  return best, err
end

-- Fallback: render the photo with its current Develop settings through a small export.
local function renderPreviewByExport(photo, size)
  local folder = LrPathUtils.child(LrPathUtils.getStandardFilePath("temp"), "mcp-lr-preview")
  LrFileUtils.createAllDirectories(folder)
  updateAISettingsFor({ photo }, 60)
  local session = LrExportSession {
    photosToExport = { photo },
    exportSettings = {
      LR_export_destinationType = "specificFolder",
      LR_export_destinationPathPrefix = folder,
      LR_export_useSubfolder = false,
      LR_format = "JPEG",
      LR_jpeg_quality = 0.8,
      LR_jpeg_useLimitSize = false,
      LR_collisionHandling = "overwrite",
      LR_reimportExportedPhoto = false,
      LR_renamingTokensOn = false,
      LR_extensionCase = "lowercase",
      LR_export_postProcessing = "doNothing",
      LR_embeddedMetadataOption = "copyrightOnly",
      LR_export_colorSpace = "sRGB",
      LR_export_bitDepth = 8,
      LR_size_doConstrain = true,
      LR_size_resizeType = "longEdge",
      LR_size_maxWidth = size,
      LR_size_maxHeight = size,
      LR_size_units = "pixels",
      LR_size_doNotEnlarge = true,
      LR_size_resolution = 72,
      LR_size_resolutionUnits = "inch",
      LR_outputSharpeningOn = false
    }
  }
  session:doExportOnCurrentTask()
  for _, rendition in session:renditions() do
    local ok, pathOrMessage = rendition:waitForRender()
    if not ok then return nil, tostring(pathOrMessage) end
    local fh = io.open(pathOrMessage, "rb")
    if not fh then return nil, "cannot read " .. tostring(pathOrMessage) end
    local data = fh:read("*a")
    fh:close()
    pcall(LrFileUtils.delete, pathOrMessage)
    return data, nil
  end
  return nil, "export produced no rendition"
end

-- Width and height from a JPEG's SOF marker (nil when the data is not a readable JPEG).
local function jpegDimensions(data)
  if type(data) ~= "string" or #data < 4 or data:byte(1) ~= 0xFF or data:byte(2) ~= 0xD8 then return nil end
  local i, n = 3, #data
  while i + 8 <= n do
    if data:byte(i) ~= 0xFF then return nil end
    local marker = data:byte(i + 1)
    if marker == 0xD8 or marker == 0x01 or (marker >= 0xD0 and marker <= 0xD7) then
      i = i + 2
    else
      local len = data:byte(i + 2) * 256 + data:byte(i + 3)
      if (marker >= 0xC0 and marker <= 0xC3) or (marker >= 0xC5 and marker <= 0xC7) or (marker >= 0xC9 and marker <= 0xCB) or (marker >= 0xCD and marker <= 0xCF) then
        local h = data:byte(i + 5) * 256 + data:byte(i + 6)
        local w = data:byte(i + 7) * 256 + data:byte(i + 8)
        return w, h
      end
      i = i + 2 + len
    end
  end
  return nil
end
H.jpegDimensions = jpegDimensions

handlers["lr.preview"] = function(p)
  local photo = onePhoto(p.id)
  local size = math.max(64, math.min(2048, tonumber(p.size) or 800))
  local best, err, method = nil, nil, "thumbnail"
  local attempts, fallbackReason = 0, nil
  if p.method == "export" then
    fallbackReason = "requested"
  else
    while not best and attempts < 3 do
      attempts = attempts + 1
      best, err = requestThumb(photo, size, 10)
      if not best then LrTasks.sleep(1) end
    end
    if best then
      -- Right after a Develop change (Auto Tone, a new virtual copy shown in Develop) Lightroom can hand
      -- back a full-size placeholder (a blank white frame) instead of a thumbnail. A long edge far above
      -- the requested size is the tell: render the photo by export instead.
      local w, h = jpegDimensions(best)
      if w and h and math.max(w, h) > size * 3 then
        fallbackReason = "thumbnail " .. w .. "x" .. h .. " is far larger than requested (likely a placeholder)"
        best = nil
      end
    elseif not fallbackReason then
      fallbackReason = "no thumbnail" .. (err and (": " .. tostring(err)) or "")
    end
  end
  if not best then
    local exportErr
    best, exportErr = renderPreviewByExport(photo, size)
    method = "export"
    if not best then
      fail("PREVIEW_FAILED", "Lightroom returned no preview" .. (err and (": " .. tostring(err)) or "") ..
        (exportErr and ("; export fallback: " .. exportErr) or ""))
    end
  end
  local d = describePhotos({ photo })[1]
  return {
    id = photo.localIdentifier,
    fileName = d.fileName,
    requestedSize = size,
    bytes = #best,
    method = method,
    attempts = attempts,
    fallbackReason = fallbackReason,
    previewMimeType = "image/jpeg",
    previewBase64 = base64(best)
  }
end

-------------------------------------------------------------------------------
-- escape hatch, batch, dispatch
-------------------------------------------------------------------------------

handlers["lr.raw.executeLua"] = function(p)
  if type(p.code) ~= "string" or p.code == "" then fail("INVALID_PARAMS", "code is required.") end
  -- Lightroom's plug-in sandbox has no getfenv/setfenv, so the context is handed to the chunk as
  -- varargs. The prologue stays on line 1 of the user's code, keeping error line numbers intact.
  local PROLOGUE = "local catalog, import, json, write, describePhotos, photoById = ...; " ..
    "local LrTasks, LrApplication, LrDevelopController, LrPathUtils, LrFileUtils = import 'LrTasks', import 'LrApplication', " ..
    "import 'LrDevelopController', import 'LrPathUtils', import 'LrFileUtils'; "
  local fn, compileErr = loadstring(PROLOGUE .. p.code, "=lr_execute_lua")
  if not fn then fail("LUA_SYNTAX_ERROR", tostring(compileErr)) end
  local result = fn(catalog(), import, json, write, describePhotos, photoById)
  return { result = result }
end

handlers["lr.batch"] = function(p, options)
  local ops = p.operations
  if type(ops) ~= "table" or #ops == 0 then fail("INVALID_PARAMS", "Batch 'operations' must be a non-empty array.") end
  for i, op in ipairs(ops) do
    if type(op) ~= "table" or type(op.action) ~= "string" then fail("INVALID_PARAMS", "Batch operation " .. (i - 1) .. " has no 'action'.") end
    if op.action == "lr.batch" then fail("INVALID_PARAMS", "Batch operation " .. (i - 1) .. " is itself a batch; nesting is not allowed.") end
    if op.action:sub(1, 3) ~= "lr." then fail("INVALID_PARAMS", "Batch operation " .. (i - 1) .. " (" .. op.action .. ") belongs to another app.") end
    if not handlers[op.action] then fail("ACTION_NOT_SUPPORTED", "Batch operation " .. (i - 1) .. ": unknown action " .. op.action) end
  end
  local stopOnError = p.stopOnError ~= false
  local results, failed = {}, 0
  for i, op in ipairs(ops) do
    local started = LrDate.currentTime()
    local ok, data = LrTasks.pcall(handlers[op.action], op.params or {}, options or {})
    local entry = { index = i - 1, action = op.action, ok = ok, durationMs = math.floor((LrDate.currentTime() - started) * 1000) }
    if ok then entry.data = data else entry.error = H.errorInfo(data); failed = failed + 1 end
    results[#results + 1] = entry
    if not ok and stopOnError then break end
  end
  return {
    total = #ops, executed = #results, succeeded = #results - failed, failed = failed,
    stoppedEarly = #results < #ops, results = results,
    note = "Lightroom keeps one undo step per operation."
  }
end

function H.dispatch(action, params, options)
  local fn = handlers[action]
  if not fn then
    fail("ACTION_NOT_SUPPORTED", "Lightroom bridge has no action '" .. tostring(action) .. "'.")
  end
  return fn(params or {}, options or {})
end

function H.actions()
  local list = {}
  for k in pairs(handlers) do list[#list + 1] = k end
  table.sort(list)
  return list
end

return H
