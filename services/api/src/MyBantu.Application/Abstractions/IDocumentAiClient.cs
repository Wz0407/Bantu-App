using MyBantu.Domain.Contracts;

namespace MyBantu.Application.Abstractions;

/// <summary>
/// Typed internal HTTP client boundary for the Document AI service (/internal/v1).
/// Only the ASP.NET Core API may talk to Document AI; the browser never does.
/// Phase 0 exposes health only; ingestion/analysis/answer methods arrive in Phases 2–3.
/// </summary>
public interface IDocumentAiClient
{
    /// <summary>
    /// Fetches the Document AI service health. Returns a failure result
    /// (never throws) when the service is unreachable.
    /// </summary>
    Task<AppResult<HealthStatus>> GetHealthAsync(CancellationToken cancellationToken);
}
