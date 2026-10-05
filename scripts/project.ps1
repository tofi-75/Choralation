<#
.SYNOPSIS
Process-scoped project tools and cache configuration shared by development tasks.
.DESCRIPTION
Dot-source this file. Every writable path is rooted inside Choralation; nothing
changes the user/system PATH, Git settings, Windows services, or profile files.
#>
$ErrorActionPreference = 'Stop'
$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))

function Assert-ProjectPath([string] $Candidate) {
    $resolved = [System.IO.Path]::GetFullPath($Candidate)
    if ($resolved -ne $ProjectRoot -and -not $resolved.StartsWith($ProjectRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing a path outside the project: $Candidate"
    }
    return $resolved
}

function Invoke-Checked([string] $Executable, [string[]] $Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE ($Executable)." }
}

foreach ($relative in @('.cache\tmp', '.cache\npm', '.cache\pip', '.local', '.local\playwright')) {
    New-Item -ItemType Directory -Force -Path (Assert-ProjectPath (Join-Path $ProjectRoot $relative)) | Out-Null
}
$env:TEMP = Join-Path $ProjectRoot '.cache\tmp'
$env:TMP = $env:TEMP
$env:PYTHONDONTWRITEBYTECODE = '1'
$env:PIP_CACHE_DIR = Join-Path $ProjectRoot '.cache\pip'
$env:PIP_DISABLE_PIP_VERSION_CHECK = '1'
$env:RUFF_CACHE_DIR = Join-Path $ProjectRoot '.cache\ruff'
$env:npm_config_cache = Join-Path $ProjectRoot '.cache\npm'
$env:npm_config_update_notifier = 'false'
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $ProjectRoot '.local\playwright'
$env:PATH = (Join-Path $ProjectRoot '.local\node') + ';' + (Join-Path $ProjectRoot '.venv\Scripts') + ';' + $env:PATH
$ProjectPython = Join-Path $ProjectRoot '.venv\Scripts\python.exe'
$ProjectNode = Join-Path $ProjectRoot '.local\node\node.exe'
$ProjectNpm = Join-Path $ProjectRoot '.local\npm\package\bin\npm-cli.js'
$ProjectPostgres = Join-Path $ProjectRoot '.local\postgres\bin'

function Invoke-Manage([string[]] $Arguments) {
    Invoke-Checked $ProjectPython (@('-B', (Join-Path $ProjectRoot 'backend\manage.py')) + $Arguments)
}

function Invoke-Npm([string[]] $Arguments) {
    Invoke-Checked $ProjectNode (@($ProjectNpm, '--prefix', (Join-Path $ProjectRoot 'frontend')) + $Arguments)
}
