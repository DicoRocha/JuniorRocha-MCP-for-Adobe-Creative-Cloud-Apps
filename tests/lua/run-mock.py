"""Runs Handlers.lua against tests/lua/mock-sdk.lua (Lua 5.1 via lupa). Usage: python3 tests/lua/run-mock.py"""
import json, os, sys
from lupa import lua51

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PLUGIN = os.path.join(ROOT, "bridges", "lightroom-classic", "JrAdbMcpBridge.lrplugin")
L = lua51.LuaRuntime()
# Lightroom's plug-in sandbox has no getfenv/setfenv; mirror that so code relying on them fails here too.
L.execute("getfenv, setfenv = nil, nil")
H, J = L.execute(open(os.path.join(ROOT, "tests", "lua", "mock-sdk.lua")).read(), PLUGIN)
call = L.eval("""function(H, J, action, params)
  local ok, r = pcall(H.dispatch, action, J.decode(params), {})
  if ok then return J.encode({ ok = true, data = r }) end
  return J.encode({ ok = false, error = H.errorInfo(r) })
end""")
failures = 0
def run(action, params, check):
    global failures
    out = json.loads(call(H, J, action, json.dumps(params)))
    try:
        check(out)
        print("PASS", action)
    except Exception as e:  # noqa: BLE001
        failures += 1
        print("FAIL", action, repr(e), json.dumps(out)[:400])

run("lr.catalog.getInfo", {}, lambda o: (o["ok"] and o["data"]["photoCount"] == 3 and o["data"]["activePhoto"]["id"] == 101) or 1/0)
run("lr.photo.find", {"source": "all", "filenameContains": "praia"}, lambda o: o["data"]["matched"] == 2 or 1/0)
run("lr.photo.find", {"source": "folder", "folderPath": "d:/FOTOS/", "minRating": 4}, lambda o: [p["id"] for p in o["data"]["photos"]] == [102] or 1/0)
run("lr.photo.find", {"source": "collection", "collection": "viagem"}, lambda o: o["data"]["matched"] == 1 or 1/0)
run("lr.photo.setMetadata", {"ids": [103], "rating": 4, "pick": "picked", "label": "red", "addKeywords": ["mar"]},
    lambda o: (o["data"]["photos"][0]["rating"] == 4 and o["data"]["photos"][0]["pick"] == "picked" and o["data"]["photos"][0]["label"] == "red" and o["data"]["photos"][0]["keywords"] == "mar") or 1/0)
run("lr.develop.apply", {"settings": {"Exposure2012": 0.5, "Clarity2012": 20}}, lambda o: (o["data"]["updated"] == 2 and o["data"]["readback"]["settings"]["Exposure2012"] == 0.5) or 1/0)
run("lr.develop.getSettings", {"id": 102, "keys": ["Exposure2012", "Missing"]}, lambda o: o["data"]["settings"] == {"Exposure2012": 0.5} or 1/0)
run("lr.develop.listPresets", {"search": "preto"}, lambda o: o["data"]["total"] == 1 or 1/0)
run("lr.develop.applyPreset", {"presetName": "preto"}, lambda o: (not o["ok"] and o["error"]["code"] == "PRESET_NOT_FOUND" and "Preto e Branco Alto" in o["error"]["message"]) or 1/0)
run("lr.develop.applyPreset", {"presetName": "Preto e Branco Alto", "ids": [101]}, lambda o: o["data"]["updated"] == 1 or 1/0)
run("lr.develop.copySettings", {"fromId": 101, "ids": [101, 103], "keys": ["Exposure2012"]}, lambda o: (o["data"]["updated"] == 1 and o["data"]["keysCopied"] == 1) or 1/0)
run("lr.develop.snapshot", {"name": "antes"}, lambda o: o["data"]["photos"] == 2 or 1/0)
run("lr.develop.autoTone", {}, lambda o: o["data"]["settings"]["Exposure2012"] == 0.35 or 1/0)
run("lr.collection.manage", {"operation": "list"}, lambda o: o["data"]["collections"][0]["name"] == "Viagem" or 1/0)
run("lr.collection.manage", {"operation": "add", "name": "Viagem", "ids": [102]}, lambda o: o["data"]["added"] == 1 or 1/0)
run("lr.photo.import", {"paths": ["D:/novas/a.jpg", "D:/missing/b.jpg"]}, lambda o: (o["data"]["added"] == 1 and len(o["data"]["errors"]) == 1) or 1/0)
run("lr.export", {"ids": [101], "folder": "D:/saida", "longEdge": 2048, "quality": 90}, lambda o: (o["data"]["exported"] == 1 and o["data"]["files"][0]["path"] == "D:/saida/praia.jpg") or 1/0)
run("lr.preview", {"size": 400}, lambda o: (o["data"]["bytes"] == 30 and o["data"]["previewBase64"].startswith("////")) or 1/0)
# "error loading thumb" right after a Develop change: three thumbnail attempts, then the export fallback.
import tempfile
_tmp = tempfile.mkdtemp()
os.makedirs(os.path.join(_tmp, "mcp-lr-preview"), exist_ok=True)
_active = json.loads(call(H, J, "lr.catalog.getInfo", "{}"))["data"]["activePhoto"]["fileName"]
with open(os.path.join(_tmp, "mcp-lr-preview", _active), "wb") as _fh:
    _fh.write(b"\xff" * 42)
L.execute("MOCK_THUMB_FAIL = true; MOCK_THUMB_CALLS = 0; MOCK_TEMP_DIR = [[" + _tmp + "]]")
run("lr.preview", {"size": 400}, lambda o: (o["ok"] and o["data"]["method"] == "export" and o["data"]["bytes"] == 42
    and o["data"]["attempts"] == 3 and L.eval("MOCK_THUMB_CALLS") == 3) or 1/0)
L.execute("MOCK_THUMB_FAIL = false")
# 13/11/2026 (teste 3): right after Auto Tone Lightroom answered with a 2062x2560 blank placeholder.
L.execute("MOCK_THUMB_BIG = true")
run("lr.preview", {"size": 400}, lambda o: (o["ok"] and o["data"]["method"] == "export"
    and "placeholder" in o["data"]["fallbackReason"]) or 1/0)
L.execute("MOCK_THUMB_BIG = false")
run("lr.preview", {"size": 400, "method": "export"}, lambda o: (o["ok"] and o["data"]["method"] == "export"
    and o["data"]["fallbackReason"] == "requested" and o["data"]["attempts"] == 0) or 1/0)
run("lr.raw.executeLua", {"code": "return type(LrTasks.pcall) .. type(LrApplication)"}, lambda o: o["data"]["result"] == "functiontable" or 1/0)
run("lr.export", {"ids": [101, 102], "folder": "D:/saida", "fileNames": ["neu_01_gespraech", "neu_02_planung"]},
    lambda o: ([f["path"] for f in o["data"]["files"]] == ["D:/saida/neu_01_gespraech.jpg", "D:/saida/neu_02_planung.jpg"]) or 1/0)
run("lr.raw.executeLua", {"code": "return #catalog:getAllPhotos()"}, lambda o: o["data"]["result"] == 4 or 1/0)
run("lr.raw.executeLua", {"code": "local x = 1\nlocal a = nil\nreturn a.b"}, lambda o: (not o["ok"] and "lr_execute_lua:3:" in o["error"]["message"]) or 1/0)
run("lr.batch", {"operations": [{"action": "lr.develop.apply", "params": {"ids": [101], "settings": {"Dehaze": 10}}}, {"action": "lr.photo.select", "params": {"ids": [999]}}, {"action": "lr.catalog.getInfo"}]},
    lambda o: (o["data"]["succeeded"] == 1 and o["data"]["results"][1]["error"]["code"] == "PHOTO_NOT_FOUND" and o["data"]["stoppedEarly"]) or 1/0)
run("lr.batch", {"operations": [{"action": "ps.batchPlay"}]}, lambda o: (not o["ok"]) or 1/0)
run("lr.nope", {}, lambda o: o["error"]["code"] == "ACTION_NOT_SUPPORTED" or 1/0)
print("failures:", failures)
sys.exit(1 if failures else 0)
