#!/usr/bin/env node
/**
 * Smoke checks for chord normalize/lookup (no test framework).
 * Run: node scripts/chord-lookup-smoke.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function stubEl() {
  return {
    style: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    checked: false,
    textContent: "",
    setAttribute() {},
    appendChild() {},
    addEventListener() {},
    querySelector() { return null; },
  };
}

const sandbox = {
  console,
  Math,
  Number,
  String,
  Boolean,
  Array,
  Object,
  Date,
  parseInt,
  isNaN,
  Infinity,
  localStorage: {
    getItem() {
      return null;
    },
    setItem() {},
  },
  document: {
    readyState: "complete",
    createElement: () => stubEl(),
    createElementNS: () => stubEl(),
    getElementById: () => null,
    addEventListener() {},
    querySelector() {
      return null;
    },
  },
  window: {
    matchMedia: () => ({
      matches: false,
      addEventListener() {},
      addListener() {},
    }),
  },
};
sandbox.window = Object.assign(sandbox.window, {
  document: sandbox.document,
  localStorage: sandbox.localStorage,
});
sandbox.globalThis = sandbox;

const srcPath = path.join(__dirname, "..", "js", "chord-diagrams.js");
const code = fs.readFileSync(srcPath, "utf8");
vm.runInNewContext(code, sandbox);

const api = sandbox.window.chordDiagrams;
if (!api || typeof api.lookup !== "function" || typeof api.normalizeChordName !== "function") {
  console.error("FAIL: chordDiagrams API not available after load");
  process.exit(1);
}

let failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed += 1;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`ok: ${message}`);
  }
}

function fretsOf(name) {
  const shape = api.lookup(name);
  return shape ? shape.frets.join(",") : null;
}

assert(api.normalizeChordName("bm") === "Bm", "bm → Bm");
assert(api.normalizeChordName("CM") === "C", "CM → C (trailing M stripped)");
assert(api.normalizeChordName("F#m") === "F#m", "F#m stays F#m");

assert(!!api.lookup("Bm"), "Bm has a diagram");
assert(!!api.lookup("Am"), "Am has a diagram");
assert(!!api.lookup("F#m"), "F#m has a diagram");
assert(!!api.lookup("B"), "B has a diagram");
assert(!!api.lookup("CM"), "CM resolves via normalize");

assert(
  fretsOf("Bm") !== fretsOf("B"),
  "Bm shape differs from B (no major←minor collapse)"
);
assert(
  fretsOf("Am") !== fretsOf("A"),
  "Am shape differs from A"
);
assert(
  fretsOf("F#m") !== fretsOf("F#"),
  "F#m shape differs from F#"
);

const bm7 = api.normalizeChordName("Bm7");
assert(bm7 === "Bm7", "Bm7 normalizes to Bm7 family");
assert(!!api.lookup("Bm7"), "Bm7 looks up Bm7 family");

// Light section-title label check (same pattern as song-render.js)
const SECTION_LINE =
  /^\[((?:Verse|Chorus|Bridge|Intro|Outro|Pre-Chorus|Interlude|Solo)(?:\s*\d+|\s+[^\]]*)*)\]$/;
const verseMatch = "[Verse 1]".match(SECTION_LINE);
assert(!!verseMatch && verseMatch[1] === "Verse 1", "section title keeps full label Verse 1");
const chorusMatch = "[Chorus]".match(SECTION_LINE);
assert(!!chorusMatch && chorusMatch[1] === "Chorus", "section title Chorus");

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}

console.log("\nAll chord-lookup smoke checks passed.");
process.exit(0);
