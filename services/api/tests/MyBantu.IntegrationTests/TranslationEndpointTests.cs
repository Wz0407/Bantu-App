using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using MyBantu.Application;
using MyBantu.Application.Abstractions;
using MyBantu.Domain.Contracts;

namespace MyBantu.IntegrationTests;

public class TranslationEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private sealed class StubEngine : ITranslationEngine
    {
        public static AppResult<TranslationResponse> NextResult { get; set; } = Success();

        public static AppResult<TranslationResponse> Success() =>
            AppResult<TranslationResponse>.Success(new TranslationResponse(
                "Sila bayar sebelum 18 Ogos.", "请在8月18日之前付款。", "ms", "zh",
                "m2m100-stub/v1", 250.0, []));

        public ServiceAvailability Availability() => ServiceAvailability.Available;
        public string? EngineVersion() => "m2m100-stub/v1";
        public Task<AppResult<TranslationResponse>> TranslateAsync(
            TranslationRequest request, CancellationToken cancellationToken)
            => Task.FromResult(NextResult);
    }

    private readonly WebApplicationFactory<Program> _factory;

    public TranslationEndpointTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            services.Replace(ServiceDescriptor.Singleton<ITranslationEngine, StubEngine>())));
    }

    [Fact]
    public async Task TranslatesSuccessfullyThroughTheApi()
    {
        StubEngine.NextResult = StubEngine.Success();
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/v1/translations",
            new TranslationRequest("Sila bayar sebelum 18 Ogos.", "auto", "zh"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<TranslationResponse>();
        Assert.NotNull(body);
        Assert.Equal("请在8月18日之前付款。", body.TranslatedText);
        Assert.Equal("ms", body.DetectedSourceLanguage);
        Assert.Equal("m2m100-stub/v1", body.ModelVersion);
    }

    [Fact]
    public async Task ValidationErrorsReturn400WithMachineReadableBody()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/v1/translations",
            new TranslationRequest("", "en", "ms"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
        Assert.Equal(ErrorCodes.ValidationFailed, error!.Code);
        Assert.NotNull(error.CorrelationId);
    }

    [Fact]
    public async Task UnsupportedLanguageReturns400()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/v1/translations",
            new TranslationRequest("hello", "fr", "ms"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
        Assert.Equal(ErrorCodes.UnsupportedLanguage, error!.Code);
    }

    [Fact]
    public async Task ModelNotInstalledReturns503()
    {
        StubEngine.NextResult = AppResult<TranslationResponse>.Failure(new ErrorResponse(
            ErrorCodes.ModelNotInstalled, "The local translation model is not installed.", Retryable: false));
        try
        {
            var client = _factory.CreateClient();
            var response = await client.PostAsJsonAsync("/api/v1/translations",
                new TranslationRequest("hello", "en", "ms"));

            Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
            var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
            Assert.Equal(ErrorCodes.ModelNotInstalled, error!.Code);
        }
        finally
        {
            StubEngine.NextResult = StubEngine.Success();
        }
    }
}
