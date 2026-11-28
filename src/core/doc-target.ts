import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod";
import type { AdobeAppId } from "./types.js";

/**
 * Target document (rule 27/11/2026): every command in Photoshop, Illustrator and InDesign goes to a named
 * document, never to "whatever is in front" — the person may be working in another file of the same app at
 * the same time. Every ps_/ai_/id_ tool takes documentName; the router hands it to each command the tool sends,
 * and the app side (es3-runtime.jsx __mcpEnterDocument, uxp-photoshop enterDocument) resolves it, refuses
 * DOCUMENT_REQUIRED when several documents are open and none was named, and puts back in front the document
 * that was in front before.
 */
export const DOCUMENT_APPS: ReadonlySet<AdobeAppId> = new Set<AdobeAppId>(["photoshop", "illustrator", "indesign"]);

/** Tools that create, open or only list documents: no target. */
const NO_TARGET_TOOLS = new Set([
  "ps_create_document",
  "ps_open_document",
  "ps_list_documents",
  "ps_list_fonts",
  "ps_list_actions",
  "ps_recipe_carousel_setup",
  "ai_recipe_carousel_artboards",
  "id_recipe_catalog",
  "id_recipe_flyer",
  "id_recipe_manual_skeleton"
]);

export const DOCUMENT_NAME_DESCRIPTION =
  "Target document: the open file's name (e.g. 'Post.psd'), or its full path when two open files share a name. " +
  "Required when more than one document is open in the app: commands never go to whatever document is in front.";

export function wantsDocumentParam(toolName: string): boolean {
  return /^(ps|ai|id)_/.test(toolName) && !NO_TARGET_TOOLS.has(toolName);
}

export function documentNameSchema(): z.ZodOptional<z.ZodString> {
  return z.string().min(1).optional().describe(DOCUMENT_NAME_DESCRIPTION);
}

const store = new AsyncLocalStorage<{ documentName?: string }>();

/** Runs a tool handler with its documentName available to every command the handler sends. */
export function runWithDocument<T>(documentName: unknown, fn: () => T): T {
  if (typeof documentName !== "string" || !documentName.trim()) return fn();
  return store.run({ documentName: documentName.trim() }, fn);
}

/** The documentName of the tool call in progress, if any. */
export function currentDocumentName(): string | undefined {
  return store.getStore()?.documentName;
}

/** params with the current tool call's documentName added (document apps only, when not given). */
export function withTargetDocument(app: AdobeAppId, params: Record<string, unknown>): Record<string, unknown> {
  if (!DOCUMENT_APPS.has(app) || params.documentName !== undefined) return params;
  const name = currentDocumentName();
  return name ? { ...params, documentName: name } : params;
}
