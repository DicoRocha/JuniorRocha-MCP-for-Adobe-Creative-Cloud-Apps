--[[ Junior Rocha MCP — Lightroom Classic bridge.
Long-polls the local MCP Hub (http://127.0.0.1:31001/http-bridge/*) and runs lr.* commands with the Lightroom SDK.
The bridge starts with Lightroom (LrForceInitPlugin) and can be started/stopped from
Library > Plug-in Extras (Biblioteca > Extras do plug-in). ]]
return {
  LrSdkVersion = 10.0,
  LrSdkMinimumVersion = 6.0,
  LrToolkitIdentifier = "com.jradbmcp.lightroom",
  LrPluginName = "Junior Rocha MCP",
  LrInitPlugin = "Init.lua",
  LrForceInitPlugin = true,
  LrShutdownPlugin = "Shutdown.lua",
  LrPluginInfoProvider = "PluginInfo.lua",
  LrLibraryMenuItems = {
    { title = "Iniciar ponte MCP", file = "StartBridge.lua" },
    { title = "Parar ponte MCP", file = "StopBridge.lua" },
    { title = "Status da ponte MCP", file = "StatusBridge.lua" }
  },
  LrExportMenuItems = {
    { title = "Iniciar ponte MCP", file = "StartBridge.lua" },
    { title = "Parar ponte MCP", file = "StopBridge.lua" },
    { title = "Status da ponte MCP", file = "StatusBridge.lua" }
  },
  VERSION = { major = 1, minor = 5, revision = 8, build = 0, display = "1.5.8" }
}
