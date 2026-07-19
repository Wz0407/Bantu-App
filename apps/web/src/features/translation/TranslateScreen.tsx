import { useId, useState } from "react";
import type { SourceLanguage, SupportedLanguage, TranslationResponse } from "@mybantu/shared-types";
import { ApiError, postTranslation } from "../../api/client";

const SOURCE_OPTIONS: Array<{ value: SourceLanguage; label: string }> = [
  { value: "auto", label: "Detect language" },
  { value: "en", label: "English" },
  { value: "ms", label: "Bahasa Melayu" },
  { value: "zh", label: "中文 (Chinese)" },
];

const TARGET_OPTIONS: Array<{ value: SupportedLanguage; label: string }> = [
  { value: "ms", label: "Bahasa Melayu" },
  { value: "en", label: "English" },
  { value: "zh", label: "中文 (Chinese)" },
];

type TranslateState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; result: TranslationResponse }
  | { kind: "model-missing"; message: string }
  | { kind: "error"; message: string; retryable: boolean };

/** Offline trilingual translation screen (UC-01). Talks only to the ASP.NET Core API. */
export function TranslateScreen() {
  const [text, setText] = useState("");
  const [source, setSource] = useState<SourceLanguage>("auto");
  const [target, setTarget] = useState<SupportedLanguage>("ms");
  const [state, setState] = useState<TranslateState>({ kind: "idle" });
  const textId = useId();
  const sourceId = useId();
  const targetId = useId();

  const canSwap = source !== "auto" && source !== target;

  const swapLanguages = () => {
    if (!canSwap) return;
    const previousSource = source as SupportedLanguage;
    setSource(target);
    setTarget(previousSource);
    if (state.kind === "success") {
      setText(state.result.translatedText);
      setState({ kind: "idle" });
    }
  };

  const translate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!text.trim()) {
      setState({ kind: "error", message: "Enter some text to translate.", retryable: false });
      return;
    }
    if (source === target) {
      setState({
        kind: "error",
        message: "Source and target language are the same. Choose a different target language.",
        retryable: false,
      });
      return;
    }
    setState({ kind: "loading" });
    try {
      const result = await postTranslation({
        text,
        sourceLanguage: source,
        targetLanguage: target,
        glossaryId: null,
      });
      setState({ kind: "success", result });
    } catch (error) {
      if (error instanceof ApiError) {
        if (
          error.error.code === "MODEL_NOT_INSTALLED" ||
          error.error.code === "MODEL_LOAD_FAILED"
        ) {
          setState({ kind: "model-missing", message: error.error.message });
        } else {
          setState({
            kind: "error",
            message: error.error.message,
            retryable: error.error.retryable,
          });
        }
      } else {
        setState({
          kind: "error",
          message: "Cannot reach the local MyBantu API. Make sure the local services are running.",
          retryable: true,
        });
      }
    }
  };

  return (
    <section aria-labelledby="translate-heading">
      <h2 id="translate-heading">Translate</h2>
      <p>Translation runs completely on this device. Your text is never sent to the internet.</p>

      <form onSubmit={(e) => void translate(e)}>
        <div>
          <label htmlFor={textId}>Text to translate</label>
          <textarea
            id={textId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            maxLength={5000}
            required
          />
        </div>

        <div className="language-row">
          <div>
            <label htmlFor={sourceId}>From</label>
            <select
              id={sourceId}
              value={source}
              onChange={(e) => setSource(e.target.value as SourceLanguage)}
            >
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={swapLanguages}
            disabled={!canSwap}
            aria-label="Swap languages"
            title={canSwap ? "Swap languages" : "Select a specific source language to swap"}
          >
            ⇄
          </button>

          <div>
            <label htmlFor={targetId}>To</label>
            <select
              id={targetId}
              value={target}
              onChange={(e) => setTarget(e.target.value as SupportedLanguage)}
            >
              {TARGET_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button type="submit" disabled={state.kind === "loading"}>
          {state.kind === "loading" ? "Translating…" : "Translate"}
        </button>
      </form>

      {state.kind === "loading" && <p role="status">Translating on this device…</p>}

      {state.kind === "model-missing" && (
        <div role="alert">
          <h3>Translation model not installed</h3>
          <p>{state.message}</p>
        </div>
      )}

      {state.kind === "error" && (
        <div role="alert">
          <p>{state.message}</p>
          {state.retryable && <p>You can try again.</p>}
        </div>
      )}

      {state.kind === "success" && (
        <div aria-live="polite">
          <h3>Translation</h3>
          <p className="translated-text" lang={state.result.targetLanguage}>
            {state.result.translatedText}
          </p>
          <dl className="translation-meta">
            <dt>Detected source language</dt>
            <dd>{state.result.detectedSourceLanguage}</dd>
            <dt>Model</dt>
            <dd>{state.result.modelVersion}</dd>
            <dt>Time</dt>
            <dd>{Math.round(state.result.processingTimeMs)} ms</dd>
          </dl>
          {state.result.warnings.length > 0 && (
            <ul className="warnings">
              {state.result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
