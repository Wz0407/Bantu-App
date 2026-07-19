using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyBantu.Application.Abstractions;
using MyBantu.Application.Documents;
using MyBantu.Application.Health;
using MyBantu.Application.Translation;
using MyBantu.Domain.Contracts;
using MyBantu.Infrastructure.Configuration;
using MyBantu.Infrastructure.DocumentAi;
using MyBantu.Infrastructure.Persistence;
using MyBantu.Infrastructure.Storage;
using MyBantu.Infrastructure.Translation;

var builder = WebApplication.CreateBuilder(args);

// Typed configuration, validated at startup (fail fast on invalid config).
builder.Services.AddOptions<MyBantuOptions>()
    .BindConfiguration(MyBantuOptions.SectionName)
    .ValidateDataAnnotations()
    .ValidateOnStart();

builder.Services.AddSingleton(TimeProvider.System);

// Upload size limit: enforced at the transport level as well as in DocumentService.
builder.WebHost.ConfigureKestrel((context, kestrel) =>
{
    var maxUpload = context.Configuration.GetSection(MyBantuOptions.SectionName)
        .GetValue<long?>(nameof(MyBantuOptions.MaxUploadBytes)) ?? 20 * 1024 * 1024;
    kestrel.Limits.MaxRequestBodySize = maxUpload + 1024 * 1024; // multipart overhead
});

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

// Documents (UC-02): SQLite metadata + local file store + Document AI client.
builder.Services.AddDbContext<MyBantuDbContext>((serviceProvider, dbOptions) =>
{
    var options = serviceProvider.GetRequiredService<IOptions<MyBantuOptions>>().Value;
    var dbDir = Path.GetFullPath(Path.Combine(options.DataDirectory, "app"));
    Directory.CreateDirectory(dbDir);
    dbOptions.UseSqlite($"Data Source={Path.Combine(dbDir, "mybantu.sqlite")}");
});
builder.Services.AddScoped<IDocumentRepository, SqliteDocumentRepository>();
builder.Services.AddSingleton<IDocumentFileStore, LocalDocumentFileStore>();
builder.Services.AddSingleton(serviceProvider =>
    new DocumentSettings(serviceProvider.GetRequiredService<IOptions<MyBantuOptions>>()
        .Value.MaxUploadBytes));
builder.Services.AddScoped<DocumentService>();

builder.Services.AddHttpClient<IDocumentAiClient, DocumentAiHttpClient>((serviceProvider, client) =>
{
    var options = serviceProvider
        .GetRequiredService<IOptions<MyBantuOptions>>().Value;
    client.BaseAddress = new Uri(options.DocumentAiBaseUrl);
    client.Timeout = TimeSpan.FromSeconds(options.DocumentAiTimeoutSeconds);
});

var app = builder.Build();

// Versioned migrations run at startup (NFR-04): the local database is always
// at the schema the running code expects.
using (var scope = app.Services.CreateScope())
{
    scope.ServiceProvider.GetRequiredService<MyBantuDbContext>().Database.Migrate();
}

// Machine-readable error envelope; raw stack traces are never exposed.
// AGENTS.md §14: request paths contain only generated document IDs (allowed);
// original filenames or document content never appear in URLs or logs.
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

static IResult MapFailure(ErrorResponse error, HttpContext context)
{
    var enriched = error with { CorrelationId = context.TraceIdentifier };
    var statusCode = enriched.Code switch
    {
        ErrorCodes.NotFound => StatusCodes.Status404NotFound,
        ErrorCodes.FileTooLarge => StatusCodes.Status413PayloadTooLarge,
        ErrorCodes.ValidationFailed when enriched.Details?.ContainsKey("existingDocumentId") == true
            => StatusCodes.Status409Conflict,
        ErrorCodes.ValidationFailed or ErrorCodes.UnsupportedFileType or ErrorCodes.UnsupportedLanguage
            => StatusCodes.Status400BadRequest,
        ErrorCodes.ModelNotInstalled or ErrorCodes.ModelLoadFailed or ErrorCodes.NativeEngineUnavailable
            or ErrorCodes.InternalError => StatusCodes.Status503ServiceUnavailable,
        _ => StatusCodes.Status500InternalServerError,
    };
    return Results.Json(enriched, statusCode: statusCode);
}

// Public health endpoint (ARCHITECTURE.md §9).
app.MapGet("/health", async (HealthService healthService, CancellationToken cancellationToken) =>
    Results.Ok(await healthService.GetHealthAsync(cancellationToken)));

// Translation (UC-01).
app.MapPost("/api/v1/translations", async (
    TranslationRequest request,
    TranslationService translationService,
    HttpContext context,
    CancellationToken cancellationToken) =>
{
    var result = await translationService.TranslateAsync(request, cancellationToken);
    return result.Ok && result.Value is not null
        ? Results.Ok(result.Value)
        : MapFailure(result.Error!, context);
});

// Documents (UC-02). Endpoints stay thin; DocumentService owns the rules.
app.MapPost("/api/v1/documents", async (
    IFormFile file,
    string? languageHint,
    DocumentService documents,
    HttpContext context,
    CancellationToken cancellationToken) =>
{
    await using var stream = file.OpenReadStream();
    var result = await documents.UploadAsync(
        file.FileName, file.ContentType, stream, file.Length, languageHint, cancellationToken);
    return result.Ok && result.Value is not null
        ? Results.Created($"/api/v1/documents/{result.Value.DocumentId}", result.Value)
        : MapFailure(result.Error!, context);
}).DisableAntiforgery();

app.MapGet("/api/v1/documents", async (DocumentService documents, CancellationToken cancellationToken) =>
    Results.Ok(await documents.ListAsync(cancellationToken)));

app.MapGet("/api/v1/documents/{documentId}", async (
    string documentId, DocumentService documents, HttpContext context, CancellationToken cancellationToken) =>
{
    var result = await documents.GetAsync(documentId, cancellationToken);
    return result.Ok && result.Value is not null ? Results.Ok(result.Value) : MapFailure(result.Error!, context);
});

app.MapGet("/api/v1/documents/{documentId}/pages", async (
    string documentId, DocumentService documents, HttpContext context, CancellationToken cancellationToken) =>
{
    var result = await documents.GetPagesAsync(documentId, cancellationToken);
    return result.Ok && result.Value is not null ? Results.Ok(result.Value) : MapFailure(result.Error!, context);
});

app.MapPost("/api/v1/documents/{documentId}/process", async (
    string documentId, string? languageHint, DocumentService documents, HttpContext context,
    CancellationToken cancellationToken) =>
{
    var result = await documents.ReprocessAsync(documentId, languageHint, cancellationToken);
    return result.Ok && result.Value is not null ? Results.Ok(result.Value) : MapFailure(result.Error!, context);
});

app.MapDelete("/api/v1/documents/{documentId}", async (
    string documentId, DocumentService documents, HttpContext context, CancellationToken cancellationToken) =>
{
    var result = await documents.DeleteAsync(documentId, cancellationToken);
    return result.Ok ? Results.Ok(new { documentId, deleted = true }) : MapFailure(result.Error!, context);
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
