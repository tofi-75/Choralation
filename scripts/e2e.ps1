<#
.SYNOPSIS
Real-browser M1 gate with randomized users and project-local browser profiles.
.DESCRIPTION
Uses an existing Chrome/Edge executable when available (read-only), otherwise
downloads Playwright Chromium into .local/playwright. Servers are owned and
stopped by Playwright. Existing occupied application ports cause a clear failure.
#>
. (Join-Path $PSScriptRoot 'project.ps1')
$env:E2E_USER_SUFFIX = [Guid]::NewGuid().ToString('N').Substring(0, 12)
$env:E2E_PASSWORD = [Guid]::NewGuid().ToString('N') + '!Browser-Run'
foreach ($candidate in @('C:\Program Files\Google\Chrome\Application\chrome.exe', 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', 'C:\Program Files\Microsoft\Edge\Application\msedge.exe')) {
    if (Test-Path -LiteralPath $candidate) { $env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = $candidate; break }
}
if (-not $env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    Invoke-Checked $ProjectNode @((Join-Path $ProjectRoot 'frontend\node_modules\@playwright\test\cli.js'), 'install', 'chromium')
}
Invoke-Checked $ProjectPython @('-B', (Join-Path $PSScriptRoot 'e2e-users.py'), 'create')
try {
    Invoke-Npm @('run', 'test:e2e')
} finally {
    Invoke-Checked $ProjectPython @('-B', (Join-Path $PSScriptRoot 'e2e-users.py'), 'cleanup')
    Remove-Item Env:E2E_PASSWORD,Env:E2E_USER_SUFFIX -ErrorAction SilentlyContinue
}
