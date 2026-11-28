import { describe, expect, it } from "vitest";
import { checkUrl, resolveTarget } from "../../src/media/download.js";

describe("media_download_url helpers", () => {
  it("keeps an extension or adds one from the type", () => {
    expect(resolveTarget("D:/x/fundo.png", "image/jpeg")).toBe("D:/x/fundo.png");
    expect(resolveTarget("D:/x/fundo", "image/png")).toBe("D:/x/fundo.png");
    expect(resolveTarget("D:/x/clip", "video/mp4; charset=binary")).toBe("D:/x/clip.mp4");
    expect(resolveTarget("D:/x/arquivo", null)).toBe("D:/x/arquivo");
  });
  it("accepts only public http(s) links", () => {
    expect(checkUrl("https://pikaso.cdnpk.net/a/render.png?token=1").hostname).toBe("pikaso.cdnpk.net");
    expect(() => checkUrl("file:///C:/x.png")).toThrow(/http/);
    expect(() => checkUrl("http://localhost:3000/x.png")).toThrow(/local/);
    expect(() => checkUrl("http://192.168.0.10/x.png")).toThrow(/local/);
    expect(() => checkUrl("nada")).toThrow(/valid/);
  });
});
