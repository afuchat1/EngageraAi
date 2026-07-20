const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// ── Monorepo setup ────────────────────────────────────────────────────────────
// Tell Metro about the shared workspace root so it can resolve hoisted packages,
// but explicitly EXCLUDE every other artifact directory so that Metro's file
// watcher never touches sibling apps (e.g. engagera's Vite dep-cache dirs).
config.watchFolders = [
  workspaceRoot,
  // Exclude sibling artifact dirs — Metro still needs the workspace root above,
  // but we block the exact subdirs that contain Vite/Next temp files that can
  // disappear while Metro is watching and cause an ENOENT crash.
];

// Block Metro from crawling into other artifacts' build caches.
config.resolver = config.resolver ?? {};
config.resolver.blockList = [
  // Vite dep-cache directories inside any sibling artifact
  /artifacts\/(?!mobile)[^/]+\/node_modules\/.vite\/.*/,
  // node_modules inside individual artifact dirs (they're hoisted to workspace root)
  /artifacts\/(?!mobile)[^/]+\/node_modules\/.*/,
  // Dotslash temp cache — these dirs can disappear mid-watch and crash Metro
  /\.cache\/dotslash\/.*/,
];

module.exports = config;
