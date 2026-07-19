using Microsoft.EntityFrameworkCore;
using MyBantu.Domain.Documents;

namespace MyBantu.Infrastructure.Persistence;

/// <summary>SQLite metadata store (ADR-004). Business records only — never document content.</summary>
public sealed class MyBantuDbContext(DbContextOptions<MyBantuDbContext> options) : DbContext(options)
{
    public DbSet<Document> Documents => Set<Document>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var document = modelBuilder.Entity<Document>();
        document.HasKey(d => d.Id);
        document.Property(d => d.Id).HasMaxLength(64);
        document.Property(d => d.OriginalFileName).HasMaxLength(200);
        document.Property(d => d.StoredFileName).HasMaxLength(80);
        document.Property(d => d.MimeType).HasMaxLength(50);
        document.Property(d => d.Sha256).HasMaxLength(64);
        document.Property(d => d.Status).HasConversion<string>().HasMaxLength(16);
        document.Property(d => d.DetectedLanguage).HasMaxLength(10);
        document.Property(d => d.ErrorCode).HasMaxLength(40);
        document.HasIndex(d => d.Sha256).IsUnique();
    }
}
