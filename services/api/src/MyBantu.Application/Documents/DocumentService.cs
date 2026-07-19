using System.Security.Cryptography;
using MyBantu.Application.Abstractions;
using MyBantu.Domain.Contracts;
using MyBantu.Domain.Documents;

namespace MyBantu.Application.Documents;

/// <summary>Application-level upload limits (bound from configuration).</summary>
public sealed record DocumentSettings(long MaxUploadBytes = 20 * 1024 * 1024);

/// <summary>Public shape of a document; persistence entities never leave the API directly.</summary>
public sealed record DocumentDto(
    string DocumentId,
    string FileName,
    string MimeType,
    long SizeBytes,
    DocumentProcessingStatus Status,
    string? DetectedLanguage,
    int? PageCount,
    int? ChunkCount,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset? IndexedAtUtc,
    string? ErrorCode,
    string? ErrorMessage,
    IReadOnlyList<string> Warnings);

/// <summary>
/// Owns upload validation (extension, MIME, signature, size), secure storage,
/// duplicate detection, ingestion orchestration, retry, and deletion of the
/// original plus all derived artifacts (FR-04). Controllers stay thin.
/// </summary>
public sealed class DocumentService(
    IDocumentRepository repository,
    IDocumentFileStore fileStore,
    IDocumentAiClient documentAi,
    DocumentSettings settings,
    TimeProvider timeProvider)
{
    private static readonly Dictionary<string, string> ExtensionToMime = new(StringComparer.OrdinalIgnoreCase)
    {
        [".pdf"] = "application/pdf",
        [".png"] = "image/png",
        [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg",
        [".txt"] = "text/plain",
    };

    public async Task<AppResult<DocumentDto>> UploadAsync(
        string originalFileName,
        string contentType,
        Stream content,
        long declaredLength,
        string? languageHint,
        CancellationToken cancellationToken)
    {
        var extension = Path.GetExtension(originalFileName ?? string.Empty);
        if (string.IsNullOrEmpty(extension) || !ExtensionToMime.TryGetValue(extension, out var expectedMime))
        {
            return Fail(ErrorCodes.UnsupportedFileType,
                "Only PDF, PNG, JPG/JPEG and TXT files are supported.");
        }
        if (!string.Equals(contentType, expectedMime, StringComparison.OrdinalIgnoreCase))
        {
            return Fail(ErrorCodes.UnsupportedFileType,
                $"The file extension '{extension}' does not match the declared content type '{contentType}'.");
        }
        if (declaredLength <= 0)
        {
            return Fail(ErrorCodes.ValidationFailed, "The uploaded file is empty.");
        }
        if (declaredLength > settings.MaxUploadBytes)
        {
            return Fail(ErrorCodes.FileTooLarge,
                $"The file is larger than the {settings.MaxUploadBytes / (1024 * 1024)} MB upload limit.");
        }
        if (languageHint is not null && languageHint != LanguageCodes.Auto && !LanguageCodes.IsSupported(languageHint))
        {
            return Fail(ErrorCodes.UnsupportedLanguage, "The language hint must be en, ms, zh or auto.");
        }

        // File-signature (magic bytes) validation before anything is stored.
        var header = new byte[8];
        var headerLength = await ReadHeaderAsync(content, header, cancellationToken);
        if (!SignatureMatches(expectedMime, header, headerLength))
        {
            return Fail(ErrorCodes.UnsupportedFileType,
                "The file content does not match its declared type. The file was not stored.");
        }

        var documentId = $"doc-{Guid.NewGuid():N}";
        var storedFileName = documentId + extension.ToLowerInvariant();
        StoredFile stored;
        await using (var prefixed = new PrefixedStream(header, headerLength, content))
        {
            stored = await fileStore.SaveAsync(storedFileName, prefixed, cancellationToken);
        }

        if (stored.SizeBytes > settings.MaxUploadBytes)
        {
            fileStore.Delete(storedFileName);
            return Fail(ErrorCodes.FileTooLarge,
                $"The file is larger than the {settings.MaxUploadBytes / (1024 * 1024)} MB upload limit. It was not stored.");
        }

        var duplicate = await repository.FindBySha256Async(stored.Sha256, cancellationToken);
        if (duplicate is not null)
        {
            fileStore.Delete(storedFileName);
            return AppResult<DocumentDto>.Failure(new ErrorResponse(
                ErrorCodes.ValidationFailed,
                $"This file was already uploaded as '{duplicate.OriginalFileName}'. Open that document instead.",
                Retryable: false,
                Details: new Dictionary<string, object>
                {
                    ["reason"] = "duplicate",
                    ["existingDocumentId"] = duplicate.Id,
                }));
        }

        var document = new Document
        {
            Id = documentId,
            OriginalFileName = SanitizeDisplayName(originalFileName!),
            StoredFileName = storedFileName,
            MimeType = expectedMime,
            Sha256 = stored.Sha256,
            SizeBytes = stored.SizeBytes,
            Status = DocumentProcessingStatus.Uploaded,
            CreatedAtUtc = timeProvider.GetUtcNow(),
        };
        await repository.AddAsync(document, cancellationToken);

        await ProcessAsync(document, languageHint, cancellationToken);
        return AppResult<DocumentDto>.Success(ToDto(document));
    }

    /// <summary>Retryable ingestion (NFR-04): safe to call again after a failure.</summary>
    public async Task<AppResult<DocumentDto>> ReprocessAsync(
        string documentId,
        string? languageHint,
        CancellationToken cancellationToken)
    {
        var document = await repository.GetAsync(documentId, cancellationToken);
        if (document is null)
        {
            return Fail(ErrorCodes.NotFound, "The document does not exist.");
        }
        await ProcessAsync(document, languageHint, cancellationToken);
        return AppResult<DocumentDto>.Success(ToDto(document));
    }

    public async Task<AppResult<DocumentDto>> GetAsync(string documentId, CancellationToken cancellationToken)
    {
        var document = await repository.GetAsync(documentId, cancellationToken);
        return document is null
            ? Fail(ErrorCodes.NotFound, "The document does not exist.")
            : AppResult<DocumentDto>.Success(ToDto(document));
    }

    public async Task<IReadOnlyList<DocumentDto>> ListAsync(CancellationToken cancellationToken)
        => [.. (await repository.ListAsync(cancellationToken)).Select(ToDto)];

    public async Task<AppResult<DocumentAiExtraction>> GetPagesAsync(
        string documentId,
        CancellationToken cancellationToken)
    {
        var document = await repository.GetAsync(documentId, cancellationToken);
        if (document is null)
        {
            return AppResult<DocumentAiExtraction>.Failure(new ErrorResponse(
                ErrorCodes.NotFound, "The document does not exist.", Retryable: false));
        }
        if (document.Status != DocumentProcessingStatus.Ready)
        {
            return AppResult<DocumentAiExtraction>.Failure(new ErrorResponse(
                ErrorCodes.ValidationFailed,
                "The document has not been processed successfully yet.", Retryable: true));
        }
        return await documentAi.GetExtractionAsync(documentId, cancellationToken);
    }

    /// <summary>Deletes metadata, the original file, and all derived artifacts (FR-04, Gate F).</summary>
    public async Task<AppResult<bool>> DeleteAsync(string documentId, CancellationToken cancellationToken)
    {
        var document = await repository.GetAsync(documentId, cancellationToken);
        if (document is null)
        {
            return AppResult<bool>.Failure(new ErrorResponse(
                ErrorCodes.NotFound, "The document does not exist.", Retryable: false));
        }
        var derived = await documentAi.DeleteIndexAsync(documentId, cancellationToken);
        if (!derived.Ok)
        {
            return AppResult<bool>.Failure(new ErrorResponse(
                ErrorCodes.InternalError,
                "Derived data could not be removed; the document was NOT deleted. Retry when the local Document AI service is running.",
                Retryable: true));
        }
        fileStore.Delete(document.StoredFileName);
        await repository.DeleteAsync(documentId, cancellationToken);
        return AppResult<bool>.Success(true);
    }

    private async Task ProcessAsync(Document document, string? languageHint, CancellationToken cancellationToken)
    {
        document.Status = DocumentProcessingStatus.Processing;
        document.ErrorCode = null;
        document.ErrorMessage = null;
        await repository.UpdateAsync(document, cancellationToken);

        var result = await documentAi.IngestAsync(
            new DocumentAiIngestionRequest(
                document.Id,
                fileStore.GetAbsolutePath(document.StoredFileName),
                document.MimeType,
                languageHint),
            cancellationToken);

        if (result.Ok && result.Value is not null)
        {
            document.Status = DocumentProcessingStatus.Ready;
            document.PageCount = result.Value.PageCount;
            document.ChunkCount = result.Value.ChunkCount;
            document.DetectedLanguage = result.Value.DetectedLanguage;
            document.IndexedAtUtc = timeProvider.GetUtcNow();
            document.Warnings = result.Value.Warnings.Count > 0
                ? string.Join("\n", result.Value.Warnings)
                : null;
        }
        else
        {
            document.Status = DocumentProcessingStatus.Failed;
            document.ErrorCode = result.Error?.Code ?? ErrorCodes.InternalError;
            document.ErrorMessage = result.Error?.Message ?? "Document processing failed.";
        }
        await repository.UpdateAsync(document, cancellationToken);
    }

    private static AppResult<DocumentDto> Fail(string code, string message)
        => AppResult<DocumentDto>.Failure(new ErrorResponse(code, message,
            Retryable: code is ErrorCodes.InternalError));

    private static DocumentDto ToDto(Document document) => new(
        document.Id,
        document.OriginalFileName,
        document.MimeType,
        document.SizeBytes,
        document.Status,
        document.DetectedLanguage,
        document.PageCount,
        document.ChunkCount,
        document.CreatedAtUtc,
        document.IndexedAtUtc,
        document.ErrorCode,
        document.ErrorMessage,
        document.Warnings is null ? [] : document.Warnings.Split('\n'));

    /// <summary>Display-name sanitation: strip path segments and control characters.</summary>
    internal static string SanitizeDisplayName(string fileName)
    {
        var name = Path.GetFileName(fileName.Replace('\\', '/'));
        var cleaned = new string([.. name.Where(c => !char.IsControl(c))]).Trim();
        return cleaned.Length is > 0 and <= 200 ? cleaned : "document";
    }

    private static async Task<int> ReadHeaderAsync(Stream content, byte[] header, CancellationToken ct)
    {
        var total = 0;
        while (total < header.Length)
        {
            var read = await content.ReadAsync(header.AsMemory(total, header.Length - total), ct);
            if (read == 0) break;
            total += read;
        }
        return total;
    }

    internal static bool SignatureMatches(string mimeType, byte[] header, int length)
    {
        return mimeType switch
        {
            "application/pdf" => length >= 5 && header[0] == '%' && header[1] == 'P' && header[2] == 'D' && header[3] == 'F' && header[4] == '-',
            "image/png" => length >= 8 && header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47
                           && header[4] == 0x0D && header[5] == 0x0A && header[6] == 0x1A && header[7] == 0x0A,
            "image/jpeg" => length >= 3 && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF,
            // TXT has no signature; reject leading NUL bytes (binary masquerading as text).
            "text/plain" => length > 0 && header.Take(length).All(b => b != 0x00),
            _ => false,
        };
    }

    /// <summary>Replays the sniffed header bytes ahead of the remaining stream.</summary>
    private sealed class PrefixedStream(byte[] header, int headerLength, Stream rest) : Stream
    {
        private int _position;

        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position
        {
            get => throw new NotSupportedException();
            set => throw new NotSupportedException();
        }

        public override int Read(byte[] buffer, int offset, int count)
        {
            if (_position < headerLength)
            {
                var toCopy = Math.Min(count, headerLength - _position);
                Array.Copy(header, _position, buffer, offset, toCopy);
                _position += toCopy;
                return toCopy;
            }
            return rest.Read(buffer, offset, count);
        }

        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            if (_position < headerLength)
            {
                var toCopy = Math.Min(buffer.Length, headerLength - _position);
                header.AsMemory(_position, toCopy).CopyTo(buffer);
                _position += toCopy;
                return toCopy;
            }
            return await rest.ReadAsync(buffer, cancellationToken);
        }

        public override void Flush() { }
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }

    /// <summary>Streaming SHA-256 helper for the file store implementations.</summary>
    public static async Task<(string Sha256, long Size)> HashToFileAsync(
        Stream source, string targetPath, CancellationToken cancellationToken)
    {
        await using var target = File.Create(targetPath);
        using var sha = SHA256.Create();
        var buffer = new byte[81920];
        long total = 0;
        int read;
        while ((read = await source.ReadAsync(buffer, cancellationToken)) > 0)
        {
            sha.TransformBlock(buffer, 0, read, null, 0);
            await target.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
            total += read;
        }
        sha.TransformFinalBlock([], 0, 0);
        return (Convert.ToHexString(sha.Hash!).ToLowerInvariant(), total);
    }
}
