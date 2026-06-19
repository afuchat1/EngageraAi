export type EngageraModel = "engagera-2.0" | "engagera-2.1" | "engagera-image";

interface AttachmentHint {
  kind: "image" | "text";
}

/**
 * CONSERVATIVE image-gen detection.
 *
 * Only triggers when the user is UNAMBIGUOUSLY asking for a visual image output.
 * General words like "generate", "create", "make", "design", "picture" alone do NOT
 * trigger image generation — they must be clearly paired with image-creation intent.
 *
 * ❌ BAD (too broad — caused false positives):
 *   "please generate" → triggered on "please generate a Python function"
 *   "picture of"      → triggered on "give me a picture of how this works"
 *   "can you create"  → triggered on "can you create a REST API"
 *   "image of"        → triggered on "I have an image of this problem"
 *
 * ✅ GOOD (unambiguous visual output request):
 *   "draw me a cat"
 *   "generate an image of a sunset"
 *   "create a logo for my app"
 *   "paint a watercolor landscape"
 */

// Only keywords that are UNAMBIGUOUSLY requesting a visual image.
// Must explicitly pair a creation verb with an image noun.
const IMAGE_GEN_KEYWORDS = [
  // generate + explicit image noun
  "generate an image", "generate a image",
  "generate a picture", "generate the picture",
  "generate a photo", "generate the photo",
  "generate artwork", "generate an artwork", "generate some art",
  "generate an illustration", "generate a illustration",
  "generate a logo", "generate the logo",
  "generate a wallpaper", "generate wallpaper",
  "generate a poster", "generate poster",
  "generate a banner", "generate banner",
  "generate a thumbnail", "generate thumbnail",
  "generate a drawing",

  // create + explicit image noun
  "create an image", "create a image",
  "create a picture", "create the picture",
  "create a photo", "create the photo",
  "create artwork", "create an artwork",
  "create an illustration", "create a illustration",
  "create a logo", "create the logo",
  "create a wallpaper", "create wallpaper",
  "create a poster", "create poster",
  "create a banner", "create banner",
  "create a thumbnail", "create thumbnail",
  "create a drawing",

  // make + explicit image noun
  "make an image", "make a image",
  "make me an image", "make me a image",
  "make a picture", "make me a picture",
  "make a photo", "make me a photo",
  "make artwork", "make me artwork", "make me art",
  "make an illustration", "make a illustration",
  "make a logo", "make me a logo",
  "make a drawing", "make me a drawing",

  // draw/paint/sketch — these verbs inherently mean visual output
  "draw me", "draw a ", "draw an ",
  "paint a ", "paint an ", "paint me",
  "sketch a ", "sketch an ", "sketch me",

  // illustrate — inherently visual
  "illustrate this", "illustrate a", "illustrate me",
  "please illustrate",

  // render — inherently visual
  "render a ", "render an ", "render me",

  // design + explicit image noun (design alone is NOT enough)
  "design a logo", "design the logo",
  "design an image", "design a poster", "design the poster",
  "design a banner", "design the banner",
  "design a thumbnail", "design a wallpaper",

  // "show me a/an" + explicit image noun (show alone is not enough)
  "show me a picture", "show me an image", "show me a photo",
  "show me a drawing", "show me a painting",
  "show me an illustration", "show me a logo",
];

// Regex patterns — narrow and specific.
// Each pattern requires both a creation verb AND an explicit image noun close together.
const IMAGE_GEN_PATTERNS: RegExp[] = [
  // draw/paint/sketch/illustrate/render + optional "me/a/an" — these verbs = visual output
  /\b(draw|paint|sketch|illustrate|render)\s+(me\s+)?(a\s+|an\s+|the\s+|some\s+|my\s+)?\w/i,

  // generate/create/make/produce + image noun (within 50 chars of the verb)
  /\b(generate|create|make|produce)\b.{0,50}\b(image|picture|photo|drawing|painting|illustration|artwork|logo|poster|wallpaper|banner|thumbnail|graphic)\b/i,

  // "can/could you draw/paint/sketch/illustrate/render" — only explicitly visual verbs
  /\b(can|could|please|would you|will you)\s+you\s+(draw|paint|sketch|illustrate|render)\b/i,

  // "I want/need/would like a/an [image noun]"
  /\b(i want|i need|i'd like|give me)\s+(a\s+|an\s+)(image|picture|photo|drawing|illustration|painting|artwork)\b/i,
];

/**
 * Picks the right Engagera model based on what the user is asking.
 *
 * engagera-image — Dedicated image generation (unambiguous visual output request).
 * engagera-2.1   — Latest model with vision (when image attachment is present).
 * engagera-2.0   — Primary text model (default for all chat).
 */
export function detectModel(text: string, attachments: AttachmentHint[] = []): EngageraModel {
  const lower = text.toLowerCase().trim();

  // Image attachment → needs vision (2.1), not image generation
  if (attachments.some((a) => a.kind === "image")) return "engagera-2.1";

  // Check keyword list first (fast exact match)
  if (IMAGE_GEN_KEYWORDS.some((k) => lower.includes(k))) return "engagera-image";

  // Check regex patterns (broader coverage, still conservative)
  if (IMAGE_GEN_PATTERNS.some((p) => p.test(lower))) return "engagera-image";

  return "engagera-2.0";
}
