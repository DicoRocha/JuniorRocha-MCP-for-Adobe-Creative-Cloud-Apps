import * as fs from "node:fs";
import * as path from "node:path";
import { getErrorHint } from "./error-hints.js";

export type McpToolContentItem =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image";
      data: string;
      mimeType: string;
    };

export interface McpToolResponse {
  [key: string]: unknown;
  content: McpToolContentItem[];
  isError?: boolean;
}

/**
 * Reads a PNG/JPEG file from disk (or takes an existing base64 string) and builds a
 * standard MCP response containing both structured JSON metadata and an ImageContent block.
 */
export function buildImageToolResponse(
  summaryData: Record<string, unknown>,
  options: {
    filePath?: string;
    base64Data?: string;
    mimeType?: string;
    includeImageContent?: boolean;
  }
): McpToolResponse {
  // The image travels as an ImageContent block. Never repeat its base64 inside the JSON text:
  // a single preview would add megabytes of text to the model's context.
  const inlineBase64 = typeof summaryData.previewBase64 === "string" ? summaryData.previewBase64 : undefined;
  const summary: Record<string, unknown> = { ...summaryData };
  delete summary.previewBase64;
  if (!options.base64Data && inlineBase64) {
    options = { ...options, base64Data: inlineBase64 };
  }
  if (!options.mimeType && typeof summary.previewMimeType === "string") {
    options = { ...options, mimeType: summary.previewMimeType };
  }

  const content: McpToolContentItem[] = [
    {
      type: "text",
      text: JSON.stringify(summary, null, 2)
    }
  ];

  const includeImage = options.includeImageContent ?? true;
  if (!includeImage) {
    return { content };
  }

  let base64 = options.base64Data;
  let mimeType = options.mimeType || "image/png";
  // No image came with the answer (a panel may send it outside `data`, and large previews are not encoded inside
  // the app): read the file the handler wrote.
  if (!base64 && !options.filePath) {
    for (const key of ["outputPath", "previewPath"]) {
      const p = summary[key];
      if (typeof p === "string" && /\.(png|jpe?g|webp)$/i.test(p) && fs.existsSync(p)) {
        options = { ...options, filePath: p };
        break;
      }
    }
  }

  if (!base64 && options.filePath && fs.existsSync(options.filePath)) {
    const ext = path.extname(options.filePath).toLowerCase();
    if (ext === ".jpg" || ext === ".jpeg") {
      mimeType = "image/jpeg";
    } else if (ext === ".webp") {
      mimeType = "image/webp";
    }
    const buf = fs.readFileSync(options.filePath);
    base64 = buf.toString("base64");
  }

  if (base64) {
    const cleaned = base64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
    content.push({
      type: "image",
      data: cleaned,
      mimeType
    });
  }

  return { content };
}

/**
 * Waits until a file exists and its size has stopped changing (an app writing it asynchronously).
 * Returns false on timeout. Used for After Effects previews, which must not wait inside the host.
 */
export async function waitForStableFile(filePath: string, timeoutMs = 30000, intervalMs = 150): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let lastSize = -1;
  while (Date.now() < deadline) {
    let size = -1;
    try {
      size = fs.statSync(filePath).size;
    } catch {
      size = -1;
    }
    if (size > 0 && size === lastSize) {
      return true;
    }
    lastSize = size;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

export function formatSuccessResponse(
  data: unknown,
  previewBase64?: string,
  previewMimeType?: string
): McpToolResponse {
  const content: McpToolContentItem[] = [
    {
      type: "text",
      text: typeof data === "string" ? data : JSON.stringify(data, null, 2)
    }
  ];

  if (previewBase64) {
    content.push({
      type: "image",
      data: previewBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, ""),
      mimeType: previewMimeType || "image/png"
    });
  }

  return { content };
}

export function formatErrorResponse(error: unknown): McpToolResponse {
  const payload: { ok: false; error: Record<string, unknown> } =
    error instanceof Error
      ? {
          ok: false,
          error: {
            name: error.name,
            code: (error as { code?: string }).code || "EXECUTION_ERROR",
            message: error.message,
            app: (error as { app?: string }).app,
            details: (error as { details?: unknown }).details
          }
        }
      : {
          ok: false,
          error: {
            code: "UNKNOWN_ERROR",
            message: String(error)
          }
        };

  // A host error code (e.g. SyntaxError from a script) is more specific than the wrapper's.
  const details = payload.error.details as { code?: string } | undefined;
  const code = String(payload.error.code);
  const hint =
    getErrorHint(code, String(payload.error.message)) ||
    (details && typeof details.code === "string" ? getErrorHint(details.code, String(payload.error.message)) : undefined);
  if (hint) {
    payload.error.recoverable = hint.recoverable;
    payload.error.hint = hint.hint;
    if (hint.nextTools) {
      payload.error.nextTools = hint.nextTools;
    }
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2)
      }
    ],
    isError: true
  };
}
