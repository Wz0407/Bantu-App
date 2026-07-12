using System.Text.Json.Serialization;

namespace MyBantu.Domain.Contracts;

[JsonConverter(typeof(JsonStringEnumConverter<HealthLevel>))]
public enum HealthLevel
{
    [JsonStringEnumMemberName("healthy")]
    Healthy,

    [JsonStringEnumMemberName("degraded")]
    Degraded,

    [JsonStringEnumMemberName("unhealthy")]
    Unhealthy,
}

public sealed record HealthComponent(
    string Name,
    ServiceAvailability Availability,
    string? Detail = null);

/// <summary>
/// Health report (mirror of packages/contracts/schemas/health-status.schema.json).
/// </summary>
public sealed record HealthStatus(
    HealthLevel Status,
    string Service,
    string Version,
    DateTimeOffset TimestampUtc,
    IReadOnlyList<HealthComponent> Components);
