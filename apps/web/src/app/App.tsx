import { HealthScreen } from "./HealthScreen";
import "./app.css";

/**
 * Phase 0 application shell: header, main landmark, and the health/status screen.
 * Feature screens (translation, documents, elder mode, technician) arrive in
 * Phases 1–5 under src/features/.
 */
export function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>MyBantu</h1>
        <p className="app-tagline">
          Offline trilingual community assistant — English, Bahasa Melayu, 中文
        </p>
      </header>
      <main>
        <HealthScreen />
      </main>
      <footer className="app-footer">
        <p>Local-first. Your documents stay on this device.</p>
      </footer>
    </div>
  );
}
