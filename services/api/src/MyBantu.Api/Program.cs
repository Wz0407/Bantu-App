using Microsoft.AspNetCore.Diagnostics;
using MyBantu.Application.Abstractions;
using MyBantu.Application.Health;
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
builder.Services.AddSingleton<ITranslationEngine, NotConfiguredTranslationEngine>();
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

// Unknown routes also return the machine-readable error envelope.
app.MapFallback((HttpContext context) => Results.NotFound(new ErrorResponse(
    ErrorCodes.NotFound,
    $"No route matches {context.Request.Method} {context.Request.Path}. No data was changed.",
    Retryable: false,
    CorrelationId: context.TraceIdentifier)));

app.Run();

/// <summary>Exposed for WebApplicationFactory-based integration tests.</summary>
public partial class Program;
