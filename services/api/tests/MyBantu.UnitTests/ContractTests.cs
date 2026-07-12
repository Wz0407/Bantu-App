using System.Reflection;
using System.Text.Json;
using MyBantu.Domain.Contracts;

namespace MyBantu.UnitTests;

/// <summary>
/// Contract-drift tests. These read the canonical JSON Schema files under
/// packages/contracts/schemas (copied next to the test assembly at build time)
/// and compare them against the C# domain mirror. They fail if the schema and the
/// C# contracts drift — the JSON Schemas remain the language-neutral source of truth.
/// </summary>
public class ContractTests
{
    private static readonly JsonSerializerOptions WebJson = JsonSerializerOptions.Web;

    private static readonly string SchemasDir = Path.Combine(
        Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)!,
        "contracts-schemas");

    private static JsonElement LoadSchema(string fileName)
    {
        var path = Path.Combine(SchemasDir, fileName);
        Assert.True(File.Exists(path), $"Canonical schema not found: {path}");
        using var stream = File.OpenRead(path);
        using var doc = JsonDocument.Parse(stream);
        return doc.RootElement.Clone();
    }

    private static string[] EnumValues(JsonElement enumElement) =>
        enumElement.EnumerateArray().Select(e => e.GetString()!).ToArray();

    [Fact]
    public void SupportedAndSourceLanguagesMatchSchema()
    {
        var schema = LoadSchema("language-code.schema.json");
        var defs = schema.GetProperty("$defs");

        var supported = EnumValues(defs.GetProperty("supportedLanguage").GetProperty("enum"));
        var source = EnumValues(defs.GetProperty("sourceLanguage").GetProperty("enum"));

        Assert.Equal(supported, LanguageCodes.Supported.ToArray());
        Assert.Equal(source, LanguageCodes.Source.ToArray());
    }

    [Fact]
    public void ErrorCodesMatchSchema()
    {
        var schema = LoadSchema("error-response.schema.json");
        var schemaCodes = EnumValues(
            schema.GetProperty("properties").GetProperty("code").GetProperty("enum"));

        // Every code declared in the schema must exist as a C# constant with the same value,
        // and the C# ErrorCodes must not declare codes absent from the schema.
        var csharpCodes = typeof(ErrorCodes)
            .GetFields(BindingFlags.Public | BindingFlags.Static)
            .Where(f => f is { IsLiteral: true, IsInitOnly: false })
            .Select(f => (string)f.GetRawConstantValue()!)
            .ToArray();

        Assert.Equal(schemaCodes.OrderBy(c => c), csharpCodes.OrderBy(c => c));
    }

    [Fact]
    public void ServiceAvailabilityValuesMatchSchema()
    {
        var schema = LoadSchema("service-availability.schema.json");
        var schemaValues = EnumValues(schema.GetProperty("enum"));

        var csharpValues = Enum.GetNames<ServiceAvailability>();

        Assert.Equal(schemaValues, csharpValues);
    }

    [Fact]
    public void DocumentProcessingStatusValuesMatchSchema()
    {
        var schema = LoadSchema("document-processing-status.schema.json");
        var schemaValues = EnumValues(schema.GetProperty("enum"));

        // The C# enum serializes to these lowercase JSON strings; compare the wire form.
        var csharpWireValues = Enum.GetValues<DocumentProcessingStatus>()
            .Select(v => JsonSerializer.Serialize(v).Trim('"'))
            .ToArray();

        Assert.Equal(schemaValues, csharpWireValues);
    }

    [Fact]
    public void LanguageGuardsBehaveAsSpecified()
    {
        Assert.True(LanguageCodes.IsSource("auto"));
        Assert.False(LanguageCodes.IsSupported("auto"));
        Assert.False(LanguageCodes.IsSupported("ta"));
    }

    [Fact]
    public void HealthStatusSerializesWithContractFieldNames()
    {
        var health = new HealthStatus(
            HealthLevel.Degraded, "mybantu-api", "0.1.0",
            DateTimeOffset.Parse("2026-07-12T00:00:00Z"),
            [new HealthComponent("translation-engine", ServiceAvailability.NotConfigured)]);

        var json = JsonSerializer.Serialize(health, WebJson);
        using var parsed = JsonDocument.Parse(json);
        var root = parsed.RootElement;

        Assert.Equal("degraded", root.GetProperty("status").GetString());
        Assert.Equal("mybantu-api", root.GetProperty("service").GetString());
        var component = root.GetProperty("components")[0];
        Assert.Equal("NotConfigured", component.GetProperty("availability").GetString());
    }

    [Fact]
    public void ErrorResponseSerializesWithContractFieldNames()
    {
        var error = new ErrorResponse(ErrorCodes.NotFound, "missing", Retryable: false, "corr-1");
        var json = JsonSerializer.Serialize(error, WebJson);
        using var parsed = JsonDocument.Parse(json);
        var root = parsed.RootElement;

        Assert.Equal("NOT_FOUND", root.GetProperty("code").GetString());
        Assert.False(root.GetProperty("retryable").GetBoolean());
        Assert.Equal("corr-1", root.GetProperty("correlationId").GetString());
    }
}
