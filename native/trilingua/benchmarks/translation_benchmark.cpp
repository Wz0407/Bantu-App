// Real translation benchmark against the loaded model (ADR-008 / Gate 1B).
// Measures cold start and warm per-direction latency through the C ABI — the
// exact path .NET uses. Prints JSON to stdout. Exits with a clear message (and
// nonzero) when the model is not installed: placeholder numbers are never
// presented as translation performance.
//
// Usage: trilingua_benchmarks <model_dir>

#include <chrono>
#include <cstdio>
#include <string>
#include <vector>

#include "mybantu/trilingua.h"

namespace {

double now_ms() {
    return std::chrono::duration<double, std::milli>(
               std::chrono::steady_clock::now().time_since_epoch())
        .count();
}

struct Case {
    const char* direction;
    const char* src;
    const char* tgt;
    const char* text;
};

}  // namespace

int main(int argc, char** argv) {
    if (argc < 2) {
        std::fprintf(stderr,
                     "usage: trilingua_benchmarks <model_dir>\n"
                     "No model directory given — refusing to report ABI overhead as "
                     "translation performance.\n");
        return 2;
    }

    const double t0 = now_ms();
    const int init_status = mb_initialize(argv[1]);
    if (init_status != MB_STATUS_OK) {
        std::fprintf(stderr, "model not loadable from '%s' (status %d)\n", argv[1], init_status);
        return 3;
    }

    // Force full weight load with one small call, then report cold start.
    {
        mb_translation_request warm{"Hello.", "en", "ms"};
        auto r = mb_translate(&warm);
        mb_free_translation_result(&r);
    }
    const double cold_start_ms = now_ms() - t0;

    const std::vector<Case> cases = {
        {"en-ms", "en", "ms", "Your electricity bill for June 2026 is RM187.45. Please pay before 18 July 2026."},
        {"ms-en", "ms", "en", "Sila jelaskan baki tertunggak sebanyak RM75.20 sebelum 5 Ogos 2026."},
        {"en-zh", "en", "zh", "Final reminder: the outstanding amount of RM426.50 must be settled before 18 August 2026."},
        {"zh-en", "zh", "en", "您本月的宽带账单为RM129.00，请在7月20日前缴清。"},
        {"ms-zh", "ms", "zh", "Sila bayar deposit RM150 semasa pemasangan dan baki RM350 selepas kerja siap."},
        {"zh-ms", "zh", "ms", "尊敬的顾客，您尚有RM88.00未结清，请于2026年8月1日前付款。"},
    };
    constexpr int kIterations = 5;

    char model_version[128] = {0};
    mb_get_model_version(model_version, sizeof(model_version));

    std::printf("{\n");
    std::printf("  \"library\": \"%s\",\n", mb_get_version());
    std::printf("  \"modelVersion\": \"%s\",\n", model_version);
    std::printf("  \"coldStartMs\": %.1f,\n", cold_start_ms);
    std::printf("  \"iterationsPerDirection\": %d,\n", kIterations);
    std::printf("  \"directions\": {\n");
    for (size_t i = 0; i < cases.size(); ++i) {
        const auto& c = cases[i];
        double total = 0.0;
        double best = 1e18;
        bool ok = true;
        for (int it = 0; it < kIterations; ++it) {
            mb_translation_request request{c.text, c.src, c.tgt};
            const double s = now_ms();
            auto result = mb_translate(&request);
            const double elapsed = now_ms() - s;
            if (result.status_code != MB_STATUS_OK) ok = false;
            mb_free_translation_result(&result);
            total += elapsed;
            if (elapsed < best) best = elapsed;
        }
        std::printf("    \"%s\": { \"ok\": %s, \"meanMs\": %.1f, \"bestMs\": %.1f }%s\n",
                    c.direction, ok ? "true" : "false", total / kIterations, best,
                    i + 1 < cases.size() ? "," : "");
    }
    std::printf("  }\n}\n");

    mb_shutdown();
    return 0;
}
