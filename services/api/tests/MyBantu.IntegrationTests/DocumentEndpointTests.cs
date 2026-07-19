using System.Net;
using System.Net.Http.Json;
using System.Text;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using MyBantu.Application;
using MyBantu.Application.Abstractions;
using MyBantu.Application.Documents;
using MyBantu.Domain.Contracts;

namespace MyBantu.IntegrationTests;

/// <summary>
/// Full-stack API tests for UC-02 with a stubbed Document AI client (the real
/// ingestion pipeline is covered by the Document AI service's own tests). Uses an
/// isolated temp DataDirectory per fixture, exercising the real SQLite database,
/// migrations, and local file store.
/// </summary>
public sealed class DocumentEndpointTests : IClassFixture<DocumentEndpointTests.Fixture>, IDisposable
{
    public sealed class StubDocumentAi : IDocumentAiClient
    {
        public AppResult<DocumentAiIngestionResult>? NextIngest;
        public readonly List<string> DeletedIndexes = [];

        public Task<AppResult<HealthStatus>> GetHealthAsync(CancellationToken ct)
            => Task.FromResult(AppResult<HealthStatus>.Failure(
                new ErrorResponse(ErrorCodes.InternalError, "not running in tests", Retryable: true)));

        public Task<AppResult<DocumentAiIngestionResult>> IngestAsync(
            DocumentAiIngestionRequest request, CancellationToken ct)
            => Task.FromResult(NextIngest ?? AppResult<DocumentAiIngestionResult>.Success(
                new DocumentAiIngestionResult(
                    request.DocumentId, DocumentProcessingStatus.Ready, 1, 3, "ms", 0.8,
                    ["synthetic warning"])));

        public Task<AppResult<DocumentAiExtraction>> GetExtractionAsync(string id, CancellationToken ct)
            => Task.FromResult(AppResult<DocumentAiExtraction>.Success(new DocumentAiExtraction(
                id, 1, "ms", [], [new DocumentAiPage(1, "Sila bayar RM50 sebelum 1 Ogos.", "txt", null)])));

        public Task<AppResult<bool>> DeleteIndexAsync(string id, CancellationToken ct)
        {
            DeletedIndexes.Add(id);
            return Task.FromResult(AppResult<bool>.Success(true));
        }
    }

    public sealed class Fixture : WebApplicationFactory<Program>
    {
        public readonly string DataDir = Directory.CreateTempSubdirectory("mybantu-api-it-").FullName;
        public readonly StubDocumentAi DocumentAi = new();

        protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
        {
            builder.UseSetting("MyBantu:DataDirectory", DataDir);
            builder.ConfigureServices(services =>
                services.Replace(ServiceDescriptor.Singleton<IDocumentAiClient>(DocumentAi)));
        }

        protected override void Dispose(bool disposing)
        {
            base.Dispose(disposing);
            try { Directory.Delete(DataDir, recursive: true); } catch { /* best effort */ }
        }
    }

    private readonly Fixture _fixture;
    private readonly HttpClient _client;

    public DocumentEndpointTests(Fixture fixture)
    {
        _fixture = fixture;
        _client = fixture.CreateClient();
    }

    public void Dispose() => _client.Dispose();

    private static MultipartFormDataContent Upload(string fileName, string mime, byte[] bytes)
    {
        var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(mime);
        content.Add(file, "file", fileName);
        return content;
    }

    [Fact]
    public async Task UploadsProcessesFetchesAndDeletesEndToEnd()
    {
        var response = await _client.PostAsync("/api/v1/documents",
            Upload("notis sekolah.txt", "text/plain", Encoding.UTF8.GetBytes("Sila bayar RM50 sebelum 1 Ogos.")));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var dto = await response.Content.ReadFromJsonAsync<DocumentDto>();
        Assert.NotNull(dto);
        Assert.Equal(DocumentProcessingStatus.Ready, dto.Status);
        Assert.Equal("ms", dto.DetectedLanguage);
        Assert.Equal("notis sekolah.txt", dto.FileName);
        Assert.Contains("synthetic warning", dto.Warnings);

        // The stored file exists under the temp data dir with a generated name.
        var stored = Directory.EnumerateFiles(Path.Combine(_fixture.DataDir, "documents")).Single();
        Assert.Matches("doc-[a-f0-9]{32}\\.txt$", Path.GetFileName(stored));

        var get = await _client.GetFromJsonAsync<DocumentDto>($"/api/v1/documents/{dto.DocumentId}");
        Assert.Equal(dto.DocumentId, get!.DocumentId);

        var list = await _client.GetFromJsonAsync<List<DocumentDto>>("/api/v1/documents");
        Assert.Contains(list!, d => d.DocumentId == dto.DocumentId);

        var pages = await _client.GetFromJsonAsync<DocumentAiExtraction>(
            $"/api/v1/documents/{dto.DocumentId}/pages");
        Assert.Contains("RM50", pages!.Pages[0].Text);

        var delete = await _client.DeleteAsync($"/api/v1/documents/{dto.DocumentId}");
        Assert.Equal(HttpStatusCode.OK, delete.StatusCode);
        Assert.Contains(dto.DocumentId, _fixture.DocumentAi.DeletedIndexes);
        Assert.Empty(Directory.EnumerateFiles(Path.Combine(_fixture.DataDir, "documents")));

        var gone = await _client.GetAsync($"/api/v1/documents/{dto.DocumentId}");
        Assert.Equal(HttpStatusCode.NotFound, gone.StatusCode);
    }

    [Fact]
    public async Task RejectsUnsupportedAndMismatchedFiles()
    {
        var exe = await _client.PostAsync("/api/v1/documents",
            Upload("virus.exe", "application/x-msdownload", [0x4D, 0x5A, 1, 2]));
        Assert.Equal(HttpStatusCode.BadRequest, exe.StatusCode);
        var error = await exe.Content.ReadFromJsonAsync<ErrorResponse>();
        Assert.Equal(ErrorCodes.UnsupportedFileType, error!.Code);

        // Declared PDF but not a PDF inside.
        var fake = await _client.PostAsync("/api/v1/documents",
            Upload("fake.pdf", "application/pdf", Encoding.ASCII.GetBytes("hello, not a pdf")));
        Assert.Equal(HttpStatusCode.BadRequest, fake.StatusCode);

        // Binary bytes masquerading as text.
        var binaryTxt = await _client.PostAsync("/api/v1/documents",
            Upload("weird.txt", "text/plain", [0x00, 0x01, 0x02, 0x03]));
        Assert.Equal(HttpStatusCode.BadRequest, binaryTxt.StatusCode);
    }

    [Fact]
    public async Task DuplicateUploadsReturnConflictWithExistingId()
    {
        var bytes = Encoding.UTF8.GetBytes($"duplicate probe {Guid.NewGuid()}");
        var first = await _client.PostAsync("/api/v1/documents", Upload("a.txt", "text/plain", bytes));
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        var firstDto = await first.Content.ReadFromJsonAsync<DocumentDto>();

        var second = await _client.PostAsync("/api/v1/documents", Upload("b.txt", "text/plain", bytes));
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        var error = await second.Content.ReadFromJsonAsync<ErrorResponse>();
        Assert.NotNull(error!.Details);
        Assert.Equal(firstDto!.DocumentId, error.Details!["existingDocumentId"].ToString());

        await _client.DeleteAsync($"/api/v1/documents/{firstDto.DocumentId}");
    }

    [Fact]
    public async Task FailedProcessingIsReportedAndRetryable()
    {
        _fixture.DocumentAi.NextIngest = AppResult<DocumentAiIngestionResult>.Failure(
            new ErrorResponse(ErrorCodes.DocumentParseFailed, "broken", Retryable: true));
        try
        {
            var bytes = Encoding.UTF8.GetBytes($"retry probe {Guid.NewGuid()}");
            var response = await _client.PostAsync("/api/v1/documents", Upload("r.txt", "text/plain", bytes));
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            var dto = await response.Content.ReadFromJsonAsync<DocumentDto>();
            Assert.Equal(DocumentProcessingStatus.Failed, dto!.Status);
            Assert.Equal(ErrorCodes.DocumentParseFailed, dto.ErrorCode);

            _fixture.DocumentAi.NextIngest = null;
            var retry = await _client.PostAsync($"/api/v1/documents/{dto.DocumentId}/process", null);
            Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
            var retried = await retry.Content.ReadFromJsonAsync<DocumentDto>();
            Assert.Equal(DocumentProcessingStatus.Ready, retried!.Status);

            await _client.DeleteAsync($"/api/v1/documents/{dto.DocumentId}");
        }
        finally
        {
            _fixture.DocumentAi.NextIngest = null;
        }
    }

    [Fact]
    public async Task PagesEndpointRefusesUnprocessedDocuments()
    {
        _fixture.DocumentAi.NextIngest = AppResult<DocumentAiIngestionResult>.Failure(
            new ErrorResponse(ErrorCodes.OcrFailed, "ocr down", Retryable: true));
        try
        {
            var bytes = Encoding.UTF8.GetBytes($"pages probe {Guid.NewGuid()}");
            var response = await _client.PostAsync("/api/v1/documents", Upload("p.txt", "text/plain", bytes));
            var dto = await response.Content.ReadFromJsonAsync<DocumentDto>();

            var pages = await _client.GetAsync($"/api/v1/documents/{dto!.DocumentId}/pages");
            Assert.Equal(HttpStatusCode.BadRequest, pages.StatusCode);

            await _client.DeleteAsync($"/api/v1/documents/{dto.DocumentId}");
        }
        finally
        {
            _fixture.DocumentAi.NextIngest = null;
        }
    }
}
