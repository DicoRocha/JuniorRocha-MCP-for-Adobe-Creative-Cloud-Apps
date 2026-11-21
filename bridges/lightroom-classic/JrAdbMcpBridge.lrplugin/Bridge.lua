-- Long-poll loop: GET /http-bridge/poll returns one command (200) or nothing (204); results go to POST /http-bridge/result.
local LrHttp = import "LrHttp"
local LrTasks = import "LrTasks"
local LrPrefs = import "LrPrefs"
local LrLogger = import "LrLogger"
local LrApplication = import "LrApplication"
local LrDate = import "LrDate"

local json = require("json")

local logger = LrLogger("JrAdbMcpBridge")
logger:enable("logfile")

local PLUGIN_VERSION = "1.5.6"
local G = _G or getfenv(0)
local state = G.JRADB_MCP_BRIDGE_STATE
if type(state) ~= "table" then
  state = { generation = 0, running = false, commands = 0, connected = false }
  G.JRADB_MCP_BRIDGE_STATE = state
end

local Bridge = {}

function Bridge.port()
  local prefs = LrPrefs.prefsForPlugin()
  local p = tonumber(prefs.port)
  -- 3001 was the default until 1.8; a saved 3001 is the old default, not a choice, so it follows the new one.
  if p == 3001 then p = 31001; prefs.port = 31001 end
  if not p or p < 1 or p > 65535 then p = 31001 end
  return math.floor(p)
end

local function baseUrl()
  return "http://127.0.0.1:" .. tostring(Bridge.port()) .. "/http-bridge/"
end

local HEADERS = {
  { field = "X-Adobe-MCP", value = "lightroom" },
  { field = "Content-Type", value = "application/json" }
}

local function urlEncode(s)
  return (tostring(s):gsub("[^%w%-%._~]", function(c) return string.format("%%%02X", string.byte(c)) end))
end

local function appVersion()
  local ok, v = pcall(function() return LrApplication.versionString() end)
  return ok and v or "unknown"
end

local function postResult(packet)
  local body = json.encode(packet)
  for attempt = 1, 3 do
    local _, hdrs = LrHttp.post(baseUrl() .. "result?app=lightroom", body, HEADERS, "POST", 60)
    if hdrs and hdrs.status == 200 then return true end
    logger:warn("result post failed (attempt " .. attempt .. "): " .. tostring(hdrs and (hdrs.status or (hdrs.error and hdrs.error.name))))
    LrTasks.sleep(attempt)
  end
  return false
end

local function runCommand(cmd)
  LrTasks.startAsyncTask(function()
    local Handlers = require("Handlers")
    local started = LrDate.currentTime()
    local ok, result = LrTasks.pcall(Handlers.dispatch, cmd.action, cmd.params or {}, cmd.options or {})
    local packet = {
      type = "response",
      id = cmd.id,
      app = "lightroom",
      bridgeType = "lua",
      ok = ok,
      durationMs = math.floor((LrDate.currentTime() - started) * 1000)
    }
    if ok then
      packet.data = result
    else
      packet.error = Handlers.errorInfo(result)
      logger:warn("command " .. tostring(cmd.action) .. " failed: " .. tostring(packet.error.message))
    end
    state.commands = (state.commands or 0) + 1
    postResult(packet)
  end, "MCP command " .. tostring(cmd.action))
end

function Bridge.start(reason)
  state.generation = (state.generation or 0) + 1
  local generation = state.generation
  state.running = true
  -- A newer instance id tells the Hub to retire pollers left behind by a plug-in reload.
  state.instance = string.format("%.0f%03d", math.floor(LrDate.currentTime() * 1000), math.random(0, 999))
  local instance = state.instance
  logger:info("bridge start (" .. tostring(reason) .. ") on port " .. Bridge.port())

  LrTasks.startAsyncTask(function()
    local failures = 0
    while state.running and state.generation == generation do
      local url = baseUrl() .. "poll?app=lightroom&bridge=lua&instance=" .. instance ..
        "&appVersion=" .. urlEncode(appVersion()) .. "&pluginVersion=" .. PLUGIN_VERSION
      local body, hdrs = LrHttp.get(url, HEADERS, 40)
      if not (state.running and state.generation == generation) then break end
      local status = hdrs and hdrs.status
      if status == 200 and body and #body > 0 then
        failures, state.connected, state.lastError = 0, true, nil
        local okDecode, cmd = pcall(json.decode, body)
        if okDecode and type(cmd) == "table" and cmd.type == "command" then
          runCommand(cmd)
        else
          logger:warn("bad command payload: " .. tostring(cmd))
        end
      elseif status == 204 then
        failures, state.connected, state.lastError = 0, true, nil
      elseif status == 410 then
        logger:info("Hub retired this poller (a newer instance is running)")
        break
      else
        failures = failures + 1
        state.connected = false
        state.lastError = status and ("HTTP " .. tostring(status)) or (hdrs and hdrs.error and hdrs.error.name) or "Hub offline"
        LrTasks.sleep(math.min(10, 1 + failures))
      end
    end
    if state.generation == generation then
      state.running = false
      state.connected = false
    end
  end, "Junior Rocha MCP bridge")
end

function Bridge.stop(reason)
  logger:info("bridge stop (" .. tostring(reason) .. ")")
  state.running = false
  state.connected = false
  state.generation = (state.generation or 0) + 1
end

function Bridge.status()
  return {
    running = state.running == true,
    connected = state.connected == true,
    commands = state.commands or 0,
    lastError = state.lastError,
    url = baseUrl()
  }
end

return Bridge
