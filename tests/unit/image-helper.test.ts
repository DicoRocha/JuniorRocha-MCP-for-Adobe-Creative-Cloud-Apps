import { describe, it, expect } from "vitest";
import { buildImageToolResponse } from "../../src/core/image-helper.js";

describe("buildImageToolResponse", () => {
  const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  it("returns the preview as an image block and keeps its base64 out of the JSON text", () => {
    const res = buildImageToolResponse({ documentName: "x", previewBase64: b64, previewMimeType: "image/png" }, {});
    expect(res.content.length).toBe(2);
    expect(res.content[0].type).toBe("text");
    expect((res.content[0] as { text: string }).text).not.toContain(b64);
    expect(res.content[1]).toEqual({ type: "image", data: b64, mimeType: "image/png" });
  });

  it("omits the image entirely when includeImageContent is false", () => {
    const res = buildImageToolResponse({ previewBase64: b64 }, { includeImageContent: false });
    expect(res.content.length).toBe(1);
    expect((res.content[0] as { text: string }).text).not.toContain(b64);
  });
});
