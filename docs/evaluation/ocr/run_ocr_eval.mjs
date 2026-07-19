#!/usr/bin/env node
/**
 * OCR evaluation (Phase 2, Gate B evidence). Runs the production Tesseract
 * provider against the synthetic fixtures and records literal-preservation hits
 * and confidence. Requires `npm run build -w @mybantu/document-ai` and local OCR
 * language data (scripts/model-setup/setup-ocr-data.py).
 *
 *   node docs/evaluation/ocr/run_ocr_eval.mjs
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const { TesseractOcrProvider } = await import(
  new URL("file:///" + path.join(repoRoot, "services/document-ai/dist/ocr/tesseract-provider.js").replace(/\\/g, "/"))
);

const provider = new TesseractOcrProvider(path.join(repoRoot, "models", "ocr"));
if (provider.availability() !== "Available") {
  console.error("OCR language data is not installed; run scripts/model-setup/setup-ocr-data.py first.");
  process.exit(2);
}

const cases = [
  { file: "images/notice-en.png", language: "en", mustContain: ["NOTICE", "RM45.90", "2026"] },
  { file: "images/notice-ms.png", language: "ms", mustContain: ["NOTIS", "RM75.20", "Ogos"] },
  { file: "images/notice-zh.png", language: "zh", mustContain: ["通知", "RM88.00", "2026"] },
  { file: "images/notice-en-degraded.png", language: "en", mustContain: ["NOTICE", "RM45.90", "2026"], degraded: true },
];

const results = [];
for (const testCase of cases) {
  const imagePath = path.join(repoRoot, "data", "samples", testCase.file);
  const started = Date.now();
  const result = await provider.extractText(imagePath, testCase.language);
  const elapsedMs = Date.now() - started;
  if (!result.ok) {
    results.push({ ...testCase, ok: false, error: result.message, elapsedMs });
    console.log(`${testCase.file}: FAILED ${result.message}`);
    continue;
  }
  const text = result.value[0].text;
  const hits = testCase.mustContain.filter((t) => text.includes(t));
  const missing = testCase.mustContain.filter((t) => !text.includes(t));
  results.push({
    file: testCase.file,
    language: testCase.language,
    degraded: testCase.degraded ?? false,
    ok: true,
    elapsedMs,
    confidence: result.value[0].confidence ?? null,
    literalHits: hits.length,
    literalTotal: testCase.mustContain.length,
    missing,
  });
  console.log(
    `${testCase.file}: ${hits.length}/${testCase.mustContain.length} literals, ` +
      `confidence ${Math.round(result.value[0].confidence ?? -1)}%, ${elapsedMs} ms` +
      (missing.length ? ` (missing: ${missing.join(", ")})` : ""),
  );
}

const out = path.join(here, "ocr-eval-results.json");
writeFileSync(
  out,
  JSON.stringify(
    {
      engine: "tesseract.js 7 (WASM, local)",
      languageData: "tessdata_fast (eng, msa, chi_sim), Apache-2.0",
      environment: `${process.platform} node ${process.version}`,
      ranAtUtc: new Date().toISOString(),
      results,
    },
    null,
    2,
  ),
);
console.log(`written ${out}`);
