import { useCallback, useEffect, useState } from "react";
import type { HealthStatus, ServiceAvailability } from "@mybantu/shared-types";
import { ApiError, getHealth } from "../api/client";

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; health: HealthStatus }
  | { kind: "error"; message: string };

const AVAILABILITY_LABELS: Record<ServiceAvailability, string> = {
  Available: "Available",
  NotConfigured: "Not configured yet",
  NotInstalled: "Not installed yet",
  Unavailable: "Unavailable",
};

/** System status screen. Shows honestly which local components are ready (FR-02). */
export function HealthScreen() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const health = await getHealth();
      setState({ kind: "loaded", health });
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "Cannot reach the local MyBantu API. Make sure the local services are running, then retry.";
      setState({ kind: "error", message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section aria-labelledby="health-heading">
      <h2 id="health-heading">System status</h2>

      {state.kind === "loading" && <p role="status">Checking local services…</p>}

      {state.kind === "error" && (
        <div role="alert">
          <p>{state.message}</p>
          <button type="button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {state.kind === "loaded" && (
        <>
          <p>
            API: <strong>{state.health.status}</strong> (version {state.health.version})
          </p>
          <table>
            <caption className="visually-hidden">Availability of local components</caption>
            <thead>
              <tr>
                <th scope="col">Component</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {state.health.components.map((component) => (
                <tr key={component.name}>
                  <td>{component.name}</td>
                  <td>{AVAILABILITY_LABELS[component.availability]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={() => void load()}>
            Refresh
          </button>
        </>
      )}
    </section>
  );
}
