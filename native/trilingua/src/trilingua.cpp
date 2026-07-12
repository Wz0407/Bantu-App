// C ABI implementation. No exception escapes this file; every entry point is
// wrapped so failures become explicit status codes (ARCHITECTURE.md §11).

#include "mybantu/trilingua.h"

#include <chrono>
#include <cstring>
#include <memory>
#include <mutex>
#include <new>
#include <string>

#include "engine.hpp"

namespace {

constexpr const char* kLibraryVersion = "trilingua/0.1.0";

// Phase 0 engine: honestly not configured. It never produces fake translations.
// Phase 1 replaces this with an ONNX Runtime-backed engine behind the same interface.
class NotConfiguredEngine final : public mybantu::trilingua::ITranslationEngine {
public:
    bool is_ready() const override { return false; }

    std::optional<std::string> model_version() const override { return std::nullopt; }

    mybantu::trilingua::TranslationOutcome translate(const std::string&,
                                                     const std::string&,
                                                     const std::string&) override {
        return {MB_STATUS_ENGINE_NOT_CONFIGURED,
                "",
                "",
                "",
                "Translation model is not installed. Configure the model directory "
                "and reinitialize the engine."};
    }
};

std::mutex g_mutex;
std::unique_ptr<mybantu::trilingua::ITranslationEngine> g_engine;

// Duplicates a string with library-owned memory; returns nullptr on empty input.
char* duplicate(const std::string& value) {
    if (value.empty()) {
        return nullptr;
    }
    char* copy = new (std::nothrow) char[value.size() + 1];
    if (copy == nullptr) {
        return nullptr;
    }
    std::memcpy(copy, value.c_str(), value.size() + 1);
    return copy;
}

mb_translation_result make_failure(int status_code, const std::string& message) {
    mb_translation_result result{};
    result.status_code = status_code;
    result.translated_text = nullptr;
    result.detected_language = nullptr;
    result.elapsed_ms = 0.0;
    result.model_version = nullptr;
    result.error_message = duplicate(message);
    return result;
}

}  // namespace

extern "C" {

int mb_initialize(const char* model_directory) {
    try {
        std::lock_guard<std::mutex> lock(g_mutex);
        // Phase 0: a model directory cannot be loaded yet, so any configuration
        // still yields the NotConfigured engine. No fake readiness.
        g_engine = std::make_unique<NotConfiguredEngine>();
        const bool configured = model_directory != nullptr && model_directory[0] != '\0';
        (void)configured;
        return MB_STATUS_ENGINE_NOT_CONFIGURED;
    } catch (...) {
        return MB_STATUS_INTERNAL_ERROR;
    }
}

mb_translation_result mb_translate(const mb_translation_request* request) {
    try {
        if (request == nullptr || request->text == nullptr ||
            request->source_language == nullptr || request->target_language == nullptr) {
            return make_failure(MB_STATUS_INVALID_ARGUMENT,
                                "Request and all request fields must be non-null.");
        }
        if (!mybantu::trilingua::is_valid_utf8(request->text)) {
            return make_failure(MB_STATUS_INVALID_UTF8, "Input text is not valid UTF-8.");
        }
        if (!mybantu::trilingua::is_supported_source_language(request->source_language) ||
            !mybantu::trilingua::is_supported_target_language(request->target_language)) {
            return make_failure(MB_STATUS_UNSUPPORTED_LANGUAGE,
                                "Supported languages: en, ms, zh (source may be 'auto').");
        }

        std::lock_guard<std::mutex> lock(g_mutex);
        if (!g_engine) {
            return make_failure(MB_STATUS_NOT_INITIALIZED,
                                "Call mb_initialize before mb_translate.");
        }

        const auto started = std::chrono::steady_clock::now();
        auto outcome = g_engine->translate(request->text, request->source_language,
                                           request->target_language);
        const auto elapsed =
            std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - started);

        mb_translation_result result{};
        result.status_code = outcome.status_code;
        result.translated_text = duplicate(outcome.translated_text);
        result.detected_language = duplicate(outcome.detected_language);
        result.elapsed_ms = elapsed.count();
        result.model_version = duplicate(outcome.model_version);
        result.error_message = duplicate(outcome.error_message);
        return result;
    } catch (...) {
        return make_failure(MB_STATUS_INTERNAL_ERROR, "Internal error during translation.");
    }
}

void mb_free_translation_result(mb_translation_result* result) {
    if (result == nullptr) {
        return;
    }
    delete[] result->translated_text;
    delete[] result->detected_language;
    delete[] result->model_version;
    delete[] result->error_message;
    result->translated_text = nullptr;
    result->detected_language = nullptr;
    result->model_version = nullptr;
    result->error_message = nullptr;
}

void mb_shutdown(void) {
    try {
        std::lock_guard<std::mutex> lock(g_mutex);
        g_engine.reset();
    } catch (...) {
        // Shutdown must never throw across the ABI.
    }
}

const char* mb_get_version(void) {
    return kLibraryVersion;
}

int mb_health_check(void) {
    try {
        std::lock_guard<std::mutex> lock(g_mutex);
        if (!g_engine) {
            return MB_STATUS_NOT_INITIALIZED;
        }
        return g_engine->is_ready() ? MB_STATUS_OK : MB_STATUS_ENGINE_NOT_CONFIGURED;
    } catch (...) {
        return MB_STATUS_INTERNAL_ERROR;
    }
}

}  // extern "C"
