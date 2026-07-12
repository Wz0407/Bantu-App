cmake_minimum_required(VERSION 3.24)
project(trilingua VERSION 0.2.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(TRILINGUA_BUILD_TESTS "Build TriLingua tests" ON)
option(TRILINGUA_BUILD_BENCHMARKS "Build TriLingua benchmarks" ON)

# Co-locate the DLL/EXE outputs so tests find the library on Windows.
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)

# ---------------------------------------------------------------------------
# Third-party inference dependencies (ADR-008): CTranslate2 + SentencePiece.
# Both are fetched at configure time (network needed once, like GoogleTest).
# CTranslate2 builds as its own shared library (matching its official
# distribution); deployments ship trilingua + ctranslate2 side by side.
# SentencePiece links statically into trilingua.
# ---------------------------------------------------------------------------
include(FetchContent)

# Some vendored subprojects still declare cmake_minimum_required < 3.5.
set(CMAKE_POLICY_VERSION_MINIMUM 3.5)

# SentencePiece (tokenizer, Apache 2.0)
set(SPM_ENABLE_SHARED OFF CACHE BOOL "" FORCE)
set(SPM_ENABLE_TCMALLOC OFF CACHE BOOL "" FORCE)
FetchContent_Declare(
    sentencepiece
    GIT_REPOSITORY https://github.com/google/sentencepiece.git
    GIT_TAG v0.2.0
    GIT_SHALLOW TRUE
)

# CTranslate2 (translation runtime, MIT). CPU-only with the Ruy backend: no MKL,
# no oneDNN, no CUDA. Only the needed submodules are fetched (the CUDA-only
# 'thrust' submodule breaks Windows path-length limits and is excluded).
set(WITH_MKL OFF CACHE BOOL "" FORCE)
set(WITH_DNNL OFF CACHE BOOL "" FORCE)
set(WITH_RUY ON CACHE BOOL "" FORCE)
set(WITH_CUDA OFF CACHE BOOL "" FORCE)
set(OPENMP_RUNTIME "NONE" CACHE STRING "" FORCE)
set(BUILD_CLI OFF CACHE BOOL "" FORCE)
set(BUILD_TESTS OFF CACHE BOOL "" FORCE)
FetchContent_Declare(
    ctranslate2
    GIT_REPOSITORY https://github.com/OpenNMT/CTranslate2.git
    GIT_TAG v4.8.1
    GIT_SHALLOW TRUE
    GIT_SUBMODULES "third_party/ruy;third_party/spdlog;third_party/cpu_features"
    GIT_SUBMODULES_RECURSE TRUE
    GIT_CONFIG core.longpaths=true
)

FetchContent_MakeAvailable(sentencepiece ctranslate2)

# ---------------------------------------------------------------------------
# trilingua shared library (the only artifact consumed via P/Invoke)
# ---------------------------------------------------------------------------
add_library(trilingua SHARED
    src/trilingua.cpp
    src/validation.cpp
    src/detect_language.cpp
    src/abi_util.cpp
    src/m2m_engine.cpp
)

target_include_directories(trilingua
    PUBLIC $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src
)
# Third-party headers are SYSTEM includes: warnings-as-errors applies to our
# code only, never to fetched dependencies.
target_include_directories(trilingua SYSTEM PRIVATE
    ${ctranslate2_SOURCE_DIR}/include
    ${sentencepiece_SOURCE_DIR}/src
    ${sentencepiece_BINARY_DIR}/src
)
set_target_properties(ctranslate2 PROPERTIES SYSTEM TRUE)

target_link_libraries(trilingua PRIVATE ctranslate2 sentencepiece-static)

# Export only the MB_API functions; keeps runtime symbols private so consumers
# can link their own (static) runtime without conflicts.
target_compile_definitions(trilingua PRIVATE MB_BUILD_DLL)
set_target_properties(trilingua PROPERTIES
    CXX_VISIBILITY_PRESET hidden
    VISIBILITY_INLINES_HIDDEN ON
)

# Warnings are defects (AGENTS.md §7) — applied to our sources only, not to the
# fetched third-party targets.
if(MSVC)
    target_compile_options(trilingua PRIVATE /W4 /WX /utf-8)
else()
    target_compile_options(trilingua PRIVATE -Wall -Wextra -Wpedantic -Werror)
endif()

# MinGW: embed the GCC runtime so consumers (tests, .NET P/Invoke) need no
# compiler DLLs on PATH.
if(MINGW)
    target_link_options(trilingua PRIVATE -static)
endif()

if(TRILINGUA_BUILD_TESTS)
    enable_testing()
    add_subdirectory(tests)
endif()

if(TRILINGUA_BUILD_BENCHMARKS)
    add_subdirectory(benchmarks)
endif()
