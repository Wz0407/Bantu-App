using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
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
    private static readonly JsonSerializerOptions Json = JsonSerializerOptions.Web;

    public async Task<AppResult<HealthStatus>> GetHealthAsync(CancellationToken cancellationToken)
    {
        try
        {
            var health = await httpClient.GetFromJsonAsync<HealthStatus>(
                "/internal/v1/health", cancellationToken);
            return health is null
                ? Unreachable<HealthStatus>("Document AI returned an empty health response.")
                : AppResult<HealthStatus>.Success(health);
        }
        catch (Exception ex) when (IsTransportError(ex))
        {
            return Unreachable<HealthStatus>("Document AI service is not reachable or returned an invalid response.");
        }
    }

    public async Task<AppResult<DocumentAiIngestionResult>> IngestAsync(
        DocumentAiIngestionRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var response = await httpClient.PostAsJsonAsync(
                "/internal/v1/documents/ingest", request, Json, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return AppResult<DocumentAiIngestionResult>.Failure(
                    await ReadErrorAsync(response, cancellationToken));
            }
            var result = await response.Content.ReadFromJsonAsync<DocumentAiIngestionResult>(Json, cancellationToken);
            return result is null
                ? Unreachable<DocumentAiIngestionResult>("Document AI returned an empty ingestion response.")
                : AppResult<DocumentAiIngestionResult>.Success(result);
        }
        catch (Exception ex) when (IsTransportError(ex))
        {
            return Unreachable<DocumentAiIngestionResult>(
                "The local Document AI service is not running, so the document could not be processed. Start the local services and retry.");
        }
    }

    public async Task<AppResult<DocumentAiExtraction>> GetExtractionAsync(
        string documentId,
        CancellationToken cancellationToken)
    {
        try
        {
            var response = await httpClient.GetAsync(
                $"/internal/v1/documents/{Uri.EscapeDataString(documentId)}/extraction", cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return AppResult<DocumentAiExtraction>.Failure(await ReadErrorAsync(response, cancellationToken));
            }
            var extraction = await response.Content.ReadFromJsonAsync<DocumentAiExtraction>(Json, cancellationToken);
            return extraction is null
                ? Unreachable<DocumentAiExtraction>("Document AI returned an empty extraction response.")
                : AppResult<DocumentAiExtraction>.Success(extraction);
        }
        catch (Exception ex) when (IsTransportError(ex))
        {
            return Unreachable<DocumentAiExtraction>("The local Document AI service is not running.");
        }
    }

    public async Task<AppResult<bool>> DeleteIndexAsync(string documentId, CancellationToken cancellationToken)
    {
        try
        {
            var response = await httpClient.DeleteAsync(
                $"/internal/v1/documents/{Uri.EscapeDataString(documentId)}/index", cancellationToken);
            if (response.StatusCode is HttpStatusCode.OK or HttpStatusCode.NotFound)
            {
                return AppResult<bool>.Success(true); // idempotent delete
            }
            return AppResult<bool>.Failure(await ReadErrorAsync(response, cancellationToken));
        }
        catch (Exception ex) when (IsTransportError(ex))
        {
            return Unreachable<bool>("The local Document AI service is not running, so derived data could not be removed.");
        }
    }

    private static bool IsTransportError(Exception ex)
        => ex is HttpRequestException or TaskCanceledException or JsonException;

    private static AppResult<T> Unreachable<T>(string message)
        => AppResult<T>.Failure(new ErrorResponse(ErrorCodes.InternalError, message, Retryable: true));

    private static async Task<ErrorResponse> ReadErrorAsync(
        HttpResponseMessage response, CancellationToken cancellationToken)
    {
        try
        {
            var error = await response.Content.ReadFromJsonAsync<ErrorResponse>(Json, cancellationToken);
            if (error is not null)
            {
                return error;
            }
        }
        catch (JsonException)
        {
            // fall through to the generic envelope
        }
        return new ErrorResponse(
            ErrorCodes.InternalError,
            $"Document AI returned HTTP {(int)response.StatusCode} without a readable error body.",
            Retryable: true);
    }
}
