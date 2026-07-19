using Microsoft.EntityFrameworkCore;
using MyBantu.Application.Abstractions;
using MyBantu.Domain.Documents;

namespace MyBantu.Infrastructure.Persistence;

public sealed class SqliteDocumentRepository(MyBantuDbContext context) : IDocumentRepository
{
    public async Task AddAsync(Document document, CancellationToken cancellationToken)
    {
        context.Documents.Add(document);
        await context.SaveChangesAsync(cancellationToken);
    }

    public Task<Document?> GetAsync(string documentId, CancellationToken cancellationToken)
        => context.Documents.FirstOrDefaultAsync(d => d.Id == documentId, cancellationToken);

    public async Task<IReadOnlyList<Document>> ListAsync(CancellationToken cancellationToken)
    {
        // SQLite cannot ORDER BY DateTimeOffset server-side; sort in memory (MVP scale).
        var documents = await context.Documents.ToListAsync(cancellationToken);
        return [.. documents.OrderByDescending(d => d.CreatedAtUtc)];
    }

    public Task<Document?> FindBySha256Async(string sha256, CancellationToken cancellationToken)
        => context.Documents.FirstOrDefaultAsync(d => d.Sha256 == sha256, cancellationToken);

    public async Task UpdateAsync(Document document, CancellationToken cancellationToken)
    {
        context.Documents.Update(document);
        await context.SaveChangesAsync(cancellationToken);
        context.ChangeTracker.Clear();
    }

    public async Task DeleteAsync(string documentId, CancellationToken cancellationToken)
    {
        await context.Documents.Where(d => d.Id == documentId).ExecuteDeleteAsync(cancellationToken);
    }
}
