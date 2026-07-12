import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TranslationResponse } from "@mybantu/shared-types";
import { TranslateScreen } from "../src/features/translation/TranslateScreen";

const successResponse: TranslationResponse = {
  originalText: "Sila bayar sebelum 18 Ogos.",
  translatedText: "请在8月18日之前付款。",
  detectedSourceLanguage: "ms",
  targetLanguage: "zh",
  modelVersion: "m2m100_418M-ct2-int8/v1",
  processingTimeMs: 412.3,
  warnings: ["Source language was auto-detected as 'ms'."],
};

function mockFetch(response: Response | Error) {
  const impl =
    response instanceof Error
      ? vi.fn().mockRejectedValue(response)
      : vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", impl);
  return impl;
}

afterEach(() => vi.unstubAllGlobals());

async function submitTranslation(text = "Sila bayar sebelum 18 Ogos.") {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/text to translate/i), text);
  await user.selectOptions(screen.getByLabelText(/^to$/i), "zh");
  await user.click(screen.getByRole("button", { name: /^translate$/i }));
  return user;
}

describe("TranslateScreen", () => {
  it("translates successfully and shows metadata and warnings", async () => {
    const fetchMock = mockFetch(new Response(JSON.stringify(successResponse), { status: 200 }));
    render(<TranslateScreen />);
    await submitTranslation();

    expect(await screen.findByText("请在8月18日之前付款。")).toBeInTheDocument();
    expect(screen.getByText("ms")).toBeInTheDocument();
    expect(screen.getByText("m2m100_418M-ct2-int8/v1")).toBeInTheDocument();
    expect(screen.getByText(/auto-detected as 'ms'/)).toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/translations");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.sourceLanguage).toBe("auto");
    expect(body.targetLanguage).toBe("zh");
  });

  it("shows a loading state while translating", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise(() => undefined)), // never resolves
    );
    render(<TranslateScreen />);
    await submitTranslation();
    expect(screen.getByRole("status")).toHaveTextContent(/translating on this device/i);
    expect(screen.getByRole("button", { name: /translating/i })).toBeDisabled();
  });

  it("shows the model-not-installed state distinctly", async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          code: "MODEL_NOT_INSTALLED",
          message: "The local translation model is not installed.",
          retryable: false,
        }),
        { status: 503 },
      ),
    );
    render(<TranslateScreen />);
    await submitTranslation();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/translation model not installed/i);
  });

  it("shows server errors with retry hint", async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          code: "NATIVE_ENGINE_UNAVAILABLE",
          message: "The translation engine failed unexpectedly.",
          retryable: true,
        }),
        { status: 503 },
      ),
    );
    render(<TranslateScreen />);
    await submitTranslation();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/failed unexpectedly/i);
    expect(alert).toHaveTextContent(/try again/i);
  });

  it("rejects same source and target locally", async () => {
    mockFetch(new Response("{}", { status: 200 }));
    const user = userEvent.setup();
    render(<TranslateScreen />);
    await user.type(screen.getByLabelText(/text to translate/i), "hello");
    await user.selectOptions(screen.getByLabelText(/^from$/i), "ms");
    await user.selectOptions(screen.getByLabelText(/^to$/i), "ms");
    await user.click(screen.getByRole("button", { name: /^translate$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/same/i);
  });

  it("swap is disabled for auto-detect and enabled for explicit languages", async () => {
    mockFetch(new Response("{}", { status: 200 }));
    const user = userEvent.setup();
    render(<TranslateScreen />);
    const swap = screen.getByRole("button", { name: /swap languages/i });
    expect(swap).toBeDisabled();
    await user.selectOptions(screen.getByLabelText(/^from$/i), "en");
    expect(swap).toBeEnabled();
  });

  it("is keyboard operable: form controls are labelled", () => {
    mockFetch(new Response("{}", { status: 200 }));
    render(<TranslateScreen />);
    expect(screen.getByLabelText(/text to translate/i)).toBeInstanceOf(HTMLTextAreaElement);
    expect(screen.getByLabelText(/^from$/i)).toBeInstanceOf(HTMLSelectElement);
    expect(screen.getByLabelText(/^to$/i)).toBeInstanceOf(HTMLSelectElement);
  });
});
