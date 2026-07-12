using MyBantu.Application;
using MyBantu.Application.Abstractions;
using MyBantu.Application.Translation;
using MyBantu.Domain.Contracts;

namespace MyBantu.UnitTests;

public class TranslationServiceTests
{
    private sealed class FakeEngine : ITranslationEngine
    {
        public TranslationRequest? LastRequest;
        public AppResult<TranslationResponse> Result = AppResult<TranslationResponse>.Success(
            new TranslationResponse("hi", "hai", "en", "ms", "test-model/v1", 12.5, []));

        public ServiceAvailability Availability() => ServiceAvailability.Available;
        public string? EngineVersion() => "test-model/v1";

        public Task<AppResult<TranslationResponse>> TranslateAsync(
            TranslationRequest request, CancellationToken cancellationToken)
        {
            LastRequest = request;
            return Task.FromResult(Result);
        }
    }

    private static TranslationService CreateService(FakeEngine? engine = null, int maxChars = 100)
        => new(engine ?? new FakeEngine(), new TranslationSettings(maxChars));

    [Fact]
    public async Task RejectsEmptyText()
    {
        var result = await CreateService().TranslateAsync(
            new TranslationRequest("   ", "en", "ms"), CancellationToken.None);
        Assert.False(result.Ok);
        Assert.Equal(ErrorCodes.ValidationFailed, result.Error!.Code);
    }

    [Fact]
    public async Task RejectsOversizedText()
    {
        var result = await CreateService(maxChars: 10).TranslateAsync(
            new TranslationRequest(new string('a', 11), "en", "ms"), CancellationToken.None);
        Assert.False(result.Ok);
        Assert.Equal(ErrorCodes.ValidationFailed, result.Error!.Code);
        Assert.Contains("limit is 10", result.Error.Message);
    }

    [Theory]
    [InlineData("fr", "ms")]
    [InlineData("en", "fr")]
    [InlineData("en", "auto")] // auto is never a target
    public async Task RejectsUnsupportedLanguages(string source, string target)
    {
        var result = await CreateService().TranslateAsync(
            new TranslationRequest("hello", source, target), CancellationToken.None);
        Assert.False(result.Ok);
        Assert.Equal(ErrorCodes.UnsupportedLanguage, result.Error!.Code);
    }

    [Fact]
    public async Task RejectsSameSourceAndTarget()
    {
        var result = await CreateService().TranslateAsync(
            new TranslationRequest("hello", "en", "en"), CancellationToken.None);
        Assert.False(result.Ok);
        Assert.Equal(ErrorCodes.ValidationFailed, result.Error!.Code);
    }

    [Fact]
    public async Task PassesValidRequestToEngineAndReturnsResult()
    {
        var engine = new FakeEngine();
        var result = await CreateService(engine).TranslateAsync(
            new TranslationRequest("hi", "en", "ms"), CancellationToken.None);
        Assert.True(result.Ok);
        Assert.Equal("hai", result.Value!.TranslatedText);
        Assert.Equal("test-model/v1", result.Value.ModelVersion);
        Assert.NotNull(engine.LastRequest);
    }

    [Fact]
    public async Task GlossaryRequestsGetHonestNotSupportedWarning()
    {
        var result = await CreateService().TranslateAsync(
            new TranslationRequest("hi", "en", "ms", GlossaryId: "my-glossary"), CancellationToken.None);
        Assert.True(result.Ok);
        Assert.Contains(result.Value!.Warnings, w => w.Contains("Glossary support is not available"));
        Assert.Empty(result.Value.GlossaryTermsApplied!);
    }

    [Fact]
    public async Task EngineFailuresPassThroughUnchanged()
    {
        var engine = new FakeEngine
        {
            Result = AppResult<TranslationResponse>.Failure(new ErrorResponse(
                ErrorCodes.ModelNotInstalled, "not installed", Retryable: false)),
        };
        var result = await CreateService(engine).TranslateAsync(
            new TranslationRequest("hi", "en", "ms"), CancellationToken.None);
        Assert.False(result.Ok);
        Assert.Equal(ErrorCodes.ModelNotInstalled, result.Error!.Code);
    }
}
