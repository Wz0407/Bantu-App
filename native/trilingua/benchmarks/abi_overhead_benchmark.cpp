// Phase 0 benchmark harness. It measures only ABI call overhead (validation,
// allocation, locking) because no translation model exists yet. Phase 1 extends
// this with real model benchmarks and records environment + model version
// (results belong in docs/evaluation).

#include <chrono>
#include <cstdio>

#include "mybantu/trilingua.h"

int main() {
    constexpr int kIterations = 100000;

    mb_initialize(nullptr);
    mb_translation_request request{"Sila bayar sebelum 18 Ogos.", "auto", "zh"};

    const auto started = std::chrono::steady_clock::now();
    for (int i = 0; i < kIterations; ++i) {
        auto result = mb_translate(&request);
        mb_free_translation_result(&result);
    }
    const auto elapsed =
        std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - started);
    mb_shutdown();

    std::printf("library: %s\n", mb_get_version());
    std::printf("scenario: ABI overhead (engine NotConfigured, no model loaded)\n");
    std::printf("iterations: %d\n", kIterations);
    std::printf("total_ms: %.3f\n", elapsed.count());
    std::printf("per_call_us: %.3f\n", elapsed.count() * 1000.0 / kIterations);
    return 0;
}
