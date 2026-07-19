using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace MyBantu.Infrastructure.Persistence;

/// <summary>Design-time factory for `dotnet ef migrations` (never used at runtime).</summary>
public sealed class MyBantuDbContextFactory : IDesignTimeDbContextFactory<MyBantuDbContext>
{
    public MyBantuDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<MyBantuDbContext>()
            .UseSqlite("Data Source=design-time.sqlite")
            .Options;
        return new MyBantuDbContext(options);
    }
}
