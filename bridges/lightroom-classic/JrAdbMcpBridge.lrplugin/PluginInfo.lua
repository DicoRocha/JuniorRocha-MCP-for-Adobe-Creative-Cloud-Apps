local LrView = import "LrView"
local LrPrefs = import "LrPrefs"
local LrBinding = import "LrBinding"

return {
  sectionsForTopOfDialog = function(f, _)
    local prefs = LrPrefs.prefsForPlugin()
    if prefs.port == nil or tonumber(prefs.port) == 3001 then prefs.port = 31001 end
    return {
      {
        title = "Junior Rocha MCP",
        bind_to_object = prefs,
        f:row {
          f:static_text { title = "Porta do Hub MCP (127.0.0.1):", alignment = "right" },
          f:edit_field { value = LrView.bind("port"), width_in_digits = 6, min = 1, max = 65535, precision = 0 }
        },
        f:static_text {
          title = "A ponte inicia junto com o Lightroom. Depois de mudar a porta use Biblioteca > Extras do plug-in > Iniciar ponte MCP.",
          width_in_chars = 60, height_in_lines = 2
        }
      }
    }
  end
}
