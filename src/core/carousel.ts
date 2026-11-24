/**
 * Seamless Instagram carousel: the numbers behind one wide canvas cut into equal cards.
 *
 * - Canvas width = cards x card width, exactly; cards are cut at whole pixels (never resized after the cut).
 * - Instagram takes 2-20 cards; 7-10 is the usual sweet spot; the first card sets the aspect ratio of all.
 * - 1080 x 1350 (4:5) is the standard; 1080 x 1440 (3:4) is accepted; the profile grid crops to 3:4.
 * - Text and logo stay inside one card, away from the seams; background and images may cross them.
 */

export type CarouselRatio = "4:5" | "3:4" | "1:1" | "1.91:1";

export const CAROUSEL_SIZES: Record<CarouselRatio, { width: number; height: number }> = {
  "4:5": { width: 1080, height: 1350 },
  "3:4": { width: 1080, height: 1440 },
  "1:1": { width: 1080, height: 1080 },
  "1.91:1": { width: 1080, height: 566 }
};

export const CAROUSEL_MAX_CARDS = 20;
/** Default safe margin from every card edge (and so from every seam), px at 1080 wide. */
export const CAROUSEL_DEFAULT_MARGIN = 80;
/** Photoshop's Save for Web stops at 8192 px: wider canvases are cut first and saved card by card. */
export const SAVE_FOR_WEB_LIMIT = 8192;

export interface CarouselPlan {
  count: number;
  cardWidth: number;
  cardHeight: number;
  margin: number;
  canvasWidth: number;
  canvasHeight: number;
  /** x of each inner seam (between card i and i+1). */
  seams: number[];
  /** [left, right] of each card, whole pixels. */
  cards: Array<[number, number]>;
  /** Vertical guides: card edges plus the margins inside each card. */
  verticalGuides: number[];
  horizontalGuides: number[];
  /** Side band of the first card hidden by the 3:4 grid crop (0 when the card is already 3:4 or narrower). */
  gridCropSide: number;
  /** Export file names in posting order. */
  fileNames: string[];
  warnings: string[];
}

export interface CarouselInput {
  count: number;
  ratio?: CarouselRatio;
  cardWidth?: number;
  cardHeight?: number;
  margin?: number;
  prefix?: string;
  format?: "png" | "jpg" | "webp";
}

function pad(n: number, total: number): string {
  const width = Math.max(2, String(total).length);
  return String(n).padStart(width, "0");
}

export function planCarousel(input: CarouselInput): CarouselPlan {
  const base = CAROUSEL_SIZES[input.ratio ?? "4:5"];
  const cardWidth = Math.round(input.cardWidth ?? base.width);
  const cardHeight = Math.round(input.cardHeight ?? base.height);
  const count = Math.round(input.count);
  const margin = Math.max(0, Math.round(input.margin ?? CAROUSEL_DEFAULT_MARGIN));
  const warnings: string[] = [];
  if (count < 2) throw new Error("A seamless carousel needs at least 2 cards.");
  if (count > CAROUSEL_MAX_CARDS) throw new Error(`Instagram takes at most ${CAROUSEL_MAX_CARDS} cards (asked: ${count}).`);
  if (cardWidth <= 0 || cardHeight <= 0) throw new Error("Card width and height must be positive.");
  if (margin * 2 >= cardWidth) throw new Error(`A ${margin} px margin leaves no room inside a ${cardWidth} px card.`);
  if (cardWidth !== 1080) warnings.push(`Instagram shows carousels 1080 px wide; ${cardWidth} px cards are scaled on upload.`);
  const ratio = cardWidth / cardHeight;
  if (ratio < 0.75 - 0.005) warnings.push("Taller than 3:4: Instagram crops it. Use 1080x1350 (4:5) or 1080x1440 (3:4).");
  if (ratio > 1.91 + 0.01) warnings.push("Wider than 1.91:1: Instagram crops it.");
  if (count < 4) warnings.push("With fewer than 4 cards the continuous effect is hard to notice; 5-10 is the usual range.");
  const canvasWidth = count * cardWidth;
  if (canvasWidth > SAVE_FOR_WEB_LIMIT) {
    warnings.push(`Canvas ${canvasWidth} px is wider than Save for Web's ${SAVE_FOR_WEB_LIMIT} px: export card by card (the split recipe does).`);
  }
  const cards: Array<[number, number]> = [];
  const seams: number[] = [];
  const verticalGuides: number[] = [];
  for (let i = 0; i < count; i++) {
    cards.push([i * cardWidth, (i + 1) * cardWidth]);
    if (i > 0) seams.push(i * cardWidth);
  }
  for (let i = 0; i <= count; i++) verticalGuides.push(i * cardWidth);
  if (margin > 0) for (let i = 0; i < count; i++) verticalGuides.push(i * cardWidth + margin, (i + 1) * cardWidth - margin);
  verticalGuides.sort((a, b) => a - b);
  const horizontalGuides = margin > 0 ? [margin, cardHeight - margin] : [];
  const gridWidth = Math.round((cardHeight * 3) / 4);
  const gridCropSide = gridWidth < cardWidth ? Math.round((cardWidth - gridWidth) / 2) : 0;
  const prefix = (input.prefix ?? "carrossel").replace(/[\\/:*?"<>|]+/g, "_");
  const ext = input.format ?? "png";
  const fileNames = cards.map((_, i) => `${prefix}_${pad(i + 1, count)}.${ext}`);
  return {
    count,
    cardWidth,
    cardHeight,
    margin,
    canvasWidth,
    canvasHeight: cardHeight,
    seams,
    cards,
    verticalGuides,
    horizontalGuides,
    gridCropSide,
    fileNames,
    warnings
  };
}

export interface SeamIssue {
  name: string;
  seam: number;
  problem: "crosses" | "margin";
}

/** Text/logo boxes ([left, top, right, bottom], px) that cross a seam or sit inside the margin next to one. */
export function seamIssues(boxes: Array<{ name: string; bounds: [number, number, number, number] }>, plan: Pick<CarouselPlan, "seams" | "margin">): SeamIssue[] {
  const out: SeamIssue[] = [];
  for (const b of boxes) {
    const [l, , r] = b.bounds;
    plan.seams.forEach((sx, i) => {
      if (l < sx && r > sx) out.push({ name: b.name, seam: i + 1, problem: "crosses" });
      else if ((l >= sx && l < sx + plan.margin) || (r <= sx && r > sx - plan.margin)) out.push({ name: b.name, seam: i + 1, problem: "margin" });
    });
  }
  return out;
}

/** The question to ask before a carousel when the person did not say which kind. */
export const CAROUSEL_KIND_QUESTION =
  "O carrossel vai ser de cards individuais (cada slide independente) ou sem emendas (seamless: um painel contínuo que passa de um card para o outro)?";
