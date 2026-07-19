using Microsoft.Extensions.Options;
using MyBantu.Application.Abstractions;
using MyBantu.Application.Documents;
using MyBantu.Infrastructure.Configuration;

namespace MyBantu.Infrastructure.Storage;

/// <summary>
/// Stores originals under &lt;DataDirectory&gt;/documents with application-generated
/// names. Stored names are validated against a strict pattern — user input never
/// becomes a filesystem path (ARCHITECTURE.md §13).
/// </summary>
public sealed class LocalDocumentFileStore : IDocumentFileStore
{
    private readonly string _documentsDir;

    public LocalDocumentFileStore(IOptions<MyBantuOptions> options)
    {
        _documentsDir = Path.GetFullPath(Path.Combine(options.Value.DataDirectory, "documents"));
        Directory.CreateDirectory(_documentsDir);
    }

    private string Resolve(string storedFileName)
    {
        if (!System.Text.RegularExpressions.Regex.IsMatch(storedFileName, "^doc-[a-f0-9]{32}\\.[a-z]{3,4}$"))
        {
            throw new ArgumentException("Invalid stored file name.", nameof(storedFileName));
        }
        return Path.Combine(_documentsDir, storedFileName);
    }

    public async Task<StoredFile> SaveAsync(string storedFileName, Stream content, CancellationToken cancellationToken)
    {
        var path = Resolve(storedFileName);
        var (sha256, size) = await DocumentService.HashToFileAsync(content, path, cancellationToken);
        return new StoredFile(path, sha256, size);
    }

    public string GetAbsolutePath(string storedFileName) => Resolve(storedFileName);

    public void Delete(string storedFileName)
    {
        var path = Resolve(storedFileName);
        if (File.Exists(path))
        {
            File.Delete(path);
        }
    }
}
