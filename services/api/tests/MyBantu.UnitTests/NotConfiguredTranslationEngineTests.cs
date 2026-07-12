using MyBantu.Domain.Contracts;
using MyBantu.Infrastructure.Translation;

namespace MyBantu.UnitTests;

public class NotConfiguredTranslationEngineTests
{
    private readonly NotConfiguredTranslationEngine _engine = new();

    [Fact]
    public void ReportsNotConfiguredAndNoVersion()
    {
        Assert.Equal(ServiceAvailability.NotConfigured, _engine.Availability());
        Assert.Null(_engine.EngineVersion());
    }

    [Fact]
    public async Task NeverReturnsFakeTranslations()
    {
        var request = new TranslationRequest("Sila bayar sebelum 18 Ogos.", "auto", "zh");

        var result = await _engine.TranslateAsync(request, CancellationToken.None);

        Assert.False(result.Ok);
        Assert.Null(result.Value);
        Assert.NotNull(result.Error);
        Assert.Equal(ErrorCodes.NativeEngineUnavailable, result.Error.Code);
        Assert.Contains("not configured", result.Error.Message);
    }
}
