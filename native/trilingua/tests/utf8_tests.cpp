// UTF-8 boundary tests (AGENTS.md §7: add UTF-8 and memory-lifetime tests).

#include <gtest/gtest.h>

#include "engine.hpp"
#include "mybantu/trilingua.h"

namespace {

using mybantu::trilingua::is_valid_utf8;

TEST(Utf8Validation, AcceptsAsciiMalayAndChinese) {
    EXPECT_TRUE(is_valid_utf8("Hello, world"));
    EXPECT_TRUE(is_valid_utf8("Sila bayar sebelum 18 Ogos."));
    EXPECT_TRUE(is_valid_utf8("\xE8\xAF\xB7\xE5\x9C\xA8\xE6\x9C\x9F\xE9\x99\x90\xE5\x89\x8D\xE4\xBB\x98\xE6\xAC\xBE"));  // 请在期限前付款
    EXPECT_TRUE(is_valid_utf8(""));  // empty string is valid UTF-8
    EXPECT_TRUE(is_valid_utf8("\xF0\x9F\x98\x80"));  // 4-byte emoji
}

TEST(Utf8Validation, RejectsInvalidSequences) {
    EXPECT_FALSE(is_valid_utf8(nullptr));
    EXPECT_FALSE(is_valid_utf8("\xC3"));           // truncated 2-byte sequence
    EXPECT_FALSE(is_valid_utf8("\xE8\xAF"));       // truncated 3-byte sequence
    EXPECT_FALSE(is_valid_utf8("\xFF\xFE"));       // invalid lead bytes
    EXPECT_FALSE(is_valid_utf8("\xC0\xAF"));       // overlong encoding
    EXPECT_FALSE(is_valid_utf8("\xED\xA0\x80"));   // UTF-16 surrogate half
    EXPECT_FALSE(is_valid_utf8("a\x80"));          // stray continuation byte
}

TEST(Utf8Validation, LanguageCodeRules) {
    using mybantu::trilingua::is_supported_source_language;
    using mybantu::trilingua::is_supported_target_language;

    for (const char* code : {"en", "ms", "zh"}) {
        EXPECT_TRUE(is_supported_target_language(code));
        EXPECT_TRUE(is_supported_source_language(code));
    }
    EXPECT_TRUE(is_supported_source_language("auto"));
    EXPECT_FALSE(is_supported_target_language("auto"));
    EXPECT_FALSE(is_supported_target_language("fr"));
    EXPECT_FALSE(is_supported_source_language("ta"));
}

TEST(Utf8Abi, InvalidUtf8IsRejectedAtTheBoundary) {
    mb_shutdown();
    mb_initialize(nullptr);
    mb_translation_request request{"\xFF\xFE broken", "en", "ms"};
    auto result = mb_translate(&request);
    EXPECT_EQ(result.status_code, MB_STATUS_INVALID_UTF8);
    EXPECT_EQ(result.translated_text, nullptr);
    mb_free_translation_result(&result);
    mb_shutdown();
}

}  // namespace
