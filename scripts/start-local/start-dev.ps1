# Starts the MyBantu local development stack (Windows PowerShell).
# Starts: Document AI service, ASP.NET Core API, React dev server.
# All services bind to loopback only.
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")

# Both services MUST share one absolute data/models root (relative "./data"
# resolves against each process's own working directory and would split storage).
$env:MYBANTU_DATA_DIR = "$root\data"
$env:MYBANTU_MODELS_DIR = "$root\models"
$env:MyBantu__DataDirectory = "$root\data"

Write-Host "Building shared types..."
npm run build --prefix "$root" -w @mybantu/shared-types

Write-Host "Building Document AI service..."
npm run build --prefix "$root" -w @mybantu/document-ai

Write-Host "Starting Document AI service (http://127.0.0.1:5210)..."
Start-Process -FilePath "node" -ArgumentList "`"$root\services\document-ai\dist\server.js`"" -WorkingDirectory "$root\services\document-ai"

Write-Host "Starting ASP.NET Core API (http://127.0.0.1:5100)..."
Start-Process -FilePath "dotnet" -ArgumentList "run --project `"$root\services\api\src\MyBantu.Api`"" -WorkingDirectory "$root\services\api"

Write-Host "Starting React dev server (http://127.0.0.1:5173)..."
npm run dev --prefix "$root" -w @mybantu/web
