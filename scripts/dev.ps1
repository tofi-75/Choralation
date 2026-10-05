<#
.SYNOPSIS
Project-local M1 tasks. Run from any directory; servers run in the foreground.
.EXAMPLE
.\scripts\dev.ps1 db-start
.EXAMPLE
.\scripts\dev.ps1 backend
#>
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('setup', 'db-start', 'db-stop', 'migrate', 'admin', 'roles', 'backend', 'frontend', 'check', 'e2e')]
    [string] $Task
)
. (Join-Path $PSScriptRoot 'project.ps1')
Push-Location $ProjectRoot
try {
    switch ($Task) {
        'setup' { & (Join-Path $PSScriptRoot 'bootstrap.ps1') }
        'db-start' {
            $data = Assert-ProjectPath (Join-Path $ProjectRoot '.local\pgdata')
            if (-not (Test-Path -LiteralPath (Join-Path $data 'PG_VERSION'))) {
                $passwordFile = Join-Path $ProjectRoot '.local\postgres-password.txt'
                if (-not (Test-Path -LiteralPath $passwordFile)) { throw 'Run setup first, or supply .local/postgres-password.txt matching your local .env.' }
                Invoke-Checked (Join-Path $ProjectPostgres 'initdb.exe') @('-D', $data, '-U', 'choralation', '--encoding=UTF8', '--locale=C', '--auth=scram-sha-256', '--pwfile', $passwordFile)
            }
            & (Join-Path $ProjectPostgres 'pg_ctl.exe') status -D $data *> $null
            if ($LASTEXITCODE -ne 0) { Invoke-Checked (Join-Path $ProjectPostgres 'pg_ctl.exe') @('start', '-D', $data, '-l', (Join-Path $ProjectRoot '.local\postgres.log'), '-o', '-h 127.0.0.1 -p 55432', '-w') }
            Invoke-Checked $ProjectPython @('-B', (Join-Path $PSScriptRoot 'ensure-database.py'))
        }
        'db-stop' { Invoke-Checked (Join-Path $ProjectPostgres 'pg_ctl.exe') @('stop', '-D', (Join-Path $ProjectRoot '.local\pgdata'), '-m', 'fast', '-w') }
        'migrate' { Invoke-Manage @('migrate', '--noinput') }
        'admin' { Invoke-Manage @('createsuperuser') }
        'roles' { Invoke-Manage @('provision_roles') }
        'backend' { Invoke-Manage @('runserver', '127.0.0.1:8000', '--noreload') }
        'frontend' { Invoke-Npm @('run', 'dev') }
        'check' { & (Join-Path $PSScriptRoot 'check.ps1') }
        'e2e' { & (Join-Path $PSScriptRoot 'e2e.ps1') }
    }
} finally { Pop-Location }
