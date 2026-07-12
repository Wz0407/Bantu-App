using MyBantu.Domain.Contracts;

namespace MyBantu.Application.Abstractions;

/// <summary>
/// Adapter boundary for the TriLingua native translation engine.
/// Phase 1 implements this over the C ABI via P/Invoke; in Phase 0 the only
/// implementation reports NotConfigured and never returns fake translations.
/// </summary>
public interface ITranslationEngine
{
    /// <summary>Honest availability of the native engine and its model.</summary>
    ServiceAvailability Availability();

    /// <summary>Native engine version string, or null when unavailable.</summary>
    string? EngineVersion();

    Task<AppResult<TranslationResponse>> TranslateAsync(
        TranslationRequest request,
        CancellationToken cancellationToken);
}
