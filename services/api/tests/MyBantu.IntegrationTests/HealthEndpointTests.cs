using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using MyBantu.Domain.Contracts;

namespace MyBantu.IntegrationTests;

public class HealthEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;

    public HealthEndpointTests(WebApplicationFactory<Program> factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task HealthEndpointReportsHonestDegradedState()
    {
        // Neither the native engine nor Document AI is configured in Phase 0,
        // so the API must report degraded — never a fake "healthy".
        var response = await _client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var health = await response.Content.ReadFromJsonAsync<HealthStatus>();
        Assert.NotNull(health);
        Assert.Equal(HealthLevel.Degraded, health.Status);
        Assert.Equal("mybantu-api", health.Service);
        Assert.Contains(health.Components,
            c => c.Name == "translation-engine" && c.Availability == ServiceAvailability.NotConfigured);
        // Document AI may or may not be running while tests execute; either way the
        // component must be reported honestly (Available when reachable, Unavailable when not).
        Assert.Contains(health.Components, c => c.Name == "document-ai");
    }

    [Fact]
    public async Task UnknownRoutesReturnMachineReadableError()
    {
        var response = await _client.GetAsync("/api/v1/does-not-exist");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
        Assert.NotNull(error);
        Assert.Equal(ErrorCodes.NotFound, error.Code);
        Assert.False(error.Retryable);
        Assert.NotNull(error.CorrelationId);
    }
}
