local LrDialogs = import "LrDialogs"
local s = require("Bridge").status()
LrDialogs.message(
  "Junior Rocha MCP",
  "Ponte: " .. (s.running and "ativa" or "parada") ..
    "\nHub: " .. s.url ..
    "\nConectado ao Hub: " .. (s.connected and "sim" or "não") ..
    "\nComandos executados: " .. tostring(s.commands) ..
    (s.lastError and ("\nÚltimo erro: " .. tostring(s.lastError)) or ""),
  "info"
)
