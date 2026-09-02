---
name: Expo Go preview token
description: How to handle a stale Expo token that prevents the mobile preview server from starting cleanly.
---

If Expo CLI reports `ApiV2Error: The bearer token is invalid` while starting the mobile preview, a stale `EXPO_TOKEN` may be inherited from the Replit environment even though Metro and the app code are otherwise healthy.

**Why:** Expo CLI performs account/API checks before serving the QR project URL, so an invalid token can look like an Expo Go or project runtime failure.

**How to apply:** Blank `EXPO_TOKEN` in the mobile dev workflow, keep the Replit-managed Preview on your phone flow for Expo Go authentication, restart the configured mobile workflow, and rescan the newly generated QR code.