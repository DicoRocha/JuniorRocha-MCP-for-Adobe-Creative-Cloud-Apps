/**
 * lr_build_mask_presets (18/11/2026, B61): Develop presets that carry an AI mask of ONE part of the person
 * (teeth, facial skin, iris, lips, hair, clothes...) or of the background, which the Lightroom SDK cannot
 * create (its createNewMask only knows the whole "people" selection).
 *
 * The part is a number in the XMP (crs:MaskSubCategoryID). The codes below were read from two XMP files
 * saved by the user in Lightroom Classic 16 (pesquisa/referencias/JuniorRocha-57 and JuniorRocha-8); the
 * teeth code was the same in both photos. Lightroom recomputes an AI mask of a preset on every photo.
 * NOT validated live yet: the first run must apply one preset to a photo and look at the mask.
 */
import { z } from "zod";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { formatErrorResponse, formatSuccessResponse } from "../../core/image-helper.js";

export const MASK_PARTS = {
  facialSkin: { id: 2, name: "Facial Skin" },
  irisAndPupil: { id: 3, name: "Iris and Pupil" },
  bodySkin: { id: 4, name: "Body Skin" },
  hair: { id: 5, name: "Hair" },
  lips: { id: 6, name: "Lips" },
  eyeSclera: { id: 8, name: "Eye Sclera" },
  eyebrows: { id: 9, name: "Eyebrows" },
  clothes: { id: 11, name: "Clothes" },
  teeth: { id: 12, name: "Teeth" },
  background: { id: 22, name: "Background" }
} as const;

export type MaskPart = keyof typeof MASK_PARTS;

/** Slider name -> XMP attribute and divisor (the XMP stores -1..1; Exposure is stops / 4). */
const LOCAL: Record<string, { attr: string; div: number; min: number; max: number }> = {
  exposure: { attr: "LocalExposure2012", div: 4, min: -4, max: 4 },
  contrast: { attr: "LocalContrast2012", div: 100, min: -100, max: 100 },
  highlights: { attr: "LocalHighlights2012", div: 100, min: -100, max: 100 },
  shadows: { attr: "LocalShadows2012", div: 100, min: -100, max: 100 },
  whites: { attr: "LocalWhites2012", div: 100, min: -100, max: 100 },
  blacks: { attr: "LocalBlacks2012", div: 100, min: -100, max: 100 },
  temperature: { attr: "LocalTemperature", div: 100, min: -100, max: 100 },
  tint: { attr: "LocalTint", div: 100, min: -100, max: 100 },
  saturation: { attr: "LocalSaturation", div: 100, min: -100, max: 100 },
  texture: { attr: "LocalTexture", div: 100, min: -100, max: 100 },
  clarity: { attr: "LocalClarity2012", div: 100, min: -100, max: 100 },
  dehaze: { attr: "LocalDehaze", div: 100, min: -100, max: 100 },
  sharpness: { attr: "LocalSharpness", div: 100, min: -100, max: 100 },
  noise: { attr: "LocalLuminanceNoise", div: 100, min: -100, max: 100 }
};

export const ADJUSTMENT_NAMES = Object.keys(LOCAL);

export interface MaskPresetSpec {
  name: string;
  part: MaskPart;
  adjustments: Record<string, number>;
  group?: string;
  inverted?: boolean;
}

/** Starting values. Only "Dentes" is the user's own recipe (XMP of 18/11/2026); the others are gentle defaults to tune. */
export const PORTRAIT_SET: MaskPresetSpec[] = [
  { name: "MCP Dentes - clarear", part: "teeth", adjustments: { saturation: -39, temperature: -7 } },
  { name: "MCP Pele do rosto - suavizar", part: "facialSkin", adjustments: { texture: -15, clarity: -5 } },
  { name: "MCP Iris - realcar", part: "irisAndPupil", adjustments: { exposure: 0.2, clarity: 8 } },
  { name: "MCP Branco do olho - limpar", part: "eyeSclera", adjustments: { saturation: -15, exposure: 0.1 } },
  { name: "MCP Labios - cor", part: "lips", adjustments: { saturation: 8 } },
  { name: "MCP Cabelo - definicao", part: "hair", adjustments: { clarity: 8 } },
  { name: "MCP Fundo - escurecer", part: "background", adjustments: { exposure: -0.2 } }
];

function hex32(seed: string): string {
  return createHash("md5").update(seed).digest("hex").toUpperCase();
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function num(v: number): string {
  return (Math.round(v * 1000000) / 1000000).toFixed(6).replace(/\.?0+$/, "") || "0";
}

/** XMP text of one Develop preset holding one AI mask (ids are derived from the name, so a rebuild overwrites cleanly). */
export function buildMaskPresetXmp(spec: MaskPresetSpec): string {
  const part = MASK_PARTS[spec.part];
  if (!part) throw Object.assign(new Error(`Unknown part '${spec.part}'. Use one of: ${Object.keys(MASK_PARTS).join(", ")}.`), { code: "INVALID_PARAMS" });
  const attrs: string[] = [];
  for (const [k, v] of Object.entries(spec.adjustments)) {
    const def = LOCAL[k];
    if (!def) throw Object.assign(new Error(`Unknown adjustment '${k}'. Use one of: ${ADJUSTMENT_NAMES.join(", ")}.`), { code: "INVALID_PARAMS" });
    if (typeof v !== "number" || v < def.min || v > def.max) throw Object.assign(new Error(`Adjustment '${k}' must be between ${def.min} and ${def.max}.`), { code: "INVALID_PARAMS" });
    attrs.push(`crs:${def.attr}="${num(v / def.div)}"`);
  }
  if (!attrs.length) throw Object.assign(new Error("Give at least one adjustment."), { code: "INVALID_PARAMS" });
  const group = spec.group ?? "MCP Mascaras";
  const alt = (tag: string, text: string) => `   <crs:${tag}>\n    <rdf:Alt>\n     <rdf:li xml:lang="x-default">${esc(text)}</rdf:li>\n    </rdf:Alt>\n   </crs:${tag}>`;
  return [
    `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        ">`,
    ` <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">`,
    `  <rdf:Description rdf:about=""`,
    `    xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"`,
    `   crs:PresetType="Normal"`,
    `   crs:Cluster=""`,
    `   crs:UUID="${hex32("preset:" + spec.name)}"`,
    `   crs:SupportsAmount2="True"`,
    `   crs:SupportsAmount="True"`,
    `   crs:SupportsColor="True"`,
    `   crs:SupportsMonochrome="True"`,
    `   crs:SupportsHighDynamicRange="True"`,
    `   crs:SupportsNormalDynamicRange="True"`,
    `   crs:SupportsSceneReferred="True"`,
    `   crs:SupportsOutputReferred="True"`,
    `   crs:RequiresRGBTables="False"`,
    `   crs:CameraModelRestriction=""`,
    `   crs:Copyright=""`,
    `   crs:ContactInfo=""`,
    `   crs:Version="16.0"`,
    `   crs:ProcessVersion="15.4"`,
    `   crs:HasSettings="True">`,
    alt("Name", spec.name),
    alt("ShortName", ""),
    alt("SortName", ""),
    alt("Group", group),
    alt("Description", `Mascara de IA: ${part.name}`),
    `   <crs:MaskGroupBasedCorrections>`,
    `    <rdf:Seq>`,
    `     <rdf:li>`,
    `      <rdf:Description`,
    `       crs:What="Correction"`,
    `       crs:CorrectionAmount="1"`,
    `       crs:CorrectionActive="true"`,
    `       crs:CorrectionName="${esc(part.name)}"`,
    `       crs:CorrectionSyncID="${hex32("corr:" + spec.name)}"`,
    ...attrs.map((a) => `       ${a}`),
    `       crs:LocalCurveRefineSaturation="100">`,
    `      <crs:CorrectionMasks>`,
    `       <rdf:Seq>`,
    `        <rdf:li`,
    `         crs:What="Mask/Image"`,
    `         crs:MaskActive="true"`,
    `         crs:MaskName="${esc(part.name)}"`,
    `         crs:MaskBlendMode="0"`,
    `         crs:MaskInverted="${spec.inverted ? "true" : "false"}"`,
    `         crs:MaskSyncID="${hex32("mask:" + spec.name)}"`,
    `         crs:MaskValue="1"`,
    `         crs:MaskVersion="1"`,
    `         crs:MaskSubType="0"`,
    `         crs:MaskSubCategoryID="${part.id}"`,
    `         crs:ReferencePoint="0.500000 0.500000"/>`,
    `       </rdf:Seq>`,
    `      </crs:CorrectionMasks>`,
    `      </rdf:Description>`,
    `     </rdf:li>`,
    `    </rdf:Seq>`,
    `   </crs:MaskGroupBasedCorrections>`,
    `  </rdf:Description>`,
    ` </rdf:RDF>`,
    `</x:xmpmeta>`,
    ``
  ].join("\n");
}

export function presetFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "-").trim() + ".xmp";
}

/** Folder where Lightroom Classic and Camera Raw read user presets. */
export function cameraRawSettingsFolder(env: NodeJS.ProcessEnv = process.env, platform: string = process.platform): string {
  if (platform === "win32") return path.join(env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "Adobe", "CameraRaw", "Settings");
  return path.join(os.homedir(), "Library", "Application Support", "Adobe", "CameraRaw", "Settings");
}

export function registerLightroomMaskPresets(server: McpServer): void {
  server.tool(
    "lr_build_mask_presets",
    "Writes Lightroom/Camera Raw Develop presets that carry an AI mask of ONE part of the person (teeth, facial skin, iris, eye white, lips, " +
      "hair, eyebrows, body skin, clothes) or of the background - parts the Lightroom SDK cannot select by itself. Lightroom recomputes the mask " +
      "on each photo when the preset is applied (lr_apply_develop_preset). set='retrato' writes the house portrait set (teeth = the user's own " +
      "recipe: saturation -39, temperature -7; the others are gentle starting values). install=true copies them into the Camera Raw presets " +
      "folder; Lightroom must be restarted to list them. Slider units: exposure in stops, the rest -100..100.",
    {
      set: z.enum(["retrato"]).optional().describe("Built-in set (combine with presets to add your own)."),
      presets: z
        .array(
          z.object({
            name: z.string().min(1),
            part: z.enum(Object.keys(MASK_PARTS) as [MaskPart, ...MaskPart[]]),
            adjustments: z.record(z.number()).describe(`Sliders: ${Object.keys(LOCAL).join(", ")}.`),
            inverted: z.boolean().optional()
          })
        )
        .optional(),
      group: z.string().optional().describe("Preset group shown in Lightroom (default 'MCP Mascaras')."),
      outputFolder: z.string().optional().describe("Where to write the .xmp files (default: <temp>/mcp_lr_mask_presets)."),
      install: z.boolean().optional().default(false).describe("Also copy into the Camera Raw presets folder (sub-folder 'MCP')."),
      overwrite: z.boolean().optional().default(false).describe("Replace an installed preset file of the same name.")
    },
    async (p) => {
      try {
        const specs: MaskPresetSpec[] = [...(p.set === "retrato" ? PORTRAIT_SET : []), ...((p.presets ?? []) as MaskPresetSpec[])].map((s) => ({ ...s, group: p.group ?? s.group }));
        if (!specs.length) throw Object.assign(new Error("Give set='retrato' and/or presets."), { code: "INVALID_PARAMS" });
        const out = p.outputFolder ?? path.join(os.tmpdir(), "mcp_lr_mask_presets");
        fs.mkdirSync(out, { recursive: true });
        const installDir = path.join(cameraRawSettingsFolder(), "MCP");
        const written: Array<{ name: string; part: string; file: string; installed?: string; skipped?: string }> = [];
        for (const s of specs) {
          const xmp = buildMaskPresetXmp(s);
          const file = path.join(out, presetFileName(s.name));
          fs.writeFileSync(file, xmp, "utf8");
          const rec: { name: string; part: string; file: string; installed?: string; skipped?: string } = { name: s.name, part: s.part, file };
          if (p.install) {
            fs.mkdirSync(installDir, { recursive: true });
            const dest = path.join(installDir, presetFileName(s.name));
            if (fs.existsSync(dest) && !p.overwrite) rec.skipped = `already installed: ${dest} (overwrite: true replaces it)`;
            else {
              fs.writeFileSync(dest, xmp, "utf8");
              rec.installed = dest;
            }
          }
          written.push(rec);
        }
        return formatSuccessResponse({
          presets: written,
          next: p.install
            ? "Restart Lightroom Classic, then lr_list_develop_presets (group 'MCP Mascaras') and lr_apply_develop_preset on a virtual copy; look at the mask before using it on a shoot."
            : "Not installed. Run again with install: true, or copy the files into the Camera Raw presets folder.",
          note: "Not validated live yet: the first run must check that Lightroom builds the mask of the right part."
        });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );
}
