namespace MyBantu.Domain.Contracts;

/// <summary>
/// Stable language identifiers shared across all MyBantu services
/// (mirror of packages/contracts/schemas/language-code.schema.json).
/// </summary>
public static class LanguageCodes
{
    public const string English = "en";
    public const string Malay = "ms";
    public const string Chinese = "zh";

    /// <summary>Valid only where source-language detection is allowed.</summary>
    public const string Auto = "auto";

    public static readonly IReadOnlyList<string> Supported = [English, Malay, Chinese];
    public static readonly IReadOnlyList<string> Source = [English, Malay, Chinese, Auto];

    public static bool IsSupported(string code) => Supported.Contains(code);
    public static bool IsSource(string code) => Source.Contains(code);
}
