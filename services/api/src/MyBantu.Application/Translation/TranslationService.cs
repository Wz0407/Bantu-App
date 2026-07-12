using MyBantu.Application.Abstractions;
using MyBantu.Domain.Contracts;

namespace MyBantu.Application.Translation;

/// <summary>Application-level translation limits (bound from configuration).</summary>
public sealed record TranslationSettings(int MaxInputChars = 5000);

/// <summary>
/// Validates and orchestrates translation requests. Controllers stay thin; every
/// rule lives here where it is unit-testable. No provider-specific logic — the
/// engine is reached only through <see cref="ITranslationEngine"/>.
/// </summary>
public sealed class TranslationService(ITranslationEngine engine, TranslationSettings settings)
{
    public async Task<AppResult<TranslationResponse>> TranslateAsync(
        TranslationRequest request,
        CancellationToken cancellationToken)
    {
        var validation = Validate(request);
        if (validation is not null)
        {
            return AppResult<TranslationResponse>.Failure(validation);
        }

        var result = await engine.TranslateAsync(request, cancellationToken);
        if (!result.Ok || result.Value is null)
        {
            return result;
        }

        // Glossary boundary (ADR-008): the contract carries glossaryId, but
        // enforcement is a later phase — say so instead of silently ignoring it.
        if (!string.IsNullOrEmpty(request.GlossaryId))
        {
            var warnings = result.Value.Warnings
                .Append("Glossary support is not available yet; the requested glossary was not applied.")
                .ToList();
            return AppResult<TranslationResponse>.Success(result.Value with
            {
                Warnings = warnings,
                GlossaryTermsApplied = [],
            });
        }
        return result;
    }

    private ErrorResponse? Validate(TranslationRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Text))
        {
            return new ErrorResponse(
                ErrorCodes.ValidationFailed,
                "Enter some text to translate.",
                Retryable: false);
        }
        if (request.Text.Length > settings.MaxInputChars)
        {
            return new ErrorResponse(
                ErrorCodes.ValidationFailed,
                $"The text is too long ({request.Text.Length} characters). The limit is {settings.MaxInputChars} characters. Split it into smaller parts.",
                Retryable: false);
        }
        if (!LanguageCodes.IsSource(request.SourceLanguage))
        {
            return new ErrorResponse(
                ErrorCodes.UnsupportedLanguage,
                $"Source language '{request.SourceLanguage}' is not supported. Use en, ms, zh or auto.",
                Retryable: false);
        }
        if (!LanguageCodes.IsSupported(request.TargetLanguage))
        {
            return new ErrorResponse(
                ErrorCodes.UnsupportedLanguage,
                $"Target language '{request.TargetLanguage}' is not supported. Use en, ms or zh.",
                Retryable: false);
        }
        if (request.SourceLanguage == request.TargetLanguage)
        {
            return new ErrorResponse(
                ErrorCodes.ValidationFailed,
                "Source and target language are the same. Choose a different target language.",
                Retryable: false);
        }
        return null;
    }
}
