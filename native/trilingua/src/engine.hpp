// Internal translation-engine interface. Model-specific inference (ONNX Runtime,
// Phase 1) implements this; the C ABI in trilingua.h never exposes these details.

#pragma once

#include <optional>
#include <string>

namespace mybantu::trilingua {

struct TranslationOutcome {
    int status_code;  // mb_status value
    std::string translated_text;
    std::string detected_language;
    std::string model_version;
    std::string error_message;
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

// UTF-8 validation shared by the ABI layer and tests.
bool is_valid_utf8(const char* text);

// Language-code validation against the shared contract (en/ms/zh, auto for source only).
bool is_supported_target_language(const std::string& code);
bool is_supported_source_language(const std::string& code);

}  // namespace mybantu::trilingua
