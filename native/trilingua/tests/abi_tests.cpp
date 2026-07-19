// C ABI behavior tests: status codes, memory ownership, no fake translations.
// These run WITHOUT a model installed; model-dependent behavior is covered in
// model_tests.cpp (which skips when no model is available).

#include <gtest/gtest.h>

#include <cstring>

#include "mybantu/trilingua.h"

namespace {

class AbiTest : public ::testing::Test {
protected:
    void SetUp() override { mb_shutdown(); }
    void TearDown() override { mb_shutdown(); }
};

mb_translation_request make_request(const char* text, const char* source, const char* target) {
    return mb_translation_request{text, source, target};
}

TEST_F(AbiTest, VersionIsAlwaysAvailable) {
    const char* version = mb_get_version();
    ASSERT_NE(version, nullptr);
    EXPECT_NE(std::strlen(version), 0u);
}

TEST_F(AbiTest, HealthReportsNotInitializedBeforeInitialize) {
    EXPECT_EQ(mb_health_check(), MB_STATUS_NOT_INITIALIZED);
}

TEST_F(AbiTest, InitializeWithoutModelReportsNotConfigured) {
    EXPECT_EQ(mb_initialize(nullptr), MB_STATUS_ENGINE_NOT_CONFIGURED);
    EXPECT_EQ(mb_health_check(), MB_STATUS_ENGINE_NOT_CONFIGURED);
}

TEST_F(AbiTest, InitializeWithMissingDirectoryReportsNotConfigured) {
    EXPECT_EQ(mb_initialize("Z:/definitely/not/a/model/dir"), MB_STATUS_ENGINE_NOT_CONFIGURED);
}

TEST_F(AbiTest, TranslateBeforeInitializeFailsExplicitly) {
    auto request = make_request("Hello", "en", "ms");
    auto result = mb_translate(&request);
    EXPECT_EQ(result.status_code, MB_STATUS_NOT_INITIALIZED);
    EXPECT_EQ(result.translated_text, nullptr);
    ASSERT_NE(result.error_message, nullptr);
    mb_free_translation_result(&result);
}

TEST_F(AbiTest, TranslateWithoutModelNeverFakesOutput) {
    mb_initialize(nullptr);
    auto request = make_request("Sila bayar sebelum 18 Ogos.", "auto", "zh");
    auto result = mb_translate(&request);
    EXPECT_EQ(result.status_code, MB_STATUS_ENGINE_NOT_CONFIGURED);
    EXPECT_EQ(result.translated_text, nullptr);  // no fabricated translation
    ASSERT_NE(result.error_message, nullptr);
    mb_free_translation_result(&result);
}

TEST_F(AbiTest, NullArgumentsAreRejected) {
    mb_initialize(nullptr);
    auto result = mb_translate(nullptr);
    EXPECT_EQ(result.status_code, MB_STATUS_INVALID_ARGUMENT);
    mb_free_translation_result(&result);

    auto request = make_request(nullptr, "en", "ms");
    result = mb_translate(&request);
    EXPECT_EQ(result.status_code, MB_STATUS_INVALID_ARGUMENT);
    mb_free_translation_result(&result);
}

TEST_F(AbiTest, UnsupportedLanguagesAreRejected) {
    mb_initialize(nullptr);
    auto request = make_request("Hello", "en", "fr");
    auto result = mb_translate(&request);
    EXPECT_EQ(result.status_code, MB_STATUS_UNSUPPORTED_LANGUAGE);
    mb_free_translation_result(&result);

    // "auto" is valid as source only, never as target.
    request = make_request("Hello", "en", "auto");
    result = mb_translate(&request);
    EXPECT_EQ(result.status_code, MB_STATUS_UNSUPPORTED_LANGUAGE);
    mb_free_translation_result(&result);
}

TEST_F(AbiTest, ModelVersionQueryWithoutModel) {
    char buffer[64] = {'x', 0};
    EXPECT_EQ(mb_get_model_version(buffer, sizeof(buffer)), MB_STATUS_NOT_INITIALIZED);
    EXPECT_STREQ(buffer, "");

    mb_initialize(nullptr);
    EXPECT_EQ(mb_get_model_version(buffer, sizeof(buffer)), MB_STATUS_ENGINE_NOT_CONFIGURED);
    EXPECT_STREQ(buffer, "");

    EXPECT_EQ(mb_get_model_version(nullptr, 16), MB_STATUS_INVALID_ARGUMENT);
    EXPECT_EQ(mb_get_model_version(buffer, 0), MB_STATUS_INVALID_ARGUMENT);
}

TEST_F(AbiTest, FreeIsIdempotentAndNullSafe) {
    mb_free_translation_result(nullptr);

    mb_initialize(nullptr);
    auto request = make_request("Hello", "en", "ms");
    auto result = mb_translate(&request);
    mb_free_translation_result(&result);
    EXPECT_EQ(result.error_message, nullptr);
    mb_free_translation_result(&result);  // second free must be safe
}

TEST_F(AbiTest, ShutdownIsSafeWithoutInitialize) {
    mb_shutdown();
    mb_shutdown();
    EXPECT_EQ(mb_health_check(), MB_STATUS_NOT_INITIALIZED);
}

}  // namespace
