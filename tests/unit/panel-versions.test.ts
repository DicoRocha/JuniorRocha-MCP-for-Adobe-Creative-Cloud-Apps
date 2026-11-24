import { describe, expect, it } from "vitest";
import * as fs from "node:fs";

const read = (p: string) => fs.readFileSync(p, "utf8");

describe("panels report the version they install with", () => {
  it("CEP main.js pluginVersion = manifest ExtensionBundleVersion (it said 1.4.11 while 1.4.16 was installed)", () => {
    const manifest = /ExtensionBundleVersion="([\d.]+)"/.exec(read("bridges/cep-universal-bridge/CSXS/manifest.xml"))![1];
    expect(/pluginVersion: "([\d.]+)"/.exec(read("bridges/cep-universal-bridge/js/main.js"))![1]).toBe(manifest);
  });

  it("each UXP main.js pluginVersion = its manifest version", () => {
    for (const app of ["uxp-photoshop", "uxp-premiere", "uxp-indesign"]) {
      const v = JSON.parse(read(`bridges/${app}/manifest.json`)).version;
      expect(/pluginVersion: "([\d.]+)"/.exec(read(`bridges/${app}/main.js`))![1], app).toBe(v);
    }
  });

  it("the Lightroom plug-in display version follows VERSION", () => {
    const info = read("bridges/lightroom-classic/JrAdbMcpBridge.lrplugin/Info.lua");
    const m = /major = (\d+), minor = (\d+), revision = (\d+), build = \d+, display = "([\d.]+)"/.exec(info)!;
    expect(m[4]).toBe(`${m[1]}.${m[2]}.${m[3]}`);
  });
});

describe("Lightroom plug-in", () => {
  it("Bridge.lua PLUGIN_VERSION = Info.lua display version", () => {
    const disp = /display = "([\d.]+)"/.exec(read("bridges/lightroom-classic/JrAdbMcpBridge.lrplugin/Info.lua"))![1];
    expect(/PLUGIN_VERSION = "([\d.]+)"/.exec(read("bridges/lightroom-classic/JrAdbMcpBridge.lrplugin/Bridge.lua"))![1]).toBe(disp);
  });
});
