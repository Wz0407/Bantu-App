#include "abi_util.hpp"

#include <cstring>
#include <new>

namespace mybantu::trilingua {

char* alloc_abi_string(const std::string& value) {
    char* copy = new (std::nothrow) char[value.size() + 1];
    if (copy == nullptr) {
        return nullptr;
    }
    std::memcpy(copy, value.c_str(), value.size() + 1);
    return copy;
}

}  // namespace mybantu::trilingua
