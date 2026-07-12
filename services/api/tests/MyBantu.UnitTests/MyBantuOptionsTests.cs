using System.ComponentModel.DataAnnotations;
using MyBantu.Infrastructure.Configuration;

namespace MyBantu.UnitTests;

public class MyBantuOptionsTests
{
    private static List<ValidationResult> Validate(MyBantuOptions options)
    {
        var results = new List<ValidationResult>();
        Validator.TryValidateObject(options, new ValidationContext(options), results, true);
        return results;
    }

    [Fact]
    public void DefaultsAreValidAndLoopbackOnly()
    {
        var options = new MyBantuOptions();
        Assert.Empty(Validate(options));
        Assert.StartsWith("http://127.0.0.1", options.DocumentAiBaseUrl);
    }

    [Fact]
    public void RejectsInvalidDocumentAiUrl()
    {
        var options = new MyBantuOptions { DocumentAiBaseUrl = "not-a-url" };
        Assert.Contains(Validate(options), r => r.MemberNames.Contains("DocumentAiBaseUrl"));
    }

    [Fact]
    public void RejectsMissingDataDirectory()
    {
        var options = new MyBantuOptions { DataDirectory = "" };
        Assert.Contains(Validate(options), r => r.MemberNames.Contains("DataDirectory"));
    }
}
