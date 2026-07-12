using System.Net.Http.Json;
using MyBantu.Application;
using MyBantu.Application.Abstractions;
using MyBantu.Domain.Contracts;

namespace MyBantu.Infrastructure.DocumentAi;

/// <summary>
/// Typed HTTP client for the internal Document AI service (/internal/v1).
/// Network failures become explicit AppResult failures, never unhandled exceptions.
/// </summary>
public sealed class DocumentAiHttpClient(HttpClient httpClient) : IDocumentAiClient
{
    public async Task<AppResult<HealthStatus>> GetHealthAsync(CancellationToken cancellationToken)
    {
        try
        {
            var health = await httpClient.GetFromJsonAsync<HealthStatus>(
                "/internal/v1/health", cancellationToken);
            if (health is null)
            {
                return Failure("Document AI returned an empty health response.");
            }
            return AppResult<HealthStatus>.Success(health);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or System.Text.Json.JsonException)
        {
            return Failure("Document AI service is not reachable or returned an invalid response.");
        }
    }

    private static AppResult<HealthStatus> Failure(string message) =>
        AppResult<HealthStatus>.Failure(new ErrorResponse(
            ErrorCodes.InternalError, message, Retryable: true));
}
