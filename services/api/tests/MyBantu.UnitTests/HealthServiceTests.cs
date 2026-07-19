using MyBantu.Application;
using MyBantu.Application.Abstractions;
using MyBantu.Application.Health;
using MyBantu.Domain.Contracts;

namespace MyBantu.UnitTests;

public class HealthServiceTests
{
    private sealed class FakeDocumentAiClient(AppResult<HealthStatus> result) : IDocumentAiClient
    {
        public Task<AppResult<HealthStatus>> GetHealthAsync(CancellationToken cancellationToken)
            => Task.FromResult(result);

        public Task<AppResult<DocumentAiIngestionResult>> IngestAsync(
            DocumentAiIngestionRequest request, CancellationToken cancellationToken)
            => throw new NotSupportedException("not used by health tests");

        public Task<AppResult<DocumentAiExtraction>> GetExtractionAsync(
            string documentId, CancellationToken cancellationToken)
            => throw new NotSupportedException("not used by health tests");

        public Task<AppResult<bool>> DeleteIndexAsync(string documentId, CancellationToken cancellationToken)
            => throw new NotSupportedException("not used by health tests");
    }

    private static readonly TimeProvider Time = TimeProvider.System;

    [Fact]
    public async Task ReportsDegradedWhenTranslationEngineIsNotConfigured()
    {
        var docAiHealth = new HealthStatus(
            HealthLevel.Degraded, "mybantu-document-ai", "0.1.0",
            DateTimeOffset.UtcNow,
            [new HealthComponent("ocr-provider", ServiceAvailability.NotConfigured)]);
        var service = new HealthService(
            new Infrastructure.Translation.NotConfiguredTranslationEngine(),
            new FakeDocumentAiClient(AppResult<HealthStatus>.Success(docAiHealth)),
            Time);

        var health = await service.GetHealthAsync(CancellationToken.None);

        Assert.Equal(HealthLevel.Degraded, health.Status);
        Assert.Equal("mybantu-api", health.Service);
        var translation = Assert.Single(health.Components, c => c.Name == "translation-engine");
        Assert.Equal(ServiceAvailability.NotConfigured, translation.Availability);
        Assert.Contains(health.Components, c => c.Name == "document-ai/ocr-provider");
    }

    [Fact]
    public async Task ReportsDocumentAiUnavailableWhenServiceIsUnreachable()
    {
        var failure = AppResult<HealthStatus>.Failure(new ErrorResponse(
            ErrorCodes.InternalError, "unreachable", Retryable: true));
        var service = new HealthService(
            new Infrastructure.Translation.NotConfiguredTranslationEngine(),
            new FakeDocumentAiClient(failure),
            Time);

        var health = await service.GetHealthAsync(CancellationToken.None);

        var docAi = Assert.Single(health.Components, c => c.Name == "document-ai");
        Assert.Equal(ServiceAvailability.Unavailable, docAi.Availability);
        Assert.Equal(HealthLevel.Degraded, health.Status);
    }
}
