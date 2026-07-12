using Microsoft.AspNetCore.Diagnostics;
using Microsoft.Extensions.Options;
using MyBantu.Application.Abstractions;
using MyBantu.Application.Health;
using MyBantu.Application.Translation;
using MyBantu.Domain.Contracts;
using MyBantu.Infrastructure.Configuration;
using MyBantu.Infrastructure.DocumentAi;
using MyBantu.Infrastructure.Translation;

var builder = WebApplication.CreateBuilder(args);

// Typed configuration, validated at startup (fail fast on invalid config).
builder.Services.AddOptions<MyBantuOptions>()
    .BindConfiguration(MyBantuOptions.SectionName)
    .ValidateDataAnnotations()
    .ValidateOnStart();

builder.Services.AddSingleton(TimeProvider.System);

// Translation engine: the real native engine when a model directory is
// configured and the native library loads; otherwise the honest NotConfigured
// placeholder. Never a fake translator.
builder.Services.AddSingleton<ITranslationEngine>(serviceProvider =>
{
    var options = serviceProvider.GetRequiredService<IOptions<MyBantuOptions>>().Value;
    var logger = serviceProvider.GetRequiredService<ILogger<NativeTranslationEngine>>();
    if (string.IsNullOrWhiteSpace(options.TranslationModelDirectory))
    {
        return new NotConfiguredTranslationEngine();
    }
    try
    {
        return NativeTranslationEngine.Create(
            options.TranslationModelDirectory, options.TrilinguaLibraryPath, logger);
    }
    catch (Exception ex) when (ex is DllNotFoundException or EntryPointNotFoundException or BadImageFormatException)
    {
        logger.LogWarning(ex,
            "trilingua native library could not be loaded; translation reports NotConfigured");
        return new NotConfiguredTranslationEngine();
    }
});
builder.Services.AddSingleton(serviceProvider =>
    new TranslationSettings(serviceProvider.GetRequiredService<IOptions<MyBantuOptions>>()
        .Value.TranslationMaxInputChars));
builder.Services.AddSingleton<TranslationService>();
builder.Services.AddScoped<HealthService>();

builder.Services.AddHttpClient<IDocumentAiClient, DocumentAiHttpClient>((serviceProvider, client) =>
{
    var options = serviceProvider
        .GetRequiredService<Microsoft.Extensions.Options.IOptions<MyBantuOptions>>().Value;
    client.BaseAddress = new Uri(options.DocumentAiBaseUrl);
    client.Timeout = TimeSpan.FromSeconds(3);
});

var app = builder.Build();

// Machine-readable error envelope; raw stack traces are never exposed.
app.UseExceptionHandler(errorApp => errorApp.Run(async context =>
{
    var feature = context.Features.Get<IExceptionHandlerFeature>();
    var logger = context.RequestServices.GetRequiredService<ILoggerFactory>()
        .CreateLogger("MyBantu.Api.Errors");
    logger.LogError(feature?.Error, "Unhandled exception for {Path}", context.Request.Path);

    context.Response.StatusCode = StatusCodes.Status500InternalServerError;
    await context.Response.WriteAsJsonAsync(new ErrorResponse(
        ErrorCodes.InternalError,
        "An unexpected error occurred. No data was changed. You can retry the request.",
        Retryable: true,
        CorrelationId: context.TraceIdentifier));
}));

// Public health endpoint (ARCHITECTURE.md §9). Controllers stay minimal:
// this endpoint delegates directly to the application-layer HealthService.
app.MapGet("/health", async (HealthService healthService, CancellationToken cancellationToken) =>
    Results.Ok(await healthService.GetHealthAsync(cancellationToken)));

// Translation (UC-01). Thin endpoint: validation and orchestration live in
// TranslationService; the engine is behind ITranslationEngine.
app.MapPost("/api/v1/translations", async (
    TranslationRequest request,
    TranslationService translationService,
    HttpContext context,
    CancellationToken cancellationToken) =>
{
    var result = await translationService.TranslateAsync(request, cancellationToken);
    if (result.Ok && result.Value is not null)
    {
        return Results.Ok(result.Value);
    }
    var error = result.Error! with { CorrelationId = context.TraceIdentifier };
    var statusCode = error.Code switch
    {
        ErrorCodes.ValidationFailed or ErrorCodes.UnsupportedLanguage => StatusCodes.Status400BadRequest,
        ErrorCodes.ModelNotInstalled or ErrorCodes.ModelLoadFailed or ErrorCodes.NativeEngineUnavailable
            => StatusCodes.Status503ServiceUnavailable,
        _ => StatusCodes.Status500InternalServerError,
    };
    return Results.Json(error, statusCode: statusCode);
});

// Unknown routes also return the machine-readable error envelope.
app.MapFallback((HttpContext context) => Results.NotFound(new ErrorResponse(
    ErrorCodes.NotFound,
    $"No route matches {context.Request.Method} {context.Request.Path}. No data was changed.",
    Retryable: false,
    CorrelationId: context.TraceIdentifier)));

app.Run();

/// <summary>Exposed for WebApplicationFactory-based integration tests.</summary>
public partial class Program;
