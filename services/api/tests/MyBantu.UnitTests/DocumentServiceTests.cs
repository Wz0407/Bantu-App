using System.Text;
using MyBantu.Application;
using MyBantu.Application.Abstractions;
using MyBantu.Application.Documents;
using MyBantu.Domain.Contracts;
using MyBantu.Domain.Documents;

namespace MyBantu.UnitTests;

public class DocumentServiceTests
{
    private sealed class InMemoryRepository : IDocumentRepository
    {
        public readonly Dictionary<string, Document> Items = [];
        public Task AddAsync(Document d, CancellationToken ct) { Items[d.Id] = d; return Task.CompletedTask; }
        public Task<Document?> GetAsync(string id, CancellationToken ct) => Task.FromResult(Items.GetValueOrDefault(id));
        public Task<IReadOnlyList<Document>> ListAsync(CancellationToken ct)
            => Task.FromResult<IReadOnlyList<Document>>([.. Items.Values]);
        public Task<Document?> FindBySha256Async(string sha, CancellationToken ct)
            => Task.FromResult(Items.Values.FirstOrDefault(d => d.Sha256 == sha));
        public Task UpdateAsync(Document d, CancellationToken ct) { Items[d.Id] = d; return Task.CompletedTask; }
        public Task DeleteAsync(string id, CancellationToken ct) { Items.Remove(id); return Task.CompletedTask; }
    }

    private sealed class TempFileStore : IDocumentFileStore, IDisposable
    {
        public readonly string Root = Directory.CreateTempSubdirectory("mybantu-docs-").FullName;
        public readonly List<string> Deleted = [];
        public async Task<StoredFile> SaveAsync(string name, Stream content, CancellationToken ct)
        {
            var path = Path.Combine(Root, name);
            var (sha, size) = await DocumentService.HashToFileAsync(content, path, ct);
            return new StoredFile(path, sha, size);
        }
        public string GetAbsolutePath(string name) => Path.Combine(Root, name);
        public void Delete(string name)
        {
            Deleted.Add(name);
            var path = Path.Combine(Root, name);
            if (File.Exists(path)) File.Delete(path);
        }
        public void Dispose() => Directory.Delete(Root, recursive: true);
    }

    private sealed class FakeDocumentAi : IDocumentAiClient
    {
        public AppResult<DocumentAiIngestionResult>? NextIngest;
        public bool DeleteIndexSucceeds = true;
        public readonly List<string> DeletedIndexes = [];

        public Task<AppResult<HealthStatus>> GetHealthAsync(CancellationToken ct)
            => throw new NotSupportedException();
        public Task<AppResult<DocumentAiIngestionResult>> IngestAsync(
            DocumentAiIngestionRequest request, CancellationToken ct)
            => Task.FromResult(NextIngest ?? AppResult<DocumentAiIngestionResult>.Success(
                new DocumentAiIngestionResult(request.DocumentId, DocumentProcessingStatus.Ready, 1, 2, "en", 0.9, [])));
        public Task<AppResult<DocumentAiExtraction>> GetExtractionAsync(string id, CancellationToken ct)
            => Task.FromResult(AppResult<DocumentAiExtraction>.Success(
                new DocumentAiExtraction(id, 1, "en", [], [new DocumentAiPage(1, "sample page text", "txt", null)])));
        public Task<AppResult<bool>> DeleteIndexAsync(string id, CancellationToken ct)
        {
            DeletedIndexes.Add(id);
            return Task.FromResult(DeleteIndexSucceeds
                ? AppResult<bool>.Success(true)
                : AppResult<bool>.Failure(new ErrorResponse(ErrorCodes.InternalError, "docai down", Retryable: true)));
        }
    }

    private static Stream Content(string text) => new MemoryStream(Encoding.UTF8.GetBytes(text));
    private static Stream PdfContent() => new MemoryStream(Encoding.ASCII.GetBytes("%PDF-1.4 fake body"));

    private static (DocumentService Service, InMemoryRepository Repo, TempFileStore Files, FakeDocumentAi DocAi) Create(
        long maxBytes = 1024 * 1024)
    {
        var repo = new InMemoryRepository();
        var files = new TempFileStore();
        var docai = new FakeDocumentAi();
        var service = new DocumentService(repo, files, docai, new DocumentSettings(maxBytes), TimeProvider.System);
        return (service, repo, files, docai);
    }

    [Fact]
    public async Task UploadsTxtAndBecomesReady()
    {
        var (service, repo, files, _) = Create();
        using (files)
        {
            var result = await service.UploadAsync(
                "bill.txt", "text/plain", Content("Sila bayar RM50"), 15, null, CancellationToken.None);
            Assert.True(result.Ok, result.Error?.Message);
            Assert.Equal(DocumentProcessingStatus.Ready, result.Value!.Status);
            Assert.Equal("en", result.Value.DetectedLanguage);
            Assert.Single(repo.Items);
            Assert.True(File.Exists(files.GetAbsolutePath(repo.Items.Values.Single().StoredFileName)));
        }
    }

    [Theory]
    [InlineData("evil.exe", "application/x-msdownload")]
    [InlineData("noextension", "text/plain")]
    public async Task RejectsUnsupportedExtensions(string name, string mime)
    {
        var (service, _, files, _) = Create();
        using (files)
        {
            var result = await service.UploadAsync(name, mime, Content("x"), 1, null, CancellationToken.None);
            Assert.False(result.Ok);
            Assert.Equal(ErrorCodes.UnsupportedFileType, result.Error!.Code);
        }
    }

    [Fact]
    public async Task RejectsExtensionMimeMismatch()
    {
        var (service, _, files, _) = Create();
        using (files)
        {
            var result = await service.UploadAsync(
                "letter.pdf", "text/plain", PdfContent(), 10, null, CancellationToken.None);
            Assert.False(result.Ok);
            Assert.Equal(ErrorCodes.UnsupportedFileType, result.Error!.Code);
        }
    }

    [Fact]
    public async Task RejectsSignatureMismatchWithoutStoring()
    {
        var (service, repo, files, _) = Create();
        using (files)
        {
            // .pdf extension + application/pdf MIME, but the bytes are not a PDF.
            var result = await service.UploadAsync(
                "fake.pdf", "application/pdf", Content("just text, no pdf header"), 24, null, CancellationToken.None);
            Assert.False(result.Ok);
            Assert.Equal(ErrorCodes.UnsupportedFileType, result.Error!.Code);
            Assert.Empty(repo.Items);
            Assert.Empty(Directory.EnumerateFiles(files.Root));
        }
    }

    [Fact]
    public async Task RejectsEmptyAndOversizedUploads()
    {
        var (service, _, files, _) = Create(maxBytes: 100);
        using (files)
        {
            var empty = await service.UploadAsync("a.txt", "text/plain", Content(""), 0, null, CancellationToken.None);
            Assert.Equal(ErrorCodes.ValidationFailed, empty.Error!.Code);

            var big = await service.UploadAsync(
                "b.txt", "text/plain", Content(new string('x', 500)), 500, null, CancellationToken.None);
            Assert.Equal(ErrorCodes.FileTooLarge, big.Error!.Code);
        }
    }

    [Fact]
    public async Task DetectsDuplicatesBySha256AndCleansUp()
    {
        var (service, _, files, _) = Create();
        using (files)
        {
            var first = await service.UploadAsync(
                "one.txt", "text/plain", Content("same bytes"), 10, null, CancellationToken.None);
            Assert.True(first.Ok);

            var second = await service.UploadAsync(
                "two.txt", "text/plain", Content("same bytes"), 10, null, CancellationToken.None);
            Assert.False(second.Ok);
            Assert.NotNull(second.Error!.Details);
            Assert.Equal(first.Value!.DocumentId, second.Error.Details!["existingDocumentId"].ToString());
            Assert.Single(Directory.EnumerateFiles(files.Root)); // duplicate upload removed
        }
    }

    [Fact]
    public async Task FailedIngestionIsRecordedAndRetryable()
    {
        var (service, repo, files, docai) = Create();
        using (files)
        {
            docai.NextIngest = AppResult<DocumentAiIngestionResult>.Failure(
                new ErrorResponse(ErrorCodes.OcrFailed, "ocr failed", Retryable: true));
            var uploaded = await service.UploadAsync(
                "scan.png", "image/png",
                new MemoryStream([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3]),
                11, "en", CancellationToken.None);
            Assert.True(uploaded.Ok);
            Assert.Equal(DocumentProcessingStatus.Failed, uploaded.Value!.Status);
            Assert.Equal(ErrorCodes.OcrFailed, uploaded.Value.ErrorCode);

            docai.NextIngest = null; // now succeeds
            var retried = await service.ReprocessAsync(uploaded.Value.DocumentId, "en", CancellationToken.None);
            Assert.True(retried.Ok);
            Assert.Equal(DocumentProcessingStatus.Ready, retried.Value!.Status);
            Assert.Null(retried.Value.ErrorCode);
            Assert.Single(repo.Items);
        }
    }

    [Fact]
    public async Task DeleteRemovesFileMetadataAndDerivedData()
    {
        var (service, repo, files, docai) = Create();
        using (files)
        {
            var uploaded = await service.UploadAsync(
                "gone.txt", "text/plain", Content("delete me"), 9, null, CancellationToken.None);
            var id = uploaded.Value!.DocumentId;

            var deleted = await service.DeleteAsync(id, CancellationToken.None);
            Assert.True(deleted.Ok);
            Assert.Empty(repo.Items);
            Assert.Contains(id, docai.DeletedIndexes);
            Assert.Empty(Directory.EnumerateFiles(files.Root));
        }
    }

    [Fact]
    public async Task DeleteRefusesWhenDerivedDataCannotBeRemoved()
    {
        var (service, repo, files, docai) = Create();
        using (files)
        {
            var uploaded = await service.UploadAsync(
                "keep.txt", "text/plain", Content("keep me"), 7, null, CancellationToken.None);
            docai.DeleteIndexSucceeds = false;

            var deleted = await service.DeleteAsync(uploaded.Value!.DocumentId, CancellationToken.None);
            Assert.False(deleted.Ok);
            Assert.Single(repo.Items); // metadata retained: no divergence between index and metadata
            Assert.Single(Directory.EnumerateFiles(files.Root));
        }
    }

    [Theory]
    [InlineData("../../etc/passwd.txt", "passwd.txt")]
    [InlineData("..\\..\\evil.txt", "evil.txt")]
    [InlineData("nice letter.pdf", "nice letter.pdf")]
    public void SanitizesDisplayNames(string input, string expected)
        => Assert.Equal(expected, DocumentService.SanitizeDisplayName(input));

    [Fact]
    public void SignatureValidationCoversAllSupportedTypes()
    {
        Assert.True(DocumentService.SignatureMatches("application/pdf", "%PDF-1.4"u8.ToArray(), 8));
        Assert.False(DocumentService.SignatureMatches("application/pdf", "not-pdf!"u8.ToArray(), 8));
        Assert.True(DocumentService.SignatureMatches("image/png",
            [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], 8));
        Assert.False(DocumentService.SignatureMatches("image/png", "%PDF-1.4"u8.ToArray(), 8));
        Assert.True(DocumentService.SignatureMatches("image/jpeg", [0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0], 8));
        Assert.True(DocumentService.SignatureMatches("text/plain", "hello wo"u8.ToArray(), 8));
        Assert.False(DocumentService.SignatureMatches("text/plain", [0x00, 0x01, 0x02, 0, 0, 0, 0, 0], 8));
    }
}
