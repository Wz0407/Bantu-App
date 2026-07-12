# TriLingua native translation engine

C++20 shared library exposing a small, stable C ABI (`include/mybantu/trilingua.h`)
that the ASP.NET Core API consumes via P/Invoke (Phase 1).

## Boundary rules (ARCHITECTURE.md §11)

- UTF-8 everywhere; invalid input is rejected with `MB_STATUS_INVALID_UTF8`.
- No C++ exception crosses the ABI; every entry point returns an explicit status code.
- Memory ownership: strings in `mb_translation_result` are library-allocated and
  released only via `mb_free_translation_result` (idempotent, null-safe).
- Model-specific inference stays behind the internal `ITranslationEngine` interface.

## Phase 0 state

The only engine implementation is `NotConfiguredEngine`: `mb_health_check()` reports
`MB_STATUS_ENGINE_NOT_CONFIGURED` and `mb_translate` fails explicitly. No translation
model, ONNX Runtime, or inference code is present yet — and no fake output is ever produced.

## Build & test

```bash
cmake -S . -B build -G Ninja
cmake --build build
ctest --test-dir build --output-on-failure
./build/benchmarks/trilingua_benchmarks   # ABI-overhead benchmark only in Phase 0
```

Tests use GoogleTest fetched at configure time (network needed once; cached afterwards).
