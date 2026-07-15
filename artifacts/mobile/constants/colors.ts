/**
 * Semantic design tokens for the mobile app.
 *
 * Mirrors the sibling web app (Engagera) which runs a permanent black &
 * white theme (see artifacts/engagera/src/index.css :root / .dark block —
 * both are identical pure black). The mobile app intentionally ignores the
 * device's light/dark preference and always renders this single palette so
 * both apps feel like the same product.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#ffffff',
    tint: '#ffffff',

    // Core surfaces
    background: '#000000',
    foreground: '#ffffff',

    // Cards / elevated surfaces
    card: '#0a0a0a',
    cardForeground: '#ffffff',

    // Primary action color (buttons, links, active states)
    primary: '#ffffff',
    primaryForeground: '#000000',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#161616',
    secondaryForeground: '#ffffff',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#141414',
    mutedForeground: '#8a8a8a',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#1c1c1c',
    accentForeground: '#ffffff',

    // Destructive actions (delete, error states)
    destructive: '#ef4444',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: 'rgba(255,255,255,0.15)',
    input: 'rgba(255,255,255,0.15)',
  },

  // Border radius (px) — matches the web app's --radius: 0.5rem.
  radius: 16,
};

export default colors;
