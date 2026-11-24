import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { psdTwin, rewritePsdInputs } from "../../src/core/prefer-psd.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "psd-"));
const touch = (n: string) => (fs.writeFileSync(path.join(dir, n), "x"), path.join(dir, n));

describe("PSD first", () => {
  afterEach(() => delete process.env.JRADB_MCP_PREFER_PSD);

  it("finds the PSD next to an export of it", () => {
    const png = touch("retrato.png");
    const psd = touch("retrato.psd");
    expect(psdTwin(png)).toBe(psd);
    expect(psdTwin(touch("outro.jpg"))).toBeNull();
    expect(psdTwin(psd)).toBeNull();
  });

  it("swaps the inputs of placing tools only, and can be turned off", () => {
    const png = touch("capa.png");
    const psd = touch("capa.psd");
    expect(rewritePsdInputs("id_place_file", { filePath: png }).input).toEqual({ filePath: psd });
    expect(rewritePsdInputs("pr_import_media", { filePaths: [png, "D:/x.mp4"] }).input).toEqual({ filePaths: [psd, "D:/x.mp4"] });
    expect(rewritePsdInputs("ae_manage_project", { operation: "save", filePath: png }).swaps).toEqual([]);
    expect(rewritePsdInputs("ae_manage_project", { operation: "import", filePath: png }).swaps).toHaveLength(1);
    expect(rewritePsdInputs("ps_export_layers", { filePath: png }).swaps).toEqual([]);
    process.env.JRADB_MCP_PREFER_PSD = "off";
    expect(rewritePsdInputs("id_place_file", { filePath: png }).input).toEqual({ filePath: png });
  });
});
