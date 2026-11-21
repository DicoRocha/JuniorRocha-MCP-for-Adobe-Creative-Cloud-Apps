local LrDialogs = import "LrDialogs"
local Bridge = require("Bridge")
Bridge.start("menu")
LrDialogs.showBezel("Ponte MCP iniciada (porta " .. tostring(Bridge.port()) .. ")")
