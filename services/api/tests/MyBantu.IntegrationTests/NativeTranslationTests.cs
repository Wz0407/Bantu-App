using Microsoft.Extensions.Logging.Abstractions;
using MyBantu.Domain.Contracts;
using MyBantu.Infrastructure.Translation;

namespace MyBantu.IntegrationTests;

/// <summary>
/// Real P/Invoke tests against the built trilingua library and installed model.
/// They SKIP (never silently pass) when TRILINGUA_LIBRARY_PATH or
/// TRILINGUA_TEST_MODEL_DIR is absent — e.g. in cloud CI where the 470 MB model
/// is not downloaded.
/// </summary>
public sealed class NativeModelFactAttribute : FactAttribute
{
    public NativeModelFactAttribute()
    {
        var lib = Environment.GetEnvironmentVariable("TRILINGUA_LIBRARY_PATH");
        var model = Environment.GetEnvironmentVariable("TRILINGUA_TEST_MODEL_DIR");
        if (string.IsNullOrEmpty(lib) || !File.Exists(lib))
        {
            Skip = "TRILINGUA_LIBRARY_PATH not set or library missing — native test skipped (not passed).";
        }
        else if (string.IsNullOrEmpty(model) || !File.Exists(Path.Combine(model, "model.bin")))
        {
            Skip = "TRILINGUA_TEST_MODEL_DIR not set or model missing — native test skipped (not passed).";
        }
    }
}

public class NativeTranslationTests
{
    private static NativeTranslationEngine CreateEngine() => NativeTranslationEngine.Create(
        Environment.GetEnvironmentVariable("TRILINGUA_TEST_MODEL_DIR")!,
        Environment.GetEnvironmentVariable("TRILINGUA_LIBRARY_PATH"),
        NullLogger<NativeTranslationEngine>.Instance);

    [NativeModelFact]
    public void EngineReportsAvailableWithModelVersion()
    {
        var engine = CreateEngine();
        Assert.Equal(ServiceAvailability.Available, engine.Availability());
        Assert.Contains("m2m100", engine.EngineVersion());
    }

    [NativeModelFact]
    public async Task AllSixDirectionsTranslateThroughPInvoke()
    {
        var engine = CreateEngine();
        var cases = new (string Text, string Source, string Target)[]
        {
            ("Please pay before the deadline.", "en", "ms"),
            ("Sila bayar sebelum tarikh akhir.", "ms", "en"),
            ("Please pay before the deadline.", "en", "zh"),
            ("请在期限之前付款。", "zh", "en"),
            ("Sila bayar sebelum tarikh akhir.", "ms", "zh"),
            ("请在期限之前付款。", "zh", "ms"),
        };
        foreach (var (text, source, target) in cases)
        {
            var result = await engine.TranslateAsync(
                new TranslationRequest(text, source, target), CancellationToken.None);
            Assert.True(result.Ok, $"{source}->{target}: {result.Error?.Message}");
            Assert.False(string.IsNullOrWhiteSpace(result.Value!.TranslatedText));
            Assert.Equal(source, result.Value.DetectedSourceLanguage);
        }
    }

    [NativeModelFact]
    public async Task Utf8AmountsSurviveTheMarshalingRoundTrip()
    {
        var engine = CreateEngine();
        var result = await engine.TranslateAsync(
            new TranslationRequest("您尚有RM88.00未结清，请于2026年8月1日前付款。", "zh", "en"),
            CancellationToken.None);
        Assert.True(result.Ok);
        Assert.Contains("RM88.00", result.Value!.TranslatedText);
    }

    [NativeModelFact]
    public async Task AutoDetectionFlowsThroughWithWarning()
    {
        var engine = CreateEngine();
        var result = await engine.TranslateAsync(
            new TranslationRequest("Terima kasih, sila hubungi kami sebelum esok.", "auto", "en"),
            CancellationToken.None);
        Assert.True(result.Ok);
        Assert.Equal("ms", result.Value!.DetectedSourceLanguage);
        Assert.Contains(result.Value.Warnings, w => w.Contains("auto-detected"));
    }

    [NativeModelFact]
    public async Task RepeatedCallsDoNotLeakOrCrash()
    {
        var engine = CreateEngine();
        for (var i = 0; i < 10; i++)
        {
            var result = await engine.TranslateAsync(
                new TranslationRequest("Good morning, see you at 12:30.", "en", "ms"),
                CancellationToken.None);
            Assert.True(result.Ok);
        }
    }
}
