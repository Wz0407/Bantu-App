namespace MyBantu.Domain.Contracts;

/// <summary>Stable, machine-readable error codes (AGENTS.md §15).</summary>
public static class ErrorCodes
{
    public const string ModelNotInstalled = "MODEL_NOT_INSTALLED";
    public const string ModelLoadFailed = "MODEL_LOAD_FAILED";
    public const string UnsupportedLanguage = "UNSUPPORTED_LANGUAGE";
    public const string UnsupportedFileType = "UNSUPPORTED_FILE_TYPE";
    public const string FileTooLarge = "FILE_TOO_LARGE";
    public const string DocumentParseFailed = "DOCUMENT_PARSE_FAILED";
    public const string OcrFailed = "OCR_FAILED";
    public const string IndexBuildFailed = "INDEX_BUILD_FAILED";
    public const string InsufficientEvidence = "INSUFFICIENT_EVIDENCE";
    public const string NativeEngineUnavailable = "NATIVE_ENGINE_UNAVAILABLE";
    public const string LocalLlmUnavailable = "LOCAL_LLM_UNAVAILABLE";
    public const string ValidationFailed = "VALIDATION_FAILED";
    public const string NotFound = "NOT_FOUND";
    public const string InternalError = "INTERNAL_ERROR";
}
