export type EngageraModel = "engagera-2.0" | "engagera-2.1" | "engagera-image";

interface AttachmentHint {
  kind: "image" | "text";
}

// Broad keyword list — any phrase that clearly asks for a generated image
const IMAGE_GEN_KEYWORDS = [
  // Explicit "generate/create/make + image/picture/photo/etc"
  "generate image", "generate a image", "generate an image",
  "generate picture", "generate a picture",
  "generate photo", "generate a photo",
  "generate art", "generate artwork",
  "generate illustration", "generate a illustration", "generate an illustration",
  "generate logo", "generate a logo",
  "create image", "create a image", "create an image",
  "create picture", "create a picture",
  "create photo", "create a photo",
  "create art", "create artwork",
  "create illustration", "create a illustration", "create an illustration",
  "create logo", "create a logo",
  "make image", "make a image", "make an image",
  "make picture", "make a picture", "make me a picture",
  "make photo", "make a photo", "make me a photo",
  "make art", "make me art", "make artwork",
  "make illustration", "make an illustration",
  "make logo", "make a logo",
  "make me an image", "make me a image",
  // "Draw"
  "draw me", "draw a", "draw an",
  // "Show me a/an" + visual noun
  "show me a picture", "show me an image", "show me a photo",
  "show me a drawing", "show me a painting",
  "show me an illustration", "show me a logo",
  // "Paint"
  "paint a", "paint an", "paint me",
  // "Sketch"
  "sketch a", "sketch an", "sketch me",
  // "Illustrate"
  "illustrate ", "illustrate a", "illustrate me",
  // "Design"
  "design a logo", "design an image", "design a poster",
  "design a banner", "design a graphic",
  "design a thumbnail", "design a wallpaper",
  // "Render"
  "render a", "render an", "render me",
  // "X of Y" — natural "picture of a cat" etc.
  "picture of", "image of", "photo of",
  "drawing of", "painting of", "illustration of",
  "portrait of", "artwork of", "sketch of",
  // Standalone intent
  "a picture of", "an image of", "a photo of",
  "a drawing of", "a painting of", "a portrait of",
  // "Can you draw/paint/make"
  "can you draw", "can you paint", "can you sketch",
  "can you illustrate", "can you create an image",
  "can you make an image", "can you make a picture",
  "can you generate an image", "can you generate a picture",
  "could you draw", "could you paint", "could you sketch",
  "could you create an image", "could you make an image",
  "please draw", "please paint", "please create an image",
  "please generate", "please illustrate",
  // Wallpaper / poster / banner / logo requests
  "generate wallpaper", "create wallpaper", "make wallpaper",
  "generate poster", "create poster", "make poster",
  "generate banner", "create banner", "make banner",
  "generate thumbnail", "create thumbnail",
];

// Regex patterns for detection (covers phrasing not in keyword list)
const IMAGE_GEN_PATTERNS: RegExp[] = [
  // "image/picture/photo/drawing/painting/illustration of ..."
  /\b(image|picture|photo|drawing|painting|illustration|portrait|artwork|sketch|graphic|poster|wallpaper|banner|logo|thumbnail)\s+of\b/i,
  // "draw/paint/sketch/illustrate/render me/a/an ..."
  /\b(draw|paint|sketch|illustrate|render)\s+(me\s+)?(a|an|the|some|my)?\s*\w/i,
  // "generate/create/make/produce ... image/picture/photo"
  /\b(generate|create|make|produce|design)\b.{0,40}\b(image|picture|photo|drawing|illustration|artwork|logo|poster|wallpaper|banner|thumbnail|visual|graphic)\b/i,
  // "show me a ... " + visual noun
  /\bshow\s+me\s+(a|an|the|some)\b.{0,30}\b(image|picture|photo|drawing|painting|illustration|portrait|logo)\b/i,
  // "can you draw/create/make/generate ..."
  /\b(can|could|please|would you|will you)\s+you\s+(draw|paint|sketch|illustrate|render|create|generate|make|design)\b/i,
  // "I want/need an image/picture"
  /\b(i want|i need|i'd like|give me)\s+(a|an|the)\s+(image|picture|photo|drawing|illustration|painting|artwork|visual)\b/i,
];

/**
 * Picks the right Engagera model based on what the user is asking.
 *
 * engagera-image — Dedicated image generation. Bypasses keyword check on backend.
 * engagera-2.1   — Latest model with vision + image gen (fallback if attachment present).
 * engagera-2.0   — Primary text model.
 */
export function detectModel(text: string, attachments: AttachmentHint[] = []): EngageraModel {
  const lower = text.toLowerCase().trim();

  // Image attachment → needs vision (2.1), not image generation
  if (attachments.some((a) => a.kind === "image")) return "engagera-2.1";

  // Check keyword list first (fast)
  if (IMAGE_GEN_KEYWORDS.some((k) => lower.includes(k))) return "engagera-image";

  // Check regex patterns (broader coverage)
  if (IMAGE_GEN_PATTERNS.some((p) => p.test(lower))) return "engagera-image";

  return "engagera-2.0";
}
