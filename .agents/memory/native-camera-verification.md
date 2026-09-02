---
name: Native camera verification
description: What the Expo web preview can and cannot verify for Android camera and gallery behavior.
---

The Expo web preview can verify Metro bundling and the camera screen UI, but it cannot grant native camera/gallery permissions or prove that MediaLibrary writes to a physical Android gallery.

**Why:** Browser camera shims do not exercise the Android permission prompts, settings fallback, native capture output, or gallery write path.

**How to apply:** Treat Android device or development-build testing as required for release verification of capture, retake, AI result handling, and automatic gallery saving.