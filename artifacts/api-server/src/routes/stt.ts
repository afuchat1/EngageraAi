/**
 * POST /api/stt
 * Receives raw audio (webm/wav/ogg) and returns a transcript via
 * HuggingFace Whisper (free inference endpoint — no key required).
 * If HUGGINGFACE_API_KEY env var is set it will be used for higher rate limits.
 */
import { Router } from "express";
import express from "express";

const router = Router();

const HF_WHISPER = "https://api-inference.huggingface.co/models/openai/whisper-large-v3-turbo";

router.post(
  "/stt",
  express.raw({ type: /^audio\//, limit: "12mb" }),
  async (req, res) => {
    const body = req.body as Buffer;

    if (!Buffer.isBuffer(body) || body.length < 100) {
      res.status(400).json({ error: "No audio data provided" });
      return;
    }

    const contentType = (req.headers["content-type"] ?? "audio/webm").split(";")[0];

    const headers: Record<string, string> = { "Content-Type": contentType };
    if (process.env.HUGGINGFACE_API_KEY) {
      headers["Authorization"] = `Bearer ${process.env.HUGGINGFACE_API_KEY}`;
    }

    try {
      const hfRes = await fetch(HF_WHISPER, { method: "POST", headers, body });

      if (hfRes.status === 503) {
        const payload = await hfRes.json().catch(() => ({})) as Record<string, unknown>;
        res.status(503).json({
          error: "model_loading",
          estimated_time: (payload.estimated_time as number) ?? 20,
        });
        return;
      }

      if (!hfRes.ok) {
        const errText = await hfRes.text().catch(() => "");
        console.error("HF Whisper error", hfRes.status, errText.slice(0, 200));
        res.status(502).json({ error: "Transcription service error" });
        return;
      }

      const data = await hfRes.json() as Record<string, unknown>;
      const text = (typeof data?.text === "string" ? data.text : "").trim();
      res.json({ text });
    } catch (err) {
      console.error("STT route error:", String(err));
      res.status(500).json({ error: "Internal STT error" });
    }
  }
);

export default router;
