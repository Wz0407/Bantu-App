# One-time local setup for MyBantu development (Windows PowerShell).
# Verifies toolchain versions and installs workspace dependencies.
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")

Write-Host "Checking required tools..."
foreach ($tool in @("node", "npm", "dotnet", "cmake", "git")) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Write-Error "Required tool '$tool' was not found on PATH."
    }
}
node --version; npm --version; dotnet --version; cmake --version | Select-Object -First 1

Write-Host "Installing npm workspace dependencies..."
npm install --prefix "$root"

Write-Host "Restoring .NET solution..."
dotnet restore "$root\services\api\MyBantu.slnx"

if (-not (Test-Path "$root\.env")) {
    Copy-Item "$root\.env.example" "$root\.env"
    Write-Host "Created .env from .env.example"
}

Write-Host "Bootstrap complete. Use scripts\start-local\start-dev.ps1 to run the stack."
