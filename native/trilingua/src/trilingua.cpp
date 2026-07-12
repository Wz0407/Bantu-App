// C ABI implementation. No exception escapes this file; every entry point is
// wrapped so failures become explicit status codes (ARCHITECTURE.md §11).
//
// Threading policy: the engine pointer is swapped under a mutex; translations
// take a shared_ptr snapshot and run outside that lock. The engine itself
// serializes inference internally (a single model instance is not re-entrant),
// so concurrent callers queue rather than race. Reinitialization does not
// interrupt in-flight translations (they keep the previous shared_ptr alive).

#include "mybantu/trilingua.h"

#include <algorithm>
#include <chrono>
#include <cstring>
#include <memory>
#include <mutex>
#include <string>

#include "abi_util.hpp"
#include "engine.hpp"

namespace {

using mybantu::trilingua::alloc_abi_string;
using mybantu::trilingua::ITranslationEngine;

constexpr const char* kLibraryVersion = "trilingua/0.2.0";

std::mutex g_mutex;
std::shared_ptr<ITranslationEngine> g_engine;
bool g_initialized = false;
int g_engine_status = MB_STATUS_NOT_INITIALIZED;

std::shared_ptr<ITranslationEngine> snapshot_engine() {
    std::lock_guard<std::mutex> lock(g_mutex);
    return g_engine;
}

mb_translation_result make_failure(int status_code, const std::string& message) {
    mb_translation_result result{};
    result.status_code = status_code;
    result.translated_text = nullptr;
    result.detected_language = nullptr;
    result.elapsed_ms = 0.0;
    result.model_version = nullptr;
    result.error_message = alloc_abi_string(message);
    result.detection_confidence = 0.0;
    return result;
}

}  // namespace

extern "C" {

int mb_initialize(const char* model_directory) {
    try {
        const std::string dir = model_directory ? model_directory : "";
        int status = MB_STATUS_ENGINE_NOT_CONFIGURED;
        std::string error;
        auto engine = mybantu::trilingua::create_m2m_engine(dir, status, error);

        std::lock_guard<std::mutex> lock(g_mutex);
        g_initialized = true;
        g_engine = std::move(engine);  // nullptr when not configured / load failed
        g_engine_status = g_engine ? MB_STATUS_OK : status;
        return g_engine_status;
    } catch (...) {
        std::lock_guard<std::mutex> lock(g_mutex);
        g_initialized = true;
        g_engine.reset();
        g_engine_status = MB_STATUS_INTERNAL_ERROR;
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

        auto engine = snapshot_engine();
        if (!engine) {
            std::lock_guard<std::mutex> lock(g_mutex);
            if (!g_initialized) {
                return make_failure(MB_STATUS_NOT_INITIALIZED,
                                    "Call mb_initialize before mb_translate.");
            }
            return make_failure(g_engine_status,
                                "Translation model is not installed. Run the model setup "
                                "and reinitialize the engine.");
        }

        const auto started = std::chrono::steady_clock::now();
        auto outcome = engine->translate(request->text, request->source_language,
                                         request->target_language);
        const auto elapsed =
            std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - started);

        mb_translation_result result{};
        result.status_code = outcome.status_code;
        result.elapsed_ms = elapsed.count();
        result.detection_confidence = outcome.detection_confidence;
        if (outcome.status_code == MB_STATUS_OK) {
            // D2: success strings are always allocated, even when empty.
            result.translated_text = alloc_abi_string(outcome.translated_text);
            result.detected_language = alloc_abi_string(outcome.detected_language);
            result.model_version = alloc_abi_string(outcome.model_version);
            result.error_message = nullptr;
            if (result.translated_text == nullptr || result.detected_language == nullptr ||
                result.model_version == nullptr) {
                mb_free_translation_result(&result);
                return make_failure(MB_STATUS_INTERNAL_ERROR, "Out of memory building result.");
            }
        } else {
            result.translated_text = nullptr;
            result.detected_language = nullptr;
            result.model_version = nullptr;
            result.error_message = alloc_abi_string(outcome.error_message);
        }
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
        g_initialized = false;
        g_engine_status = MB_STATUS_NOT_INITIALIZED;
    } catch (...) {
        // Shutdown must never throw across the ABI.
    }
}

const char* mb_get_version(void) {
    return kLibraryVersion;
}

int mb_get_model_version(char* buffer, int buffer_size) {
    try {
        if (buffer == nullptr || buffer_size <= 0) {
            return MB_STATUS_INVALID_ARGUMENT;
        }
        buffer[0] = '\0';
        auto engine = snapshot_engine();
        if (!engine) {
            std::lock_guard<std::mutex> lock(g_mutex);
            return g_initialized ? g_engine_status : MB_STATUS_NOT_INITIALIZED;
        }
        const auto version = engine->model_version().value_or("");
        const size_t copy_len =
            std::min(version.size(), static_cast<size_t>(buffer_size - 1));
        std::memcpy(buffer, version.data(), copy_len);
        buffer[copy_len] = '\0';
        return MB_STATUS_OK;
    } catch (...) {
        return MB_STATUS_INTERNAL_ERROR;
    }
}

int mb_health_check(void) {
    try {
        std::lock_guard<std::mutex> lock(g_mutex);
        if (!g_initialized) {
            return MB_STATUS_NOT_INITIALIZED;
        }
        if (!g_engine) {
            return g_engine_status;
        }
        return g_engine->is_ready() ? MB_STATUS_OK : MB_STATUS_ENGINE_NOT_CONFIGURED;
    } catch (...) {
        return MB_STATUS_INTERNAL_ERROR;
    }
}

}  // extern "C"
