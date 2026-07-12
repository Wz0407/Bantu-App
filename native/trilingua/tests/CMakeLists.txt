include(FetchContent)

# GoogleTest per the project testing table (ARCHITECTURE.md §5).
FetchContent_Declare(
    googletest
    URL https://github.com/google/googletest/archive/refs/tags/v1.15.2.zip
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE
)
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
set(INSTALL_GTEST OFF CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(googletest)

# Internal helpers (validation, detection, allocation) are compiled into the
# tests directly because they are intentionally not exported from the DLL.
add_executable(trilingua_tests
    abi_tests.cpp
    utf8_tests.cpp
    detection_tests.cpp
    model_tests.cpp
    ../src/validation.cpp
    ../src/detect_language.cpp
    ../src/abi_util.cpp
)

target_link_libraries(trilingua_tests PRIVATE trilingua gtest_main)
target_include_directories(trilingua_tests PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../src)

if(MSVC)
    target_compile_options(trilingua_tests PRIVATE /W4 /WX /utf-8)
else()
    target_compile_options(trilingua_tests PRIVATE -Wall -Wextra -Wpedantic -Werror)
endif()

if(MINGW)
    target_link_options(trilingua_tests PRIVATE -static)
endif()

include(GoogleTest)
# No ENVIRONMENT property: CTest inherits the ambient environment, so
# `TRILINGUA_TEST_MODEL_DIR=... ctest` reaches the model tests at run time.
# (Baking $ENV{...} here would freeze the value at configure time — usually empty —
# and override the runtime variable with an empty string, forcing a permanent skip.)
gtest_discover_tests(trilingua_tests)
