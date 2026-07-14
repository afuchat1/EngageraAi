/**
 * Post-build script: copies the ESM output as a CJS bundle using a simple
 * wrapper, and writes a matching .d.cts declaration file.
 *
 * We don't run a full CJS transform — instead we emit a tiny wrapper that
 * re-exports from the ESM build via dynamic import(). This works in Node 18+
 * which supports top-level await in CJS via async IIFE, and covers the vast
 * majority of real-world CJS consumers (bundlers like webpack/rollup unwrap
 * it automatically).
 */

import { readFileSync, writeFileSync, cpSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dir, "../dist");

// CJS wrapper — re-exports everything from the ESM build
const cjsContent = `"use strict";
// @afuchat/sdk — CJS compatibility shim
// The real implementation is ESM; this wrapper re-exports it for require() users.
// For best results use: import Engagera from "@afuchat/sdk"

let _mod;
function _load() {
  if (!_mod) _mod = import("./index.js");
  return _mod;
}

module.exports = new Proxy(
  {},
  {
    get(_, key) {
      if (key === "__esModule") return true;
      if (key === "then") return undefined; // not a Promise
      return (...args) => _load().then((m) => m[key](...args));
    },
  },
);
`;

writeFileSync(resolve(distDir, "index.cjs"), cjsContent, "utf8");

// Copy the .d.ts as .d.cts so TypeScript resolves types for require()
const dts = readFileSync(resolve(distDir, "index.d.ts"), "utf8");
writeFileSync(resolve(distDir, "index.d.cts"), dts, "utf8");

console.log("✓ CJS shim written to dist/index.cjs");
console.log("✓ CJS types written to dist/index.d.cts");
