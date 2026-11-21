-- Minimal Lightroom SDK mock to exercise Handlers.lua outside Lightroom (run by tests/lua/run-mock.py with lupa).
local PLUGIN_DIR = ...
package.path = PLUGIN_DIR .. "/?.lua;" .. package.path

local writes = {}
local function newPhoto(id, name, rating)
  local p = { localIdentifier = id, _raw = { path = "D:/fotos/" .. name, rating = rating, pickStatus = 0, colorNameForLabel = "", fileFormat = "JPG",
    dimensions = { width = 6000, height = 4000 }, dateTimeOriginalISO8601 = "2026-01-01T10:00:00", isVirtualCopy = false, keywords = {} },
    _fmt = { fileName = name, keywordTags = "", title = "", copyName = "" }, _dev = { Exposure2012 = 0, Contrast2012 = 0 } }
  function p:getRawMetadata(k) return self._raw[k] end
  function p:getFormattedMetadata(k) return self._fmt[k] end
  function p:setRawMetadata(k, v) assert(#writes > 0, "write outside write access"); self._raw[k] = v end
  function p:getDevelopSettings() local c = {} for k, v in pairs(self._dev) do c[k] = v end return c end
  function p:applyDevelopSettings(s) assert(#writes > 0, "write outside write access")
    -- Lightroom deep-copies the table and refuses metatables (13/11/2026: "deepCopy does not support metatables").
    assert(getmetatable(s) == nil, "deepCopy does not support metatables")
    for k, v in pairs(s) do self._dev[k] = v end end
  function p:applyDevelopPreset(preset) assert(#writes > 0); self._dev.Preset = preset:getName() end
  function p:createDevelopSnapshot(name) assert(#writes > 0); self._snap = name end
  function p:addKeyword(kw) table.insert(self._raw.keywords, kw); self._fmt.keywordTags = kw:getName() end
  function p:removeKeyword(kw) self._raw.keywords = {}; self._fmt.keywordTags = "" end
  function p:requestJpegThumbnail(w, h, cb)
    MOCK_THUMB_CALLS = (MOCK_THUMB_CALLS or 0) + 1
    if MOCK_THUMB_FAIL then cb(nil, "error loading thumb"); return {} end
    -- Full-size placeholder (blank frame) Lightroom answers right after Auto Tone: JPEG 2062x2560.
    if MOCK_THUMB_BIG then cb("\255\216\255\192\0\17\8\10\0\8\14" .. string.rep("\0", 40)); return {} end
    cb(string.rep("\255", 10)); cb(string.rep("\255", 30)); return {}
  end
  return p
end

local photos = { newPhoto(101, "praia.jpg", 3), newPhoto(102, "montanha.jpg", 5), newPhoto(103, "praia2.jpg", nil) }
local collection = { _photos = { photos[1] } }
function collection:getName() return "Viagem" end
function collection:getPhotos() return self._photos end
function collection:addPhotos(list) for _, p in ipairs(list) do table.insert(self._photos, p) end end
function collection:removePhotos(list) self._photos = {} end
function collection:isSmartCollection() return false end

local folder = {}
function folder:getPath() return "D:\\fotos" end
function folder:getPhotos() return photos end
function folder:getChildren() return {} end

local catalog = {}
function catalog:getAllPhotos() return photos end
function catalog:getTargetPhotos() return { photos[1], photos[2] } end
function catalog:getTargetPhoto() return photos[1] end
function catalog:getPath() return "D:/catalogo.lrcat" end
function catalog:getActiveSources() return { folder, "kAllPhotos" } end
function catalog:getFolders() return { folder } end
function catalog:getChildCollections() return { collection } end
function catalog:getChildCollectionSets() return {} end
function catalog:batchGetRawMetadata(list, keys) local out = {} for _, p in ipairs(list) do out[p] = p._raw end return out end
function catalog:batchGetFormattedMetadata(list, keys) local out = {} for _, p in ipairs(list) do out[p] = p._fmt end return out end
function catalog:withWriteAccessDo(name, fn) table.insert(writes, name); fn(); table.remove(writes); MOCK_WRITES = (MOCK_WRITES or 0) + 1; return "executed" end
function catalog:createKeyword(name) local kw = { n = name } function kw:getName() return self.n end return kw end
function catalog:setSelectedPhotos(a, list) MOCK_SELECTED = #list end
function catalog:getPhotoByLocalId(id) for _, p in ipairs(photos) do if p.localIdentifier == id then return p end end end
function catalog:findPhotoByPath(path) return nil end
function catalog:addPhoto(path) assert(#writes > 0); local p = newPhoto(200 + #photos, path:match("[^/\\]+$"), 0); table.insert(photos, p); return p end
function catalog:createCollection(name) return collection end
function catalog:createCollectionSet(name) return {} end

local preset = {}
function preset:getName() return "Preto e Branco Alto" end
function preset:getUuid() return "uuid-1" end
local presetFolder = {}
function presetFolder:getName() return "Meus presets" end
function presetFolder:getDevelopPresets() return { preset } end

local modules = {
  LrApplication = { activeCatalog = function() return catalog end, versionString = function() return "15.0 mock" end,
    developPresetFolders = function() return { presetFolder } end },
  LrApplicationView = { getCurrentModuleName = function() return "library" end, switchToModule = function() end },
  LrTasks = { pcall = pcall, sleep = function() end, startAsyncTask = function(f) f() end },
  LrFileUtils = { exists = function(p) return not p:find("missing") and not p:find("/neu_") end, createAllDirectories = function() end,
    delete = function() return true end, move = function(a, b) MOCK_MOVED = (MOCK_MOVED or "") .. a .. ">" .. b .. ";" return true end,
    chooseUniqueFileName = function(p) return p end },
  LrPathUtils = { child = function(a, b) return a .. "/" .. b end,
    parent = function(p) return (p:gsub("[/\\][^/\\]*$", "")) end,
    extension = function(p) return p:match("%.([^.]+)$") or "" end,
    getStandardFilePath = function() return MOCK_TEMP_DIR or "/tmp" end },
  LrStringUtils = {},
  LrDate = { currentTime = function() return os.time() end },
  LrDevelopController = { setAutoTone = function() photos[1]._dev.Exposure2012 = 0.35 end },
  LrExportSession = function(args)
    local s = {}
    function s:doExportOnCurrentTask() MOCK_EXPORT_SETTINGS = args.exportSettings end
    function s:renditions()
      local i = 0
      return function()
        i = i + 1
        local p = args.photosToExport[i]
        if not p then return nil end
        return i, { photo = p, waitForRender = function() return true, args.exportSettings.LR_export_destinationPathPrefix .. "/" .. p._fmt.fileName end }
      end
    end
    return s
  end
}
function import(name) return assert(modules[name], "unknown module " .. name) end

return require("Handlers"), require("json")
