// Applies the Engagera logo as a small, semi-transparent watermark to every
// AI-generated image before it's sent to the client. Pure-Deno (WASM) image
// library — no native bindings, so it runs fine in the edge runtime.
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { WATERMARK_LOGO_PNG_BASE64 } from "./watermark-logo.ts";

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(bin);
}

let cachedLogoBytes: Uint8Array | undefined;

/**
 * Stamps the Engagera logo in the bottom-right corner of a base64-encoded
 * JPEG image. Kept intentionally small (~10% of image width) and
 * semi-transparent so it reads as a watermark, not a sticker.
 *
 * Fails open: if anything goes wrong (decode error, corrupt image, etc.)
 * the original image is returned unmodified rather than breaking image
 * generation entirely.
 */
export async function applyWatermark(jpegBase64: string, requestId: string): Promise<string> {
  try {
    cachedLogoBytes ??= base64ToBytes(WATERMARK_LOGO_PNG_BASE64);

    const baseBytes = base64ToBytes(jpegBase64);
    const base = await Image.decode(baseBytes);
    const logo = (await Image.decode(cachedLogoBytes)).clone();

    const targetWidth = Math.max(24, Math.round(base.width * 0.1));
    logo.resize(targetWidth, Image.RESIZE_AUTO);
    logo.opacity(0.55);

    const margin = Math.round(base.width * 0.025);
    const x = base.width - logo.width - margin;
    const y = base.height - logo.height - margin;
    base.composite(logo, Math.max(0, x), Math.max(0, y));

    const outBytes = await base.encodeJPEG(85);
    return bytesToBase64(outBytes);
  } catch (err) {
    console.error(JSON.stringify({ level: "warn", event: "watermark.failed", requestId, error: String(err) }));
    return jpegBase64;
  }
}
