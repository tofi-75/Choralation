<#
.SYNOPSIS
Run current backend/frontend/migration/schema gates; browser flows run separately.
#>
. (Join-Path $PSScriptRoot 'project.ps1')
Push-Location (Join-Path $ProjectRoot 'backend')
try {
    # Avoid reusing temporary directories owned by a different Windows run context.
    $checkRun = Assert-ProjectPath (Join-Path $ProjectRoot ('.cache\checks\' + [Guid]::NewGuid().ToString('N')))
    New-Item -ItemType Directory -Force -Path $checkRun | Out-Null
    Invoke-Checked $ProjectPython @('-B', '-m', 'pip', 'check')
    Invoke-Manage @('check')
    Invoke-Manage @('makemigrations', '--check', '--dry-run')
    Invoke-Checked $ProjectPython @('-B', '-m', 'ruff', 'check', '--config', 'pyproject.toml', '.', '../scripts')
    Invoke-Checked $ProjectPython @('-B', '-m', 'ruff', 'format', '--config', 'pyproject.toml', '--check', '.', '../scripts')
    Invoke-Checked $ProjectPython @('-B', '-m', 'pytest', '--basetemp', (Join-Path $checkRun 'tmp'), '-o', ('cache_dir=' + (Join-Path $checkRun 'cache')))
    New-Item -ItemType Directory -Force -Path (Join-Path $ProjectRoot '.cache\schema') | Out-Null
    Invoke-Manage @('spectacular', '--validate', '--fail-on-warn', '--file', (Join-Path $ProjectRoot '.cache\schema\openapi.yaml'))
} finally { Pop-Location }
Invoke-Npm @('run', 'typecheck')
Invoke-Npm @('run', 'test')
Invoke-Npm @('run', 'lint')
Invoke-Npm @('run', 'format:check')
Invoke-Npm @('run', 'build')
Write-Output 'Application checks passed. Run .\dev.cmd e2e for the real-browser gate.'
