/**
 * Deterministic offline language detection for extracted document text.
 * Mirrors the native heuristic (ADR-008): CJK codepoint ratio decides zh;
 * otherwise a Malay/English stopword profile decides ms vs en. Low-confidence
 * results should surface warnings upstream, never silent certainty.
 */

import type { SupportedLanguage } from "@mybantu/shared-types";

const MALAY_STOPWORDS = new Set([
  "dan",
  "yang",
  "untuk",
  "dengan",
  "tidak",
  "ini",
  "itu",
  "ke",
  "pada",
  "adalah",
  "atau",
  "saya",
  "anda",
  "kami",
  "mereka",
  "akan",
  "sudah",
  "boleh",
  "ada",
  "dalam",
  "sila",
  "sebelum",
  "selepas",
  "kepada",
  "daripada",
  "bagi",
  "tersebut",
  "jika",
  "kerana",
  "perlu",
  "telah",
  "bahawa",
  "seperti",
  "juga",
  "sahaja",
  "tolong",
  "terima",
  "kasih",
  "bayar",
  "ialah",
]);

const ENGLISH_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "not",
  "this",
  "that",
  "you",
  "are",
  "was",
  "will",
  "have",
  "can",
  "there",
  "please",
  "before",
  "after",
  "from",
  "because",
  "need",
  "has",
  "also",
  "only",
  "what",
  "when",
  "where",
  "who",
  "how",
  "thanks",
  "pay",
  "your",
  "our",
  "would",
  "should",
  "could",
  "about",
  "into",
  "than",
  "them",
  "been",
]);

const CJK_RANGES: Array<[number, number]> = [
  [0x4e00, 0x9fff],
  [0x3400, 0x4dbf],
  [0xf900, 0xfaff],
  [0x20000, 0x2a6df],
];

function isCjk(codePoint: number): boolean {
  return CJK_RANGES.some(([lo, hi]) => codePoint >= lo && codePoint <= hi);
}

export interface DetectionResult {
  language: SupportedLanguage | "unknown";
  confidence: number;
}

export function detectLanguage(text: string): DetectionResult {
  let cjk = 0;
  let latin = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (isCjk(cp)) cjk++;
    else if ((cp >= 65 && cp <= 90) || (cp >= 97 && cp <= 122)) latin++;
  }
  const scored = cjk + latin;
  if (scored === 0) return { language: "unknown", confidence: 0.0 };

  const cjkRatio = cjk / scored;
  if (cjkRatio >= 0.25) return { language: "zh", confidence: Math.min(1, 0.5 + cjkRatio) };

  let msHits = 0;
  let enHits = 0;
  for (const word of text.toLowerCase().split(/[^a-z]+/)) {
    if (!word) continue;
    if (MALAY_STOPWORDS.has(word)) msHits++;
    if (ENGLISH_STOPWORDS.has(word)) enHits++;
  }
  const total = msHits + enHits;
  if (total === 0) return { language: "unknown", confidence: 0.3 };
  if (msHits > enHits) {
    return { language: "ms", confidence: Math.min(1, 0.5 + ((msHits - enHits) / total) * 0.5) };
  }
  if (enHits > msHits) {
    return { language: "en", confidence: Math.min(1, 0.5 + ((enHits - msHits) / total) * 0.5) };
  }
  return { language: "unknown", confidence: 0.34 };
}
