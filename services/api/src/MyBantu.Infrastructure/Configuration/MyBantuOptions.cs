using System.ComponentModel.DataAnnotations;

namespace MyBantu.Infrastructure.Configuration;

/// <summary>
/// Typed application configuration, validated at startup (fail fast on bad config).
/// </summary>
public sealed class MyBantuOptions
{
    public const string SectionName = "MyBantu";

    /// <summary>Base URL of the internal Document AI service. Loopback only.</summary>
    [Required]
    [Url]
    public string DocumentAiBaseUrl { get; set; } = "http://127.0.0.1:5210";

    /// <summary>Root directory for local data (documents, indexes). Never a cloud path.</summary>
    [Required]
    public string DataDirectory { get; set; } = "./data";

    /// <summary>
    /// Directory containing translation model files. Empty means the native
    /// translation engine is NotConfigured (Phase 1 fills this in).
    /// </summary>
    public string? TranslationModelDirectory { get; set; }
}
