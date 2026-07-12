import { useState } from "react";
import { HealthScreen } from "./HealthScreen";
import { TranslateScreen } from "../features/translation/TranslateScreen";
import "./app.css";

type View = "translate" | "status";

/**
 * Application shell: header, navigation, main landmark. Feature screens for
 * documents, elder mode and technician arrive in later phases.
 */
export function App() {
  const [view, setView] = useState<View>("translate");

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>MyBantu</h1>
        <p className="app-tagline">
          Offline trilingual community assistant — English, Bahasa Melayu, 中文
        </p>
        <nav aria-label="Main">
          <button
            type="button"
            onClick={() => setView("translate")}
            aria-current={view === "translate" ? "page" : undefined}
          >
            Translate
          </button>
          <button
            type="button"
            onClick={() => setView("status")}
            aria-current={view === "status" ? "page" : undefined}
          >
            System status
          </button>
        </nav>
      </header>
      <main>
        {view === "translate" && <TranslateScreen />}
        {view === "status" && <HealthScreen />}
      </main>
      <footer className="app-footer">
        <p>Local-first. Your documents stay on this device.</p>
      </footer>
    </div>
  );
}
