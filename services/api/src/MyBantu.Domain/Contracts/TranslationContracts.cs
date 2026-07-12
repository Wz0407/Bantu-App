namespace MyBantu.Domain.Contracts;

/// <summary>
/// Placeholder translation request (Phase 1 implements behavior).
/// SourceLanguage may be "auto"; TargetLanguage must be a supported language.
/// </summary>
public sealed record TranslationRequest(
    string Text,
    string SourceLanguage,
    string TargetLanguage,
    string? GlossaryId = null);

/// <summary>
/// Placeholder translation response. Until Phase 1 the engine is NotConfigured and
/// endpoints return an ErrorResponse with NATIVE_ENGINE_UNAVAILABLE instead of this shape.
/// Fake translations are never returned.
/// </summary>
public sealed record TranslationResponse(
    string OriginalText,
    string TranslatedText,
    string DetectedSourceLanguage,
    string TargetLanguage,
    string ModelVersion,
    double ProcessingTimeMs,
    IReadOnlyList<string> Warnings,
    IReadOnlyList<string>? GlossaryTermsApplied = null);
