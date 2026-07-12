# MyBantu Document AI service

Internal Node.js/TypeScript service for document ingestion, OCR, chunking, embeddings,
retrieval, grounded generation, and citations. It is **private**: it binds to loopback
and is called only by the ASP.NET Core API (`/internal/v1`). Never expose it to the browser.

## Phase 0 state

- `GET /internal/v1/health` — reports service health and provider availability.
- All AI providers (`ingestion`, `ocr`, `embeddings`, `llm`, `retriever`, `citations`)
  are `NotConfigured` placeholders that fail explicitly with stable error codes.
  No fake AI results are ever returned.
- Structured JSON logging with a strict field allowlist — document content can never
  be logged (AGENTS.md §14).
- LangChain.js, OCR engines, embedding models, vector stores, and local LLM runtimes
  are intentionally **not installed** yet (Phases 2–3).

## Commands

```bash
npm run build   # strict TypeScript compile to dist/
npm start       # run the service (default http://127.0.0.1:5210)
npm test        # vitest
npm run lint    # eslint
```

Configuration: `MYBANTU_DOCUMENT_AI_PORT` (default `5210`). Host is always `127.0.0.1`.
