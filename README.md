# MyBantu — Offline Trilingual Community Assistant

MyBantu is a privacy-first, offline-capable AI platform for Malaysian communities. It supports Bahasa Melayu (`ms`), English (`en`), and Chinese (`zh`) and is designed to help people:

- translate everyday text locally;
- understand letters, bills, notices, manuals, and school documents;
- ask grounded questions about documents with page-level citations;
- use a simplified elder-friendly interface;
- retrieve technical knowledge and prepare basic service reports;
- later, access live meeting and classroom captions.

## Repository documentation

Read these files before writing code:

1. [`MVP_SCOPE.md`](./MVP_SCOPE.md) — what Version 1 must and must not contain.
2. [`ARCHITECTURE.md`](./ARCHITECTURE.md) — components, boundaries, data flow, APIs, and repository structure.
3. [`AGENTS.md`](./AGENTS.md) — mandatory implementation rules for Codex and other coding agents.
4. [`CLAUDE.md`](./CLAUDE.md) — entry instructions for Claude Code.

## Product modules

| Module                                      | Primary technology                | MVP status  |
| ------------------------------------------- | --------------------------------- | ----------- |
| TriLingua Offline Translation Engine        | C++ / ONNX Runtime                | Core MVP    |
| Community Document Helper PWA               | React / TypeScript / LangChain.js | Core MVP    |
| Technician Field Assistant                  | ASP.NET Core / React              | Limited MVP |
| Elder-Friendly Letter & Bill Explainer      | React accessibility mode          | Core MVP    |
| Meeting & Classroom Accessibility Assistant | Streaming speech AI               | Post-MVP    |

## MVP user journey

1. The user opens MyBantu locally.
2. The user selects English, Bahasa Melayu, or Chinese.
3. The user translates text or uploads a supported document.
4. MyBantu extracts text and preserves page references.
5. MyBantu produces:
   - a simple summary;
   - detected amounts and dates;
   - required actions;
   - a translated explanation.
6. The user asks questions about the document.
7. Every grounded answer includes document/page citations.
8. The user can switch to Elder Mode for larger controls and simpler wording.
9. A technician can query an uploaded manual and create a basic service report.

## Local development

See [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) for setup, running the stack, and
test commands. Architecture decisions live in `ARCHITECTURE.md` §18 and [`docs/adr`](./docs/adr).

## Core principles

- Local first; no cloud dependency is required for MVP operation.
- Source-grounded; important answers must cite the source page.
- Privacy first; documents stay on the user's device by default.
- Modular; translation, document intelligence, and business workflows remain replaceable.
- Honest; the system must say when evidence is insufficient.
- Accessible; the interface must remain usable by older and non-technical users.
