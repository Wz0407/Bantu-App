using MyBantu.Application.Abstractions;
using MyBantu.Domain.Contracts;

namespace MyBantu.Application.Health;

/// <summary>
/// Aggregates the availability of MyBantu components into the public /health response.
/// The API itself being reachable is not enough to claim "healthy": unconfigured
/// AI components make the report "degraded" (FR-02 offline readiness).
/// </summary>
public sealed class HealthService(
    ITranslationEngine translationEngine,
    IDocumentAiClient documentAiClient,
    TimeProvider timeProvider)
{
    public const string ServiceName = "mybantu-api";
    public const string ServiceVersion = "0.1.0";

    public async Task<HealthStatus> GetHealthAsync(CancellationToken cancellationToken)
    {
        var components = new List<HealthComponent>
        {
            new("translation-engine", translationEngine.Availability()),
        };

        var documentAiHealth = await documentAiClient.GetHealthAsync(cancellationToken);
        if (documentAiHealth.Ok && documentAiHealth.Value is not null)
        {
            components.Add(new HealthComponent("document-ai", ServiceAvailability.Available));
            components.AddRange(documentAiHealth.Value.Components.Select(
                c => c with { Name = $"document-ai/{c.Name}" }));
        }
        else
        {
            components.Add(new HealthComponent(
                "document-ai",
                ServiceAvailability.Unavailable,
                "Document AI service is not reachable. Start the local services and retry."));
        }

        var status = components.All(c => c.Availability == ServiceAvailability.Available)
            ? HealthLevel.Healthy
            : HealthLevel.Degraded;

        return new HealthStatus(
            status,
            ServiceName,
            ServiceVersion,
            timeProvider.GetUtcNow(),
            components);
    }
}
