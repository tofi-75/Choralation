<#
.SYNOPSIS
Prepare portable Windows x64 tools, dependency installs, and a private local .env.
.DESCRIPTION
No installer or Windows service is run. Downloads and extraction remain inside
the project. Existing local runtimes and secrets are retained. Python/npm hashes
come from primary publisher metadata; the PostgreSQL archive hash records the
tested EDB archive. Rerun setup to install from the committed locks, not latest.
#>
. (Join-Path $PSScriptRoot 'project.ps1')

function Get-VerifiedArchive([string] $Uri, [string] $RelativePath, [string] $Sha256) {
    $target = Assert-ProjectPath (Join-Path $ProjectRoot $RelativePath)
    New-Item -ItemType Directory -Force -Path ([System.IO.Path]::GetDirectoryName($target)) | Out-Null
    if (-not (Test-Path -LiteralPath $target)) {
        Write-Host "Downloading portable runtime to $RelativePath"
        Invoke-WebRequest -Uri $Uri -OutFile $target -TimeoutSec 600
    }
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash.ToLowerInvariant() -ne $Sha256) {
        throw "Runtime checksum mismatch: $RelativePath. Remove that project-local archive and retry."
    }
    return $target
}

$pythonBase = Join-Path $ProjectRoot '.local\python\python.exe'
if (-not (Test-Path -LiteralPath $pythonBase)) {
    $archive = Get-VerifiedArchive 'https://www.python.org/ftp/python/3.14.8/python-3.14.8-amd64.zip' '.cache\downloads\python-3.14.8.zip' '4873947a8afc037846b180312b83c744a4146a851cfd316a75c3125a4d8299da'
    Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $ProjectRoot '.local\python')
}
if (-not (Test-Path -LiteralPath $ProjectPython)) { Invoke-Checked $pythonBase @('-B', '-m', 'venv', (Join-Path $ProjectRoot '.venv')) }

if (-not (Test-Path -LiteralPath $ProjectNode)) {
    # Existing supported Node is copied; its original installation remains read-only.
    $nodeSource = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeSource) { throw 'Provide an existing Node 24.19+ executable on PATH; no global install is attempted.' }
    $nodeVersion = & $nodeSource.Source --version
    if ([version]($nodeVersion.TrimStart('v')) -lt [version]'24.19.0' -or [version]($nodeVersion.TrimStart('v')) -ge [version]'25.0.0') { throw 'Node 24.19+ within the 24.x series is required.' }
    New-Item -ItemType Directory -Force -Path (Join-Path $ProjectRoot '.local\node') | Out-Null
    Copy-Item -LiteralPath $nodeSource.Source -Destination $ProjectNode
}
if (-not (Test-Path -LiteralPath $ProjectNpm)) {
    $npmArchive = Join-Path $ProjectRoot '.cache\downloads\npm-11.21.0.tgz'
    if (-not (Test-Path -LiteralPath $npmArchive)) { Invoke-WebRequest -Uri 'https://registry.npmjs.org/npm/-/npm-11.21.0.tgz' -OutFile $npmArchive -TimeoutSec 120 }
    $sri = [Convert]::ToBase64String([System.Security.Cryptography.SHA512]::HashData([System.IO.File]::ReadAllBytes($npmArchive)))
    if ($sri -ne 'Zov8KhamNneiLdELtj5YALtNmJW4L4fCLTzjfpzXG2w6MSHcf0UxgdlK5uloCuksWT+7mGUU7wi79cO6RqivPg==') { throw 'npm checksum mismatch.' }
    Invoke-Checked $ProjectPython @('-B', (Join-Path $PSScriptRoot 'extract-runtime.py'), $npmArchive, (Join-Path $ProjectRoot '.local\npm'))
}
if (-not (Test-Path -LiteralPath (Join-Path $ProjectPostgres 'postgres.exe'))) {
    $archive = Get-VerifiedArchive 'https://get.enterprisedb.com/postgresql/postgresql-18.6-1-windows-x64-binaries.zip' '.cache\downloads\postgresql-18.6.zip' 'fbe23da234ee31547bf8a36d29dfd81e82b849df2d2b78d2eecb43d360252f8c'
    Invoke-Checked $ProjectPython @('-B', (Join-Path $PSScriptRoot 'extract-runtime.py'), $archive, (Join-Path $ProjectRoot '.local\postgres'), '--postgres')
}

Invoke-Checked $ProjectPython @('-B', '-m', 'pip', 'install', '-r', (Join-Path $ProjectRoot 'backend\requirements\dev.txt'))
Invoke-Npm @('ci', '--no-fund', '--no-audit')
Invoke-Checked $ProjectPython @('-B', (Join-Path $PSScriptRoot 'local-environment.py'))
Write-Output 'Setup ready. Next: .\scripts\dev.ps1 db-start, then migrate, then admin.'
