/*
 * TriLingua native translation engine — stable C ABI.
 *
 * Rules (ARCHITECTURE.md §11):
 *  - All strings are UTF-8.
 *  - No C++ exception may cross this boundary; every call returns a status code.
 *  - Memory ownership: strings inside mb_translation_result are allocated by the
 *    library and must be released with mb_free_translation_result. Callers never
 *    free them directly. Request strings are owned by the caller.
 *  - Model-specific inference stays behind the internal engine interface; this
 *    header exposes no model details.
 */

#ifndef MYBANTU_TRILINGUA_H
#define MYBANTU_TRILINGUA_H

/* Export only the ABI functions from the shared library. */
#if defined(_WIN32)
#  if defined(MB_BUILD_DLL)
#    define MB_API __declspec(dllexport)
#  else
#    define MB_API __declspec(dllimport)
#  endif
#else
#  define MB_API __attribute__((visibility("default")))
#endif

#ifdef __cplusplus
extern "C" {
#endif

/* Explicit status codes; 0 means success. */
typedef enum mb_status {
    MB_STATUS_OK = 0,
    MB_STATUS_INVALID_ARGUMENT = 1,
    MB_STATUS_INVALID_UTF8 = 2,
    MB_STATUS_UNSUPPORTED_LANGUAGE = 3,
    MB_STATUS_NOT_INITIALIZED = 4,
    MB_STATUS_ENGINE_NOT_CONFIGURED = 5, /* no model installed; never fake output */
    MB_STATUS_MODEL_LOAD_FAILED = 6,
    MB_STATUS_INTERNAL_ERROR = 7
} mb_status;

typedef struct mb_translation_request {
    const char* text;             /* UTF-8, caller-owned */
    const char* source_language;  /* "en" | "ms" | "zh" | "auto" */
    const char* target_language;  /* "en" | "ms" | "zh" */
} mb_translation_request;

typedef struct mb_translation_result {
    int status_code;         /* mb_status value */
    char* translated_text;   /* library-owned; NULL on failure */
    char* detected_language; /* library-owned; NULL on failure */
    double elapsed_ms;
    char* model_version;     /* library-owned; NULL when no model is loaded */
    char* error_message;     /* library-owned; NULL on success */
} mb_translation_result;

/*
 * Initialize the engine. model_directory may be NULL or empty; the engine then
 * stays in the NOT_CONFIGURED state (health still works, translation fails
 * explicitly). Returns MB_STATUS_OK or MB_STATUS_ENGINE_NOT_CONFIGURED.
 */
MB_API int mb_initialize(const char* model_directory);

/* Translate. Never throws; always returns a result with an explicit status. */
MB_API mb_translation_result mb_translate(const mb_translation_request* request);

/* Release all library-allocated strings inside the result. Safe on NULL fields
 * and safe to call more than once. */
MB_API void mb_free_translation_result(mb_translation_result* result);

/* Release engine resources. Safe to call without initialization. */
MB_API void mb_shutdown(void);

/* Static library version string; always valid, never freed by the caller. */
MB_API const char* mb_get_version(void);

/*
 * Health/availability probe:
 * MB_STATUS_OK when a model is loaded and ready,
 * MB_STATUS_ENGINE_NOT_CONFIGURED when no model is configured,
 * MB_STATUS_NOT_INITIALIZED before mb_initialize.
 */
MB_API int mb_health_check(void);

#ifdef __cplusplus
}
#endif

#endif /* MYBANTU_TRILINGUA_H */
