#include "engine.hpp"

#include <cstdint>

namespace mybantu::trilingua {

bool is_valid_utf8(const char* text) {
    if (text == nullptr) {
        return false;
    }
    const auto* bytes = reinterpret_cast<const std::uint8_t*>(text);
    while (*bytes != 0) {
        std::uint8_t lead = *bytes;
        int continuation = 0;
        std::uint32_t code_point = 0;
        if (lead < 0x80) {
            ++bytes;
            continue;
        } else if ((lead & 0xE0) == 0xC0) {
            continuation = 1;
            code_point = lead & 0x1F;
            if (code_point < 0x02) return false;  // overlong 2-byte form
        } else if ((lead & 0xF0) == 0xE0) {
            continuation = 2;
            code_point = lead & 0x0F;
        } else if ((lead & 0xF8) == 0xF0) {
            continuation = 3;
            code_point = lead & 0x07;
        } else {
            return false;
        }
        ++bytes;
        for (int i = 0; i < continuation; ++i, ++bytes) {
            if ((*bytes & 0xC0) != 0x80) {
                return false;
            }
            code_point = (code_point << 6) | (*bytes & 0x3F);
        }
        if (continuation == 2 && code_point < 0x800) return false;    // overlong
        if (continuation == 3 && code_point < 0x10000) return false;  // overlong
        if (code_point > 0x10FFFF) return false;
        if (code_point >= 0xD800 && code_point <= 0xDFFF) return false;  // surrogate
    }
    return true;
}

bool is_supported_target_language(const std::string& code) {
    return code == "en" || code == "ms" || code == "zh";
}

bool is_supported_source_language(const std::string& code) {
    return code == "auto" || is_supported_target_language(code);
}

}  // namespace mybantu::trilingua
