import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DOCUMENT_PROCESSING_STATUSES,
  ERROR_CODES,
  SERVICE_AVAILABILITY,
  SOURCE_LANGUAGES,
  SUPPORTED_LANGUAGES,
  isSourceLanguage,
  isSupportedLanguage,
} from "../src/index.js";

const schemasDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "contracts",
  "schemas",
);

function loadSchema(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(schemasDir, name), "utf-8")) as Record<string, unknown>;
}

describe("shared types stay in sync with JSON Schema contracts", () => {
  it("matches supported and source language enums", () => {
    const schema = loadSchema("language-code.schema.json") as {
      $defs: { supportedLanguage: { enum: string[] }; sourceLanguage: { enum: string[] } };
    };
    expect(schema.$defs.supportedLanguage.enum).toEqual([...SUPPORTED_LANGUAGES]);
    expect(schema.$defs.sourceLanguage.enum).toEqual([...SOURCE_LANGUAGES]);
  });

  it("matches service availability enum", () => {
    const schema = loadSchema("service-availability.schema.json") as { enum: string[] };
    expect(schema.enum).toEqual([...SERVICE_AVAILABILITY]);
  });

  it("matches error code enum", () => {
    const schema = loadSchema("error-response.schema.json") as {
      properties: { code: { enum: string[] } };
    };
    expect(schema.properties.code.enum).toEqual([...ERROR_CODES]);
  });

  it("matches document processing status enum", () => {
    const schema = loadSchema("document-processing-status.schema.json") as { enum: string[] };
    expect(schema.enum).toEqual([...DOCUMENT_PROCESSING_STATUSES]);
  });
});

describe("language guards", () => {
  it("accepts en/ms/zh as supported output languages", () => {
    expect(isSupportedLanguage("en")).toBe(true);
    expect(isSupportedLanguage("ms")).toBe(true);
    expect(isSupportedLanguage("zh")).toBe(true);
  });

  it("rejects auto as an output language but accepts it as a source language", () => {
    expect(isSupportedLanguage("auto")).toBe(false);
    expect(isSourceLanguage("auto")).toBe(true);
  });

  it("rejects unsupported languages", () => {
    expect(isSupportedLanguage("ta")).toBe(false);
    expect(isSourceLanguage("fr")).toBe(false);
  });
});
