import { describe, it, expect } from "vitest";
import * as vm from "node:vm";
import { buildAfterEffectsCliScript, runPowerShell } from "../../src/core/com-runner.js";
import { BridgeCommandPacket } from "../../src/core/types.js";

describe("OS fallbacks (After Effects CLI + PowerShell)", () => {
  it("builds an After Effects -r script that is valid ES3 and writes the JSON envelope to the output file", () => {
    const packet: BridgeCommandPacket = {
      type: "command",
      id: "t1",
      app: "after-effects",
      action: "ae.comp.list",
      params: {},
      options: {}
    };
    const script = buildAfterEffectsCliScript(packet, "C:/Temp/ae_out_t1.json");

    const written: string[] = [];
    function FileMock(this: Record<string, unknown>, p: string) {
      this.path = p;
      this.encoding = "";
      this.open = () => true;
      this.write = (s: string) => {
        written.push(s);
        return true;
      };
      this.close = () => true;
    }
    const sandbox: Record<string, unknown> = {
      File: FileMock,
      CompItem: function () {},
      FolderItem: function () {},
      app: { beginUndoGroup: () => {}, endUndoGroup: () => {}, project: { numItems: 0, item: () => null } }
    };
    vm.createContext(sandbox);
    expect(() => vm.runInContext(script, sandbox)).not.toThrow();
    expect(written.length).toBe(1);
    const envelope = JSON.parse(written[0]);
    expect(envelope.ok).toBe(true);
  });

  it("falls back to Windows PowerShell when PowerShell 7 (pwsh) is not installed", async () => {
    const tried: string[] = [];
    const fakeExec = async (file: string) => {
      tried.push(file);
      if (file === "pwsh") {
        const err = new Error("spawn pwsh ENOENT") as Error & { code: string };
        err.code = "ENOENT";
        throw err;
      }
      return { stdout: "ok\n", stderr: "" };
    };
    const out = await runPowerShell("Write-Output ok", { timeout: 1000 }, fakeExec);
    expect(out.trim()).toBe("ok");
    expect(tried).toEqual(["pwsh", "powershell.exe"]);
  });
});
