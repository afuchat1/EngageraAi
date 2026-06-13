export type EngageraModel = "engagera-2.0" | "engagera-2.1";

interface AttachmentHint {
  kind: "image" | "text";
}

// Keep in sync with IMAGE_GEN_KEYWORDS in the chat edge function
const IMAGE_GEN_KEYWORDS = [
  "generate image", "create image", "draw ", "illustrate",
  "make a picture", "make an image", "design an image",
  "show me a picture", "generate a picture", "paint ",
  "sketch ", "render an image", "create a visual",
  "design a logo", "generate a logo", "make art",
  "create art", "show me art", "generate art",
  "create an illustration", "generate an illustration",
  "make me an image", "make me a picture", "draw me",
  "generate a photo", "create a photo", "make a photo",
];

/**
 * Picks the right Engagera model based on what the user is asking.
 *
 * engagera-2.0 — Primary model. Full world knowledge: code, reasoning,
 *                analysis, writing, math, science — everything text-based.
 *
 * engagera-2.1 — Latest model. Everything in 2.0 PLUS real image generation
 *                (DALL-E 3) and vision (image input) analysis.
 */
export function detectModel(text: string, attachments: AttachmentHint[] = []): EngageraModel {
  // Any image attachment → needs 2.1 for vision analysis
  if (attachments.some((a) => a.kind === "image")) return "engagera-2.1";

  const lower = text.toLowerCase();

  // Image generation request → needs 2.1
  if (IMAGE_GEN_KEYWORDS.some((k) => lower.includes(k))) return "engagera-2.1";

  // Everything else handled by 2.0
  return "engagera-2.0";
}
