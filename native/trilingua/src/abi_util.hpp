// Allocation helpers for the C ABI. Kept in a separate translation unit so the
// memory-ownership semantics (including deferred finding D2: empty-but-valid
// strings) are directly unit-testable.

#pragma once

#include <string>

namespace mybantu::trilingua {

// Duplicates a string with library-owned memory. ALWAYS allocates, including for
// the empty string, so an empty-but-valid value is distinguishable from "no value"
// (nullptr). Returns nullptr only on allocation failure. Free with delete[] (the
// ABI wraps this in mb_free_translation_result).
char* alloc_abi_string(const std::string& value);

}  // namespace mybantu::trilingua
