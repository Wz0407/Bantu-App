namespace MyBantu.Domain.Contracts;

/// <summary>
/// Standard machine-readable error envelope
/// (mirror of packages/contracts/schemas/error-response.schema.json).
/// The message must state what failed, whether data was saved, and whether retry is possible.
/// Raw stack traces are never exposed.
/// </summary>
public sealed record ErrorResponse(
    string Code,
    string Message,
    bool Retryable,
    string? CorrelationId = null,
    IReadOnlyDictionary<string, object>? Details = null);
