// Deterministic offline source-language detection (ADR-008).
// CJK codepoint ratio decides zh; otherwise a Malay/English stopword profile
// decides ms vs en. Ties fall back to English with low confidence — the caller
// surfaces a warning instead of silently trusting the guess.

#include <algorithm>
#include <array>
#include <cctype>
#include <cstdint>
#include <string>
#include <string_view>

#include "engine.hpp"

namespace mybantu::trilingua {

namespace {

constexpr std::array<std::string_view, 40> kMalayStopwords = {
    "dan",     "yang",   "untuk",   "dengan",  "tidak",   "ini",     "itu",    "ke",
    "pada",    "adalah", "atau",    "saya",    "anda",    "kami",    "mereka", "akan",
    "sudah",   "boleh",  "ada",     "dalam",   "sila",    "sebelum", "selepas", "kepada",
    "daripada", "bagi",  "tersebut", "jika",   "kerana",  "perlu",   "telah",  "bahawa",
    "seperti", "juga",   "sahaja",  "tolong",  "terima",  "kasih",   "bayar",  "ialah"};

constexpr std::array<std::string_view, 40> kEnglishStopwords = {
    "the",    "and",   "for",    "with",  "not",   "this",  "that",   "you",
    "are",    "was",   "will",   "have",  "can",   "there", "please", "before",
    "after",  "from",  "because", "need", "has",   "also",  "only",   "what",
    "when",   "where", "who",    "how",   "thanks", "pay",  "your",   "our",
    "would",  "should", "could", "about", "into",  "than",  "them",   "been"};

bool is_cjk(char32_t cp) {
    return (cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0x3400 && cp <= 0x4DBF) ||
           (cp >= 0xF900 && cp <= 0xFAFF) || (cp >= 0x20000 && cp <= 0x2A6DF);
}

// Minimal UTF-8 decoding for counting; input is pre-validated by the ABI layer.
struct Utf8Counts {
    int cjk = 0;
    int latin_letters = 0;
};

Utf8Counts count_scripts(const std::string& text) {
    Utf8Counts counts;
    const auto* bytes = reinterpret_cast<const std::uint8_t*>(text.data());
    size_t i = 0;
    while (i < text.size()) {
        std::uint8_t lead = bytes[i];
        char32_t cp = 0;
        int len = 1;
        if (lead < 0x80) {
            cp = lead;
        } else if ((lead & 0xE0) == 0xC0) {
            len = 2;
            cp = lead & 0x1F;
        } else if ((lead & 0xF0) == 0xE0) {
            len = 3;
            cp = lead & 0x0F;
        } else {
            len = 4;
            cp = lead & 0x07;
        }
        for (int k = 1; k < len && i + k < text.size(); ++k) {
            cp = (cp << 6) | (bytes[i + k] & 0x3F);
        }
        i += len;
        if (is_cjk(cp)) {
            counts.cjk++;
        } else if ((cp >= 'A' && cp <= 'Z') || (cp >= 'a' && cp <= 'z')) {
            counts.latin_letters++;
        }
    }
    return counts;
}

}  // namespace

DetectionResult detect_language_heuristic(const std::string& utf8_text) {
    const Utf8Counts counts = count_scripts(utf8_text);
    const int scored = counts.cjk + counts.latin_letters;
    if (scored == 0) {
        return {"en", 0.2};
    }

    const double cjk_ratio = static_cast<double>(counts.cjk) / scored;
    if (cjk_ratio >= 0.25) {
        return {"zh", std::min(1.0, 0.5 + cjk_ratio)};
    }

    // Latin script: Malay vs English stopword profile.
    int ms_hits = 0;
    int en_hits = 0;
    std::string word;
    auto score_word = [&]() {
        if (word.empty()) return;
        for (const auto& sw : kMalayStopwords)
            if (word == sw) { ms_hits++; break; }
        for (const auto& sw : kEnglishStopwords)
            if (word == sw) { en_hits++; break; }
        word.clear();
    };
    for (char ch : utf8_text) {
        if (std::isalpha(static_cast<unsigned char>(ch))) {
            word.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(ch))));
        } else {
            score_word();
        }
    }
    score_word();

    const int total_hits = ms_hits + en_hits;
    if (total_hits == 0) {
        return {"en", 0.3};
    }
    if (ms_hits > en_hits) {
        return {"ms", std::min(1.0, 0.5 + static_cast<double>(ms_hits - en_hits) / total_hits * 0.5)};
    }
    if (en_hits > ms_hits) {
        return {"en", std::min(1.0, 0.5 + static_cast<double>(en_hits - ms_hits) / total_hits * 0.5)};
    }
    return {"en", 0.34};
}

}  // namespace mybantu::trilingua
