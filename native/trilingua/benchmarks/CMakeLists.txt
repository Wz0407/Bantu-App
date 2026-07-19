add_executable(trilingua_benchmarks translation_benchmark.cpp)
target_link_libraries(trilingua_benchmarks PRIVATE trilingua)

if(MSVC)
    target_compile_options(trilingua_benchmarks PRIVATE /W4 /WX /utf-8)
else()
    target_compile_options(trilingua_benchmarks PRIVATE -Wall -Wextra -Wpedantic -Werror)
endif()

if(MINGW)
    target_link_options(trilingua_benchmarks PRIVATE -static)
endif()
