using System.Text.Json.Serialization;

namespace MyBantu.Domain.Contracts;

/// <summary>
/// Lifecycle status of an ingested document (placeholder; ingestion arrives in Phase 2).
/// Partial outputs must never be marked Ready.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<DocumentProcessingStatus>))]
public enum DocumentProcessingStatus
{
    [JsonStringEnumMemberName("uploaded")]
    Uploaded,

    [JsonStringEnumMemberName("processing")]
    Processing,

    [JsonStringEnumMemberName("ready")]
    Ready,

    [JsonStringEnumMemberName("failed")]
    Failed,
}
