// CTranslate2 + SentencePiece implementation of the translation engine (ADR-008).
// Model: facebook/m2m100_418M (CTranslate2 INT8 conversion). All six MyBantu
// directions are direct. This file owns all model-specific details; nothing here
// leaks through the C ABI.

#include <ctranslate2/translator.h>
#include <sentencepiece_processor.h>

#include <filesystem>
#include <fstream>
#include <memory>
#include <mutex>
#include <optional>
#include <sstream>
#include <string>
#include <vector>

#include "engine.hpp"
#include "mybantu/trilingua.h"

namespace mybantu::trilingua {

namespace {

namespace fs = std::filesystem;

std::string lang_token(const std::string& code) { return "__" + code + "__"; }

// Reads modelVersion from model-manifest.json without a JSON dependency
// (the manifest is machine-written by scripts/model-setup; a simple scan is enough).
std::string read_model_version(const fs::path& model_dir) {
    std::ifstream manifest(model_dir / "model-manifest.json");
    if (manifest) {
        std::stringstream buffer;
        buffer << manifest.rdbuf();
        const std::string content = buffer.str();
        const std::string key = "\"modelVersion\":";
        auto pos = content.find(key);
        if (pos != std::string::npos) {
            auto start = content.find('"', pos + key.size());
            auto end = content.find('"', start + 1);
            if (start != std::string::npos && end != std::string::npos) {
                return content.substr(start + 1, end - start - 1);
            }
        }
    }
    return "m2m100_418M-ct2/unversioned";
}

class M2MTranslationEngine final : public ITranslationEngine {
public:
    M2MTranslationEngine(std::unique_ptr<ctranslate2::Translator> translator,
                         std::unique_ptr<sentencepiece::SentencePieceProcessor> tokenizer,
                         std::string model_version)
        : translator_(std::move(translator)),
          tokenizer_(std::move(tokenizer)),
          model_version_(std::move(model_version)) {}

    bool is_ready() const override { return true; }

    std::optional<std::string> model_version() const override { return model_version_; }

    TranslationOutcome translate(const std::string& utf8_text,
                                 const std::string& source_language,
                                 const std::string& target_language) override {
        TranslationOutcome outcome{};
        outcome.model_version = model_version_;

        std::string resolved_source = source_language;
        outcome.detection_confidence = 1.0;
        if (source_language == "auto") {
            const DetectionResult detected = detect_language_heuristic(utf8_text);
            resolved_source = detected.language;
            outcome.detection_confidence = detected.confidence;
        }
        outcome.detected_language = resolved_source;

        try {
            // A single CTranslate2 Translator (and the SentencePiece processor) is
            // not safe for concurrent calls, so inference is serialized here. Each
            // call already parallelizes across all CPU cores (intra-op), so this
            // does not reduce throughput for MyBantu's local single-user use; it
            // also prevents thread oversubscription. Concurrent callers queue.
            std::lock_guard<std::mutex> inference_lock(inference_mutex_);

            std::vector<std::string> pieces;
            tokenizer_->Encode(utf8_text, &pieces).IgnoreError();

            std::vector<std::string> source_tokens;
            source_tokens.reserve(pieces.size() + 2);
            source_tokens.push_back(lang_token(resolved_source));
            source_tokens.insert(source_tokens.end(), pieces.begin(), pieces.end());
            source_tokens.push_back("</s>");

            ctranslate2::TranslationOptions options;
            options.beam_size = 2;
            options.max_decoding_length = 512;

            const std::string target_token = lang_token(target_language);
            const auto results = translator_->translate_batch(
                {source_tokens}, {{target_token}}, options);

            const auto& output_tokens = results[0].output();
            std::vector<std::string> content_tokens;
            content_tokens.reserve(output_tokens.size());
            for (const auto& token : output_tokens) {
                if (token != target_token && token != "</s>") {
                    content_tokens.push_back(token);
                }
            }
            std::string translated;
            tokenizer_->Decode(content_tokens, &translated).IgnoreError();

            // Empty output for non-empty input is valid (D2): report it as success;
            // the ABI layer allocates a real empty string, never nullptr.
            outcome.status_code = MB_STATUS_OK;
            outcome.translated_text = std::move(translated);
            return outcome;
        } catch (const std::exception& ex) {
            outcome.status_code = MB_STATUS_INTERNAL_ERROR;
            outcome.error_message = std::string("Translation failed: ") + ex.what();
            return outcome;
        }
    }

private:
    std::unique_ptr<ctranslate2::Translator> translator_;
    std::unique_ptr<sentencepiece::SentencePieceProcessor> tokenizer_;
    std::string model_version_;
    mutable std::mutex inference_mutex_;
};

}  // namespace

std::unique_ptr<ITranslationEngine> create_m2m_engine(const std::string& model_directory,
                                                      int& status,
                                                      std::string& error) {
    const fs::path dir(model_directory);
    if (model_directory.empty() || !fs::exists(dir / "model.bin") ||
        !fs::exists(dir / "sentencepiece.bpe.model")) {
        status = MB_STATUS_ENGINE_NOT_CONFIGURED;
        error = "Translation model is not installed. Run scripts/model-setup/"
                "setup-translation-model.py and configure the model directory.";
        return nullptr;
    }

    try {
        auto tokenizer = std::make_unique<sentencepiece::SentencePieceProcessor>();
        const auto sp_status = tokenizer->Load((dir / "sentencepiece.bpe.model").string());
        if (!sp_status.ok()) {
            status = MB_STATUS_MODEL_LOAD_FAILED;
            error = "Tokenizer load failed: " + sp_status.ToString();
            return nullptr;
        }

        // Bound the intra-op thread pool. INT8 M2M-100 on CPU is fast enough for
        // MyBantu's short inputs, and a small fixed pool (a) leaves cores for the
        // other local services, (b) avoids oversubscription when requests are
        // serialized, and (c) keeps thread-pool teardown deterministic (an
        // unbounded auto pool of all cores could deadlock on process exit).
        ctranslate2::ReplicaPoolConfig pool_config;
        pool_config.num_threads_per_replica = 1;
        auto translator = std::make_unique<ctranslate2::Translator>(
            dir.string(), ctranslate2::Device::CPU, ctranslate2::ComputeType::INT8,
            std::vector<int>{0}, /*tensor_parallel=*/false, pool_config);

        status = MB_STATUS_OK;
        error.clear();
        return std::make_unique<M2MTranslationEngine>(
            std::move(translator), std::move(tokenizer), read_model_version(dir));
    } catch (const std::exception& ex) {
        status = MB_STATUS_MODEL_LOAD_FAILED;
        error = std::string("Model load failed: ") + ex.what();
        return nullptr;
    }
}

}  // namespace mybantu::trilingua
