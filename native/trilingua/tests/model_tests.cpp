// Model-dependent translation tests. These exercise the REAL engine and model.
// When the model is not installed (e.g. cloud CI), every test SKIPS with an
// explicit reason — a skip is never reported as a pass of translation behavior.
//
// Set TRILINGUA_TEST_MODEL_DIR to the CTranslate2 model directory, e.g.
//   models/translation/m2m100_418M-ct2

#include <gtest/gtest.h>

#include <atomic>
#include <cstdlib>
#include <filesystem>
#include <string>
#include <thread>
#include <vector>

#include "mybantu/trilingua.h"

namespace {

// Portable environment read. MSVC deprecates std::getenv (C4996) and the build
// treats warnings as errors, so use _dupenv_s there; std::getenv elsewhere.
std::string read_env(const char* name) {
#if defined(_MSC_VER)
    char* value = nullptr;
    size_t len = 0;
    if (_dupenv_s(&value, &len, name) != 0 || value == nullptr) {
        return {};
    }
    std::string result(value);
    std::free(value);
    return result;
#else
    const char* value = std::getenv(name);
    return value ? std::string(value) : std::string{};
#endif
}

std::string model_dir() { return read_env("TRILINGUA_TEST_MODEL_DIR"); }

bool model_available() {
    const auto dir = model_dir();
    return !dir.empty() && std::filesystem::exists(std::filesystem::path(dir) / "model.bin");
}

class ModelTest : public ::testing::Test {
protected:
    static void SetUpTestSuite() {
        if (model_available()) {
            ASSERT_EQ(mb_initialize(model_dir().c_str()), MB_STATUS_OK);
        }
    }
    static void TearDownTestSuite() { mb_shutdown(); }

    void SetUp() override {
        if (!model_available()) {
            GTEST_SKIP() << "TRILINGUA_TEST_MODEL_DIR not set or model missing — "
                            "model-dependent test skipped (NOT passed).";
        }
    }

    static std::string translate_ok(const char* text, const char* src, const char* tgt,
                                    std::string* detected = nullptr) {
        mb_translation_request request{text, src, tgt};
        auto result = mb_translate(&request);
        EXPECT_EQ(result.status_code, MB_STATUS_OK)
            << (result.error_message ? result.error_message : "(no message)");
        std::string out;
        if (result.status_code == MB_STATUS_OK) {
            EXPECT_NE(result.translated_text, nullptr);
            EXPECT_NE(result.detected_language, nullptr);
            EXPECT_NE(result.model_version, nullptr);
            out = result.translated_text ? result.translated_text : "";
            if (detected && result.detected_language) *detected = result.detected_language;
        }
        mb_free_translation_result(&result);
        return out;
    }
};

TEST_F(ModelTest, HealthAndModelVersionReportLoadedModel) {
    EXPECT_EQ(mb_health_check(), MB_STATUS_OK);
    char buffer[128];
    ASSERT_EQ(mb_get_model_version(buffer, sizeof(buffer)), MB_STATUS_OK);
    EXPECT_NE(std::string(buffer).find("m2m100"), std::string::npos);
}

TEST_F(ModelTest, AllSixDirectionsProduceOutput) {
    struct Case { const char* text; const char* src; const char* tgt; };
    const std::vector<Case> cases = {
        {"Please pay before the deadline.", "en", "ms"},
        {"Sila bayar sebelum tarikh akhir.", "ms", "en"},
        {"Please pay before the deadline.", "en", "zh"},
        {"请在期限之前付款。", "zh", "en"},
        {"Sila bayar sebelum tarikh akhir.", "ms", "zh"},
        {"请在期限之前付款。", "zh", "ms"},
    };
    for (const auto& c : cases) {
        const auto out = translate_ok(c.text, c.src, c.tgt);
        EXPECT_FALSE(out.empty()) << c.src << "->" << c.tgt;
    }
}

TEST_F(ModelTest, ChineseUtf8RoundTripsAndAmountIsPreserved) {
    const auto out = translate_ok("您尚有RM88.00未结清，请尽快付款。", "zh", "en");
    EXPECT_NE(out.find("RM88.00"), std::string::npos) << out;
}

TEST_F(ModelTest, MalayCurrencyAndDatePreserved) {
    const auto out = translate_ok(
        "Sila jelaskan baki RM75.20 sebelum 5 Ogos 2026.", "ms", "en");
    EXPECT_NE(out.find("RM75.20"), std::string::npos) << out;
    EXPECT_NE(out.find("2026"), std::string::npos) << out;
}

TEST_F(ModelTest, ModelNumbersAndErrorCodesPreserved) {
    const auto out = translate_ok(
        "Error code E4 on model AC-INV12K means the water inlet is blocked.", "en", "zh");
    EXPECT_NE(out.find("E4"), std::string::npos) << out;
    EXPECT_NE(out.find("AC-INV12K"), std::string::npos) << out;
}

TEST_F(ModelTest, AutoDetectionResolvesLanguages) {
    std::string detected;
    translate_ok("Terima kasih banyak, sila hubungi kami sebelum esok.", "auto", "en", &detected);
    EXPECT_EQ(detected, "ms");
    translate_ok("请在期限之前付款。", "auto", "en", &detected);
    EXPECT_EQ(detected, "zh");
}

TEST_F(ModelTest, RepeatedCallsAreStable) {
    for (int i = 0; i < 5; ++i) {
        const auto out = translate_ok("Good morning, see you at 12:30.", "en", "ms");
        EXPECT_FALSE(out.empty());
    }
}

TEST_F(ModelTest, ConcurrentCallsAreSafe) {
    std::atomic<int> failures{0};
    std::vector<std::thread> threads;
    for (int t = 0; t < 4; ++t) {
        threads.emplace_back([&failures, t]() {
            const char* texts[] = {"Please pay before Friday.", "Sila bayar sebelum Jumaat.",
                                   "请在星期五之前付款。", "Thank you for your payment."};
            const char* sources[] = {"en", "ms", "zh", "en"};
            const char* targets[] = {"ms", "zh", "en", "zh"};
            mb_translation_request request{texts[t], sources[t], targets[t]};
            auto result = mb_translate(&request);
            if (result.status_code != MB_STATUS_OK || result.translated_text == nullptr) {
                failures++;
            }
            mb_free_translation_result(&result);
        });
    }
    for (auto& th : threads) th.join();
    EXPECT_EQ(failures.load(), 0);
}

TEST_F(ModelTest, ReinitializeWithBadDirectoryReportsLoadStateThenRecovers) {
    EXPECT_EQ(mb_initialize("Z:/no/such/model"), MB_STATUS_ENGINE_NOT_CONFIGURED);
    EXPECT_EQ(mb_health_check(), MB_STATUS_ENGINE_NOT_CONFIGURED);
    ASSERT_EQ(mb_initialize(model_dir().c_str()), MB_STATUS_OK);
    EXPECT_EQ(mb_health_check(), MB_STATUS_OK);
}

}  // namespace
