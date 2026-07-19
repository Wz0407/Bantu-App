# Deferred findings

Items identified during phase audits that are intentionally deferred to the phase
where their code path becomes real. Resolved items stay recorded with their
resolution for traceability.

## Open

| ID  | Finding                                                                         | Address in            | Notes                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D4  | Single-threaded translation inference latency (10–18 s for long inputs on CPU). | **Phase 6** packaging | The multi-threaded CTranslate2 CPU pool deadlocks in the current source build (see ADR-008 threading section). Revisit with an OpenMP/oneDNN CTranslate2 build or official prebuilt binaries during packaging. |
| D5  | Scanned-PDF OCR is not supported (text-layer PDFs, PNG and JPEG only).          | **Post-MVP**          | Pages without an extractable text layer produce an explicit warning. Adding PDF rasterization (pdfjs render + OCR) needs a canvas dependency; deferred until demand is confirmed.                              |
| D6  | Web upload progress is binary (uploading/done), not percentage-based.           | **Post-MVP**          | Local uploads complete quickly; a percent bar needs XHR/streams plumbing that adds little for on-device transfers.                                                                                             |

## Resolved

| ID  | Finding                                                                 | Resolved in  | Resolution                                                                                                                                                                                                                                                            |
| --- | ----------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Document AI HTTP hardening (body limits, malformed JSON, timeouts).     | **Phase 2**  | `services/document-ai/src/api/http-server.ts`: bounded JSON bodies (413), malformed-JSON 400s, per-request processing timeout, header/request socket timeouts, machine-readable envelopes. Verified over real HTTP in `tests/http-server.test.ts`.                    |
| D2  | Empty successful translation indistinguishable from allocation failure. | **Phase 1B** | ABI contract: on `MB_STATUS_OK` result strings are always real allocations (empty string allowed); `nullptr` appears only on failure. `alloc_abi_string` + tests in `detection_tests.cpp`/`abi_tests.cpp`.                                                            |
| D3  | Document IDs in request-path logs.                                      | **Phase 2**  | Reviewed against AGENTS.md §14: document IDs are explicitly allowlisted log fields, and MyBantu request paths contain only generated `doc-<hex>` IDs — never original filenames or content. Original filenames are stored sanitized and never appear in URLs or logs. |
