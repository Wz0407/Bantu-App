// Internal translation-engine interface. Model-specific inference (CTranslate2 +
// M2M-100, per ADR-008) implements this; the C ABI in trilingua.h never exposes
// these details.

#pragma once

#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace mybantu::trilingua {

struct TranslationOutcome {
    int status_code;  // mb_status value
    std::string translated_text;
    std::string detected_language;
    std::string model_version;
    std::string error_message;
    double detection_confidence = 1.0;  // 1.0 when the caller specified the source language
};

class ITranslationEngine {
public:
    virtual ~ITranslationEngine() = default;

    virtual bool is_ready() const = 0;
    virtual std::optional<std::string> model_version() const = 0;
    virtual TranslationOutcome translate(const std::string& utf8_text,
                                         const std::string& source_language,
                                         const std::string& target_language) = 0;
};

// Factory: loads the CTranslate2 M2M-100 engine from a model directory.
// On failure returns nullptr and sets status/error (status is an mb_status value:
// ENGINE_NOT_CONFIGURED when the directory has no model, MODEL_LOAD_FAILED when a
// model exists but cannot be loaded).
std::unique_ptr<ITranslationEngine> create_m2m_engine(const std::string& model_directory,
                                                      int& status,
                                                      std::string& error);

// UTF-8 validation shared by the ABI layer and tests.
bool is_valid_utf8(const char* text);

// Language-code validation against the shared contract (en/ms/zh, auto for source only).
bool is_supported_target_language(const std::string& code);
bool is_supported_source_language(const std::string& code);

// Deterministic offline source-language detection (ADR-008):
// CJK codepoint ratio => zh; otherwise Malay/English stopword profile.
struct DetectionResult {
    std::string language;  // "en" | "ms" | "zh"
    double confidence;     // 0..1; low confidence should surface a warning upstream
};
DetectionResult detect_language_heuristic(const std::string& utf8_text);

}  // namespace mybantu::trilingua
