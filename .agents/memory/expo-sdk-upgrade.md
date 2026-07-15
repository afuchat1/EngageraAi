---
name: Expo SDK upgrade procedure
description: How to bump an Expo scaffold to a newer SDK, and the NativeTabs API break between SDK 54 and 55.
---

To move a freshly-scaffolded Expo app to a newer SDK than the template ships (e.g. template ships 54, user wants 55):

1. Confirm the target SDK is published: `npm view expo dist-tags` shows tags like `sdk-55`.
2. Set `"expo"` in `package.json` to that SDK's version (e.g. `~55.0.27`), then `pnpm install`.
3. Run `pnpm exec expo install --fix` inside the app — it reports every dependency at the wrong version for the new SDK and reinstalls the compatible set (react, react-native, react-native-reanimated, react-native-worklets, all `expo-*` packages, etc.) in one pass. Don't hand-pick versions.
4. Run `pnpm exec tsc --noEmit` before restarting the workflow — SDK bumps can break APIs (see below).

**Why:** `expo install --fix` is the only reliable way to get a mutually-compatible dependency set; hand-editing versions individually reliably produces native-module mismatches at runtime.

**Native breaking change, SDK 54 → 55:** `expo-router/unstable-native-tabs` dropped the standalone `Icon`/`Label` exports. Use `NativeTabs.Trigger.Icon` / `NativeTabs.Trigger.Label` as sub-components of `Trigger` instead of importing `Icon`/`Label` directly. `tsc --noEmit` catches this immediately.
