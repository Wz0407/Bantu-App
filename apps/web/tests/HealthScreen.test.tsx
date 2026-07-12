import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HealthStatus } from "@mybantu/shared-types";
import { App } from "../src/app/App";
import { HealthScreen } from "../src/app/HealthScreen";

const healthyResponse: HealthStatus = {
  status: "degraded",
  service: "mybantu-api",
  version: "0.1.0",
  timestampUtc: "2026-07-12T00:00:00Z",
  components: [
    { name: "translation-engine", availability: "NotConfigured" },
    { name: "document-ai", availability: "Unavailable" },
  ],
};

function mockFetch(response: Response | Error) {
  const impl =
    response instanceof Error
      ? vi.fn().mockRejectedValue(response)
      : vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", impl);
  return impl;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App shell", () => {
  it("renders header, navigation, main landmark, and privacy note", async () => {
    mockFetch(new Response(JSON.stringify(healthyResponse), { status: 200 }));
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "MyBantu" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByText(/documents stay on this device/i)).toBeInTheDocument();
    // Translate is the default view; the status screen is reachable via nav.
    expect(screen.getByRole("heading", { level: 2, name: /translate/i })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /system status/i }));
    await waitFor(() => expect(screen.getByText("degraded")).toBeInTheDocument());
  });
});

describe("HealthScreen", () => {
  it("shows component availability with honest labels", async () => {
    mockFetch(new Response(JSON.stringify(healthyResponse), { status: 200 }));
    render(<HealthScreen />);
    expect(await screen.findByText("translation-engine")).toBeInTheDocument();
    expect(screen.getByText("Not configured yet")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });

  it("shows an error state with retry when the API is unreachable", async () => {
    mockFetch(new TypeError("fetch failed"));
    render(<HealthScreen />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/cannot reach the local mybantu api/i);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("surfaces machine-readable API errors", async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          code: "INTERNAL_ERROR",
          message: "The API failed to start correctly. No data was changed. Retry after restart.",
          retryable: true,
        }),
        { status: 500 },
      ),
    );
    render(<HealthScreen />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/failed to start correctly/i);
  });
});
