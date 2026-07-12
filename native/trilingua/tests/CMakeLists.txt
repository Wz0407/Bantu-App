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

# validation.cpp is compiled into the tests directly because its internal
# helpers are intentionally not exported from the shared library.
add_executable(trilingua_tests
    abi_tests.cpp
    utf8_tests.cpp
    ../src/validation.cpp
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
gtest_discover_tests(trilingua_tests)
