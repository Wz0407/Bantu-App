using System.Text.Json.Serialization;

namespace MyBantu.Domain.Contracts;

/// <summary>
/// Availability of a MyBantu component. AI capabilities that are not set up must
/// report NotConfigured or NotInstalled — never fake availability.
/// Serialized as PascalCase strings per the shared contract.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<ServiceAvailability>))]
public enum ServiceAvailability
{
    Available,
    NotConfigured,
    NotInstalled,
    Unavailable,
}
