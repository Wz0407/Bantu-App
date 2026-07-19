using MyBantu.Domain.Contracts;

namespace MyBantu.Application.Abstractions;

/// <summary>
/// Typed internal HTTP client boundary for the Document AI service (/internal/v1).
/// Only the ASP.NET Core API may talk to Document AI; the browser never does.
/// </summary>
public interface IDocumentAiClient
{
    Task<AppResult<HealthStatus>> GetHealthAsync(CancellationToken cancellationToken);

    Task<AppResult<DocumentAiIngestionResult>> IngestAsync(
        DocumentAiIngestionRequest request,
        CancellationToken cancellationToken);

    Task<AppResult<DocumentAiExtraction>> GetExtractionAsync(
        string documentId,
        CancellationToken cancellationToken);

    /// <summary>Deletes every derived artifact for the document. Idempotent.</summary>
    Task<AppResult<bool>> DeleteIndexAsync(string documentId, CancellationToken cancellationToken);
}

public sealed record DocumentAiIngestionRequest(
    string DocumentId,
    string StoredFilePath,
    string MimeType,
    string? LanguageHint);

public sealed record DocumentAiIngestionResult(
    string DocumentId,
    DocumentProcessingStatus Status,
    int? PageCount,
    int ChunkCount,
    string DetectedLanguage,
    double DetectionConfidence,
    IReadOnlyList<string> Warnings);

public sealed record DocumentAiPage(
    int PageNumber,
    string Text,
    string ExtractionMethod,
    double? OcrConfidence);

public sealed record DocumentAiExtraction(
    string DocumentId,
    int PageCount,
    string DetectedLanguage,
    IReadOnlyList<string> Warnings,
    IReadOnlyList<DocumentAiPage> Pages);
