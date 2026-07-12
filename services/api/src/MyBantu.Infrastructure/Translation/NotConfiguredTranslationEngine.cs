using MyBantu.Application;
using MyBantu.Application.Abstractions;
using MyBantu.Domain.Contracts;

namespace MyBantu.Infrastructure.Translation;

/// <summary>
/// Phase 0 placeholder for the TriLingua native adapter. It reports NotConfigured
/// and fails every translation with NATIVE_ENGINE_UNAVAILABLE. It never returns
/// fake translated text. Phase 1 replaces this with a P/Invoke adapter over the C ABI.
/// </summary>
public sealed class NotConfiguredTranslationEngine : ITranslationEngine
{
    public ServiceAvailability Availability() => ServiceAvailability.NotConfigured;

    public string? EngineVersion() => null;

    public Task<AppResult<TranslationResponse>> TranslateAsync(
        TranslationRequest request,
        CancellationToken cancellationToken)
    {
        var error = new ErrorResponse(
            ErrorCodes.NativeEngineUnavailable,
            "The local translation engine is not configured. No data was changed. "
            + "Install the translation model (Phase 1 setup) and retry.",
            Retryable: false);
        return Task.FromResult(AppResult<TranslationResponse>.Failure(error));
    }
}
