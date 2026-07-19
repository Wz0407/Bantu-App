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
    /// Directory containing the CTranslate2 translation model (installed by
    /// scripts/model-setup). Empty means the native translation engine reports
    /// NotConfigured and translation requests fail honestly.
    /// </summary>
    public string? TranslationModelDirectory { get; set; }

    /// <summary>
    /// Optional absolute path to the trilingua native library. When empty the
    /// default OS library probing is used (app directory, PATH).
    /// </summary>
    public string? TrilinguaLibraryPath { get; set; }

    /// <summary>Maximum accepted translation input length in characters.</summary>
    [Range(1, 100_000)]
    public int TranslationMaxInputChars { get; set; } = 5000;

    /// <summary>Maximum accepted document upload size in bytes (UC-02 configurable limit).</summary>
    [Range(1, 500 * 1024 * 1024)]
    public long MaxUploadBytes { get; set; } = 20 * 1024 * 1024;

    /// <summary>Seconds allowed for a single Document AI ingestion call.</summary>
    [Range(5, 600)]
    public int DocumentAiTimeoutSeconds { get; set; } = 180;
}
