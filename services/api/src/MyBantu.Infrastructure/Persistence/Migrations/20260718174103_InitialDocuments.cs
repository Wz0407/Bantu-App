using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyBantu.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialDocuments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Documents",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    OriginalFileName = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    StoredFileName = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    MimeType = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    Sha256 = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    SizeBytes = table.Column<long>(type: "INTEGER", nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 16, nullable: false),
                    DetectedLanguage = table.Column<string>(type: "TEXT", maxLength: 10, nullable: true),
                    PageCount = table.Column<int>(type: "INTEGER", nullable: true),
                    ChunkCount = table.Column<int>(type: "INTEGER", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    IndexedAtUtc = table.Column<DateTimeOffset>(type: "TEXT", nullable: true),
                    ErrorCode = table.Column<string>(type: "TEXT", maxLength: 40, nullable: true),
                    ErrorMessage = table.Column<string>(type: "TEXT", nullable: true),
                    Warnings = table.Column<string>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Documents", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Documents_Sha256",
                table: "Documents",
                column: "Sha256",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Documents");
        }
    }
}
