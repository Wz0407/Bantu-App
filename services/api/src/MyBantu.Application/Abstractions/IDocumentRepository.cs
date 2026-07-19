using MyBantu.Domain.Documents;

namespace MyBantu.Application.Abstractions;

/// <summary>Persistence boundary for document metadata (SQLite behind EF Core).</summary>
public interface IDocumentRepository
{
    Task AddAsync(Document document, CancellationToken cancellationToken);

    Task<Document?> GetAsync(string documentId, CancellationToken cancellationToken);

    Task<IReadOnlyList<Document>> ListAsync(CancellationToken cancellationToken);

    Task<Document?> FindBySha256Async(string sha256, CancellationToken cancellationToken);

    Task UpdateAsync(Document document, CancellationToken cancellationToken);

    Task DeleteAsync(string documentId, CancellationToken cancellationToken);
}
