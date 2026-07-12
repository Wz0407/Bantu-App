# MyBantu web app

React + strict TypeScript PWA shell. It communicates **only** with the ASP.NET Core
API (ARCHITECTURE.md ADR-001) — never with the C++ library, Document AI service, or
any model runtime.

## Phase 0 state

- Application shell (header, main landmark, footer privacy note).
- System status screen backed by `GET /health`, with honest `NotConfigured` /
  `NotInstalled` labels, loading/error states, and retry.
- Typed API client in `src/api/client.ts`; all API access goes through it.
- Feature folders (`src/features/translation`, `documents`, `elder-mode`,
  `technician`) are reserved for Phases 1–5 and are intentionally empty.

## Commands

```bash
npm run dev     # dev server on http://127.0.0.1:5173 (proxies /api and /health to the API)
npm run build   # strict type-check + production build
npm test        # vitest + React Testing Library
npm run lint    # eslint
```

Set `MYBANTU_API_URL` to change the proxied API address (default `http://127.0.0.1:5100`).
