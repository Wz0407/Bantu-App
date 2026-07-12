using Microsoft.Extensions.Logging;
using MyBantu.Application;
using MyBantu.Application.Abstractions;
using MyBantu.Domain.Contracts;

namespace MyBantu.Infrastructure.Translation;

/// <summary>
/// Production translation engine over the TriLingua native library (P/Invoke →
/// C ABI → CTranslate2 M2M-100, per ADR-008). Availability is queried live from
/// the native health check, so the /health endpoint always reflects the real
/// engine state. Never returns fake translations.
/// </summary>
public sealed class NativeTranslationEngine : ITranslationEngine
{
    private readonly ILogger<NativeTranslationEngine> _logger;

    private NativeTranslationEngine(ILogger<NativeTranslationEngine> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Loads the native library and initializes the model. Throws
    /// <see cref="DllNotFoundException"/> when the native library is absent —
    /// the caller decides the fallback (NotConfigured engine).
    /// </summary>
    public static NativeTranslationEngine Create(
        string modelDirectory,
        string? nativeLibraryPath,
        ILogger<NativeTranslationEngine> logger)
    {
        TrilinguaNative.ConfigureLibraryPath(nativeLibraryPath);
        var status = TrilinguaNative.Initialize(modelDirectory);
        logger.LogInformation(
            "Native translation engine initialized: status={Status}, libVersion available={HasLib}",
            status, true);
        return new NativeTranslationEngine(logger);
    }

    public ServiceAvailability Availability()
    {
        try
        {
            return (TrilinguaNative.Status)TrilinguaNative.HealthCheck() switch
            {
                TrilinguaNative.Status.Ok => ServiceAvailability.Available,
                TrilinguaNative.Status.EngineNotConfigured => ServiceAvailability.NotInstalled,
                TrilinguaNative.Status.NotInitialized => ServiceAvailability.NotConfigured,
                _ => ServiceAvailability.Unavailable,
            };
        }
        catch (DllNotFoundException)
        {
            return ServiceAvailability.NotConfigured;
        }
    }

    public string? EngineVersion() => TrilinguaNative.GetModelVersion();

    public async Task<AppResult<TranslationResponse>> TranslateAsync(
        TranslationRequest request,
        CancellationToken cancellationToken)
    {
        // The native call has no mid-flight cancellation; WaitAsync abandons the
        // caller on cancellation while decoding finishes in the background
        // (bounded by the engine's max output length).
        var native = await Task.Run(
                () => TrilinguaNative.Translate(request.Text, request.SourceLanguage, request.TargetLanguage),
                CancellationToken.None)
            .WaitAsync(cancellationToken);

        _logger.LogInformation(
            "translation operation={Operation} status={Status} durationMs={DurationMs} direction={Direction} textLength={TextLength}",
            "translate", native.Status, Math.Round(native.ElapsedMs), $"{request.SourceLanguage}->{request.TargetLanguage}",
            request.Text.Length);

        if (native.Status == TrilinguaNative.Status.Ok)
        {
            var warnings = new List<string>();
            if (request.SourceLanguage == LanguageCodes.Auto)
            {
                warnings.Add(native.DetectionConfidence < 0.5
                    ? $"Source language was auto-detected as '{native.DetectedLanguage}' with low confidence. Select the source language manually if the translation looks wrong."
                    : $"Source language was auto-detected as '{native.DetectedLanguage}'.");
            }
            return AppResult<TranslationResponse>.Success(new TranslationResponse(
                request.Text,
                native.TranslatedText ?? string.Empty,
                native.DetectedLanguage ?? request.SourceLanguage,
                request.TargetLanguage,
                native.ModelVersion ?? "unknown",
                native.ElapsedMs,
                warnings));
        }

        return AppResult<TranslationResponse>.Failure(MapError(native.Status, native.ErrorMessage));
    }

    private static ErrorResponse MapError(TrilinguaNative.Status status, string? nativeMessage)
    {
        return status switch
        {
            TrilinguaNative.Status.EngineNotConfigured or TrilinguaNative.Status.NotInitialized =>
                new ErrorResponse(
                    ErrorCodes.ModelNotInstalled,
                    "The local translation model is not installed. No data was changed. "
                    + "Run the model setup (scripts/model-setup) and restart the app.",
                    Retryable: false),
            TrilinguaNative.Status.ModelLoadFailed => new ErrorResponse(
                ErrorCodes.ModelLoadFailed,
                "The translation model could not be loaded. No data was changed. "
                + "Re-run the model setup to repair the installation.",
                Retryable: true),
            TrilinguaNative.Status.UnsupportedLanguage => new ErrorResponse(
                ErrorCodes.UnsupportedLanguage,
                "Supported languages are en, ms and zh ('auto' only as source).",
                Retryable: false),
            TrilinguaNative.Status.InvalidUtf8 or TrilinguaNative.Status.InvalidArgument =>
                new ErrorResponse(
                    ErrorCodes.ValidationFailed,
                    "The translation input was invalid. Check the text and try again.",
                    Retryable: false),
            _ => new ErrorResponse(
                ErrorCodes.NativeEngineUnavailable,
                "The translation engine failed unexpectedly. You can retry the request. "
                + (nativeMessage is null ? string.Empty : "Details were logged locally."),
                Retryable: true),
        };
    }
}
