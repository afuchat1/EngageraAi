export type EngageraModel =
  | "engagera-lite"
  | "engagera-pro"
  | "engagera-reason"
  | "engagera-code"
  | "engagera-vision"
  | "engagera-voice"
  | "engagera-image";

export interface AttachmentHint {
  kind: "image" | "audio" | "text";
}

const IMAGE_GEN_KEYWORDS = [
  "generate an image", "generate a image", "generate a picture", "generate a photo",
  "generate artwork", "generate a logo", "generate a drawing", "generate a poster",
  "generate a banner", "generate a thumbnail", "generate an illustration",
  "create an image", "create a image", "create a picture", "create a logo",
  "create a drawing", "create artwork", "create an illustration", "create a poster",
  "make an image", "make a image", "make me an image", "make a picture",
  "make a logo", "make me a logo", "make artwork", "make a drawing",
  "draw me", "draw a ", "draw an ", "paint a ", "paint an ", "paint me",
  "sketch a ", "sketch an ", "sketch me", "illustrate this", "illustrate a",
  "render a ", "render an ", "render me", "design a logo", "design a poster",
  "show me a picture", "show me an image", "show me a drawing",
];

const IMAGE_GEN_PATTERNS: RegExp[] = [
  /\b(draw|paint|sketch|illustrate|render)\s+(me\s+)?(a\s+|an\s+|the\s+|some\s+|my\s+)?\w/i,
  /\b(generate|create|make|produce)\b.{0,50}\b(image|picture|photo|drawing|painting|illustration|artwork|logo|poster|wallpaper|banner|thumbnail|graphic)\b/i,
  /\b(can|could|please|would you|will you)\s+you\s+(draw|paint|sketch|illustrate|render)\b/i,
  /\b(i want|i need|i'd like|give me)\s+(a\s+|an\s+)(image|picture|photo|drawing|illustration|painting|artwork)\b/i,
];

const CODE_PATTERNS: RegExp[] = [
  /\b(write|build|implement|fix|debug|refactor|optimize|review)\b.{0,40}\b(code|function|class|script|program|algorithm|api|component|module|query)\b/i,
  /\b(javascript|typescript|python|java|golang|rust|swift|kotlin|php|ruby|sql|html|css|react|vue|angular|node\.?js|express|django|flask|fastapi)\b/i,
  /\b(bug|exception|syntax error|runtime error|compile|stack trace|undefined|null pointer|npm|pip|yarn|package\.json)\b/i,
  /\b(for loop|recursion|async\/await|promise|callback|regex|binary tree|sorting|linked list)\b/i,
];

const REASON_PATTERNS: RegExp[] = [
  /\b(why|because|therefore|hence|consequently|caused by|explain)\b.{0,60}\b(this|that|it|these|those|the)\b/i,
  /\b(analyze|analyse|evaluate|assess|compare|contrast|examine|investigate)\b/i,
  /\b(hypothesis|argument|evidence|proof|logical|reasoning|critical thinking)\b/i,
  /\b(pros and cons|advantages and disadvantages|trade.?off|should i|which is better|what are the implications)\b/i,
];

const VOICE_PATTERNS: RegExp[] = [
  /\b(text.to.speech|tts|speech.to.text|stt|transcribe|narrate|pronunciation|dictate)\b/i,
  /\b(read (this |it )?aloud|say it|how (is|do) (you|i) pronounce|speak (this|it))\b/i,
];

const LITE_PATTERNS: RegExp[] = [
  /^(hi|hello|hey|sup|yo|hiya|greetings|howdy)\b/i,
  /^(thanks|thank you|thx|ty|cheers|great|ok|okay|got it|sounds good|perfect|nice|cool|awesome)\b/i,
  /^(good (morning|afternoon|evening|night)|how are you|what('s| is) up|how's it going)\b/i,
  /^(yes|no|sure|maybe|definitely|absolutely|exactly|correct)\b/i,
];

function isImageGen(text: string): boolean {
  return (
    IMAGE_GEN_KEYWORDS.some(k => text.includes(k)) ||
    IMAGE_GEN_PATTERNS.some(p => p.test(text))
  );
}

/**
 * Auto-selects the best Engagera model for the given message + attachments.
 *
 * engagera-image  — Unambiguous image/art generation request
 * engagera-vision — Image attachment present
 * engagera-code   — Code, programming, debugging
 * engagera-reason — Analysis, deep reasoning, pros/cons
 * engagera-voice  — TTS, pronunciation, speech topics
 * engagera-lite   — Short greetings / simple one-liners (fast + cheap)
 * engagera-pro    — Default: general knowledge, complex chat (best balance)
 */
export function detectModel(text: string, attachments: AttachmentHint[] = []): EngageraModel {
  const lower = text.toLowerCase().trim();

  if (attachments.some(a => a.kind === "image")) return "engagera-vision";
  if (attachments.some(a => a.kind === "audio")) return "engagera-voice";

  if (isImageGen(lower))                          return "engagera-image";
  if (CODE_PATTERNS.some(p => p.test(lower)))     return "engagera-code";
  if (REASON_PATTERNS.some(p => p.test(lower)))   return "engagera-reason";
  if (VOICE_PATTERNS.some(p => p.test(lower)))    return "engagera-voice";
  if (LITE_PATTERNS.some(p => p.test(lower)) || lower.length < 12) return "engagera-lite";

  return "engagera-pro";
}

export const MODEL_LABELS: Record<EngageraModel, string> = {
  "engagera-lite":   "Lite · Fast",
  "engagera-pro":    "Pro",
  "engagera-reason": "Reason · Deep",
  "engagera-code":   "Code",
  "engagera-vision": "Vision",
  "engagera-voice":  "Voice",
  "engagera-image":  "Image Gen",
};
