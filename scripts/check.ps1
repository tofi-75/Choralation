<#
.SYNOPSIS
Run M1 backend/frontend/migration/schema gates; browser flows run separately.
#>
. (Join-Path $PSScriptRoot 'project.ps1')
Push-Location (Join-Path $ProjectRoot 'backend')
try {
    Invoke-Checked $ProjectPython @('-B', '-m', 'pip', 'check')
    Invoke-Manage @('check')
    Invoke-Manage @('makemigrations', '--check', '--dry-run')
    Invoke-Checked $ProjectPython @('-B', '-m', 'ruff', 'check', '.', '../scripts')
    Invoke-Checked $ProjectPython @('-B', '-m', 'ruff', 'format', '--check', '.', '../scripts')
    Invoke-Checked $ProjectPython @('-B', '-m', 'pytest', '--basetemp', (Join-Path $ProjectRoot '.cache\pytest-tmp'))
    New-Item -ItemType Directory -Force -Path (Join-Path $ProjectRoot '.cache\schema') | Out-Null
    Invoke-Manage @('spectacular', '--validate', '--fail-on-warn', '--file', (Join-Path $ProjectRoot '.cache\schema\openapi.yaml'))
} finally { Pop-Location }
Invoke-Npm @('run', 'typecheck')
Invoke-Npm @('run', 'test')
Invoke-Npm @('run', 'lint')
Invoke-Npm @('run', 'format:check')
Invoke-Npm @('run', 'build')
Write-Output 'M1 checks passed. Run .\scripts\dev.ps1 e2e for the real-browser gate.'
