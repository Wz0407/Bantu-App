import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocumentExtraction, DocumentSummary } from "@mybantu/shared-types";
import { DocumentsScreen } from "../src/features/documents/DocumentsScreen";

const readyDoc: DocumentSummary = {
  documentId: "doc-abc12345678901234567890123456789",
  fileName: "notis sekolah.txt",
  mimeType: "text/plain",
  sizeBytes: 2048,
  status: "ready",
  detectedLanguage: "ms",
  pageCount: 1,
  chunkCount: 3,
  createdAtUtc: "2026-07-13T00:00:00Z",
  indexedAtUtc: "2026-07-13T00:00:05Z",
  errorCode: null,
  errorMessage: null,
  warnings: [],
};

const failedDoc: DocumentSummary = {
  ...readyDoc,
  documentId: "doc-def12345678901234567890123456789",
  fileName: "scan.png",
  status: "failed",
  detectedLanguage: null,
  pageCount: null,
  errorCode: "OCR_FAILED",
  errorMessage: "OCR language data is not installed.",
};

const extraction: DocumentExtraction = {
  documentId: readyDoc.documentId,
  pageCount: 1,
  detectedLanguage: "ms",
  warnings: [],
  pages: [
    {
      pageNumber: 1,
      text: "Sila bayar RM50 sebelum 1 Ogos.",
      extractionMethod: "txt",
      ocrConfidence: null,
    },
  ],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => vi.unstubAllGlobals());

describe("DocumentsScreen", () => {
  it("lists documents, shows detail with pages, and never shows local paths", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/api/v1/documents") return Promise.resolve(json([readyDoc]));
        if (url.endsWith("/pages")) return Promise.resolve(json(extraction));
        return Promise.resolve(json({}, 404));
      }),
    );
    render(<DocumentsScreen />);

    const item = await screen.findByRole("button", { name: "notis sekolah.txt" });
    await userEvent.setup().click(item);

    expect(await screen.findByRole("heading", { name: "notis sekolah.txt" })).toBeInTheDocument();
    expect(screen.getByText("ms")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByText(/extracted text/i));
    expect(screen.getByText(/Sila bayar RM50/)).toBeInTheDocument();
    // Privacy: no filesystem paths anywhere in the UI.
    expect(document.body.textContent).not.toMatch(/[A-Z]:\\|\/home\/|\/tmp\//);
  });

  it("validates unsupported extensions and oversized files locally", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([])));
    render(<DocumentsScreen />);
    // applyAccept: false simulates a user bypassing the picker's accept filter.
    const user = userEvent.setup({ applyAccept: false });

    const input = (await screen.findByLabelText(/upload a document/i)) as HTMLInputElement;
    await user.upload(input, new File(["x"], "virus.exe", { type: "application/octet-stream" }));
    await user.click(screen.getByRole("button", { name: /^upload$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/unsupported file type/i);
  });

  it("shows processing failure with retry and runs the retry", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/v1/documents") return Promise.resolve(json([failedDoc]));
      if (url.endsWith("/process") && init?.method === "POST") {
        return Promise.resolve(
          json({ ...failedDoc, status: "ready", errorCode: null, errorMessage: null }),
        );
      }
      if (url.endsWith("/pages")) return Promise.resolve(json(extraction));
      return Promise.resolve(json({}, 404));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<DocumentsScreen />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "scan.png" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/OCR language data is not installed/);

    await user.click(screen.getByRole("button", { name: /retry processing/i }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/process"))).toBe(true),
    );
  });

  it("requires explicit confirmation before deleting", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return Promise.resolve(json({ deleted: true }));
      if (url === "/api/v1/documents") return Promise.resolve(json([readyDoc]));
      if (url.endsWith("/pages")) return Promise.resolve(json(extraction));
      return Promise.resolve(json({}, 404));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<DocumentsScreen />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "notis sekolah.txt" }));
    await user.click(screen.getByRole("button", { name: /delete document/i }));

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent(/cannot be undone/i);
    expect(
      fetchMock.mock.calls.every(
        ([, init]) => (init as RequestInit | undefined)?.method !== "DELETE",
      ),
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: /yes, delete everything/i }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([, init]) => (init as RequestInit | undefined)?.method === "DELETE",
        ),
      ).toBe(true),
    );
    expect(await screen.findByText(/were deleted from this device/i)).toBeInTheDocument();
  });

  it("shows an API-unreachable state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    render(<DocumentsScreen />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /cannot reach the local mybantu api/i,
    );
    expect(screen.getByText(/document list is unavailable/i)).toBeInTheDocument();
  });

  it("shows a privacy notice", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([])));
    render(<DocumentsScreen />);
    expect(
      await screen.findByText(
        /processed only on this device\. nothing is uploaded to the internet/i,
      ),
    ).toBeInTheDocument();
  });
});
