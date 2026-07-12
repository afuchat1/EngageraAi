import posthog from "posthog-js";

const POSTHOG_KEY = "phx_ESy9KQe5F6s46bYRLZy3ZmeU8wWxqVUMHPHcQ3jVvaJgC6uX";
const POSTHOG_HOST = "https://us.i.posthog.com";

let initialized = false;

export function initAnalytics(): void {
  if (initialized || typeof window === "undefined") return;
  try {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      person_profiles: "identified_only",
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: false,
    });
    initialized = true;
  } catch {
    // non-fatal — analytics should never break the app
  }
}

export function identifyUser(userId: string, email?: string): void {
  try {
    posthog.identify(userId, email ? { email } : {});
  } catch { /* non-fatal */ }
}

export function resetUser(): void {
  try { posthog.reset(); } catch { /* non-fatal */ }
}

export function trackEvent(event: string, properties?: Record<string, unknown>): void {
  try { posthog.capture(event, properties); } catch { /* non-fatal */ }
}
