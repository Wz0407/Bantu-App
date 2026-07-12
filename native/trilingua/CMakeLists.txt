cmake_minimum_required(VERSION 3.20)
project(trilingua VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(TRILINGUA_BUILD_TESTS "Build TriLingua tests" ON)
option(TRILINGUA_BUILD_BENCHMARKS "Build TriLingua benchmarks" ON)

# Co-locate the DLL/EXE outputs so tests find the library on Windows.
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)

add_library(trilingua SHARED
    src/trilingua.cpp
    src/validation.cpp
)

target_include_directories(trilingua
    PUBLIC $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src
)

# Export only the MB_API functions; keeps runtime symbols private so consumers
# can link their own (static) runtime without conflicts.
target_compile_definitions(trilingua PRIVATE MB_BUILD_DLL)
set_target_properties(trilingua PROPERTIES
    CXX_VISIBILITY_PRESET hidden
    VISIBILITY_INLINES_HIDDEN ON
)

# Warnings are defects (AGENTS.md §7).
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
