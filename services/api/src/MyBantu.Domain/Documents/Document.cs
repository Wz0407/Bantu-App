using MyBantu.Domain.Contracts;

namespace MyBantu.Domain.Documents;

/// <summary>
/// Local document metadata (ARCHITECTURE.md §12). The original file lives in
/// local storage under a generated name; the user-supplied filename is kept only
/// as a sanitized display value and is never used as a filesystem path.
/// </summary>
public sealed class Document
{
    public required string Id { get; init; }

    /// <summary>Sanitized display name (never a path).</summary>
    public required string OriginalFileName { get; set; }

    /// <summary>Generated storage filename inside the local documents directory.</summary>
    public required string StoredFileName { get; init; }

    public required string MimeType { get; init; }

    public required string Sha256 { get; init; }

    public required long SizeBytes { get; init; }

    public DocumentProcessingStatus Status { get; set; } = DocumentProcessingStatus.Uploaded;

    public string? DetectedLanguage { get; set; }

    public int? PageCount { get; set; }

    public int? ChunkCount { get; set; }

    public required DateTimeOffset CreatedAtUtc { get; init; }

    public DateTimeOffset? IndexedAtUtc { get; set; }

    public string? ErrorCode { get; set; }

    public string? ErrorMessage { get; set; }

    /// <summary>Ingestion warnings, newline-separated (no document content).</summary>
    public string? Warnings { get; set; }
}
