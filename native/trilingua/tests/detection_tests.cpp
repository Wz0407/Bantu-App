// Deterministic language-detection tests (ADR-008 heuristic) and D2 allocation
// semantics. These compile the internal sources directly (the helpers are
// intentionally not exported from the shared library).

#include <gtest/gtest.h>

#include "abi_util.hpp"
#include "engine.hpp"

namespace {

using mybantu::trilingua::alloc_abi_string;
using mybantu::trilingua::detect_language_heuristic;

TEST(LanguageDetection, DetectsChineseByCjkRatio) {
    auto r = detect_language_heuristic("请在期限前付款，谢谢。");
    EXPECT_EQ(r.language, "zh");
    EXPECT_GT(r.confidence, 0.7);
}

TEST(LanguageDetection, DetectsMixedChineseWithLatinLiterals) {
    auto r = detect_language_heuristic("您本月的账单为RM129.00，请在7月20日前缴清。");
    EXPECT_EQ(r.language, "zh");
}

TEST(LanguageDetection, DetectsMalayByStopwords) {
    auto r = detect_language_heuristic("Sila bayar bil anda sebelum hujung bulan ini, terima kasih.");
    EXPECT_EQ(r.language, "ms");
    EXPECT_GT(r.confidence, 0.5);
}

TEST(LanguageDetection, DetectsEnglishByStopwords) {
    auto r = detect_language_heuristic("Please pay the outstanding amount before the end of this month.");
    EXPECT_EQ(r.language, "en");
    EXPECT_GT(r.confidence, 0.5);
}

TEST(LanguageDetection, ShortAmbiguousInputHasLowConfidence) {
    auto r = detect_language_heuristic("OK 123");
    EXPECT_EQ(r.language, "en");  // fallback
    EXPECT_LT(r.confidence, 0.5);
}

TEST(LanguageDetection, NumbersOnlyFallsBackWithLowConfidence) {
    auto r = detect_language_heuristic("12345 67890");
    EXPECT_EQ(r.language, "en");
    EXPECT_LT(r.confidence, 0.5);
}

// Deferred finding D2: an empty-but-valid string must be a real allocation,
// distinguishable from nullptr (failure/no value).
TEST(AbiAllocation, EmptyStringIsAllocatedNotNull) {
    char* empty = alloc_abi_string("");
    ASSERT_NE(empty, nullptr);
    EXPECT_STREQ(empty, "");
    delete[] empty;
}

TEST(AbiAllocation, NonEmptyStringRoundTrips) {
    char* value = alloc_abi_string("RM426.50 请在期限前付款");
    ASSERT_NE(value, nullptr);
    EXPECT_STREQ(value, "RM426.50 请在期限前付款");
    delete[] value;
}

}  // namespace
