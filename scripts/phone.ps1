<#
.SYNOPSIS
Run one local server for same-Wi-Fi physical-phone acceptance.
.DESCRIPTION
Start the database, then run backend and frontend in separate terminals.
The frontend builds optimized assets before serving them on the LAN, avoiding
development module waterfalls on phones. Django normally stays on loopback;
the optional DirectBackend switch exposes Django on port 8000 for an isolated
connection test. PostgreSQL always stays on loopback.
Overrides apply to child processes only. No .env, firewall, network profile,
saved execution policy, or machine settings are changed.
.EXAMPLE
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\phone.ps1 backend -LanAddress 192.168.1.95
.EXAMPLE
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\phone.ps1 backend -LanAddress 192.168.1.95 -DirectBackend
#>
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('backend', 'frontend')]
    [string] $Server,
    [Parameter(Mandatory=$true)]
    [string] $LanAddress,
    [switch] $DirectBackend
)
. (Join-Path $PSScriptRoot 'project.ps1')

# Require an assigned IPv4 address, never a wildcard host or arbitrary origin.
$phoneAddress = $null
if (-not [System.Net.IPAddress]::TryParse($LanAddress, [ref]$phoneAddress) -or
    $phoneAddress.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork -or
    [System.Net.IPAddress]::IsLoopback($phoneAddress)) {
    throw 'LanAddress must be this computer''s non-loopback IPv4 address.'
}
$LanAddress = $phoneAddress.ToString()
if (-not (Get-NetIPAddress -AddressFamily IPv4 -IPAddress $LanAddress -ErrorAction SilentlyContinue)) {
    throw "The LAN address $LanAddress is not assigned to this computer. Check ipconfig."
}

if ($DirectBackend -and $Server -ne 'backend') {
    throw 'DirectBackend is only valid for the backend server.'
}

Push-Location $ProjectRoot
try {
    if ($Server -eq 'backend') {
        # Vite preserves Host/Origin for Django session and CSRF validation.
        $env:DJANGO_ALLOWED_HOSTS = "localhost,127.0.0.1,$LanAddress"
        $env:CSRF_TRUSTED_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173,http://${LanAddress}:5173"
        $env:DJANGO_DEBUG = 'true'
        # Direct mode bypasses Vite for diagnosis; it does not alter .env or Windows.
        $phoneBackendBind = '127.0.0.1:8000'
        if ($DirectBackend) {
            $phoneBackendBind = '0.0.0.0:8000'
            $env:CSRF_TRUSTED_ORIGINS += ",http://localhost:8000,http://127.0.0.1:8000,http://${LanAddress}:8000"
        }
        Invoke-Manage @('runserver', $phoneBackendBind, '--noreload')
    } else {
        $env:PHONE_TEST_SESSION = 'true'
        $env:BACKEND_ORIGIN = 'http://127.0.0.1:8000'
        # Fail before serving if type checking or the build fails. Preview explicitly shares
        # Vite's API/health proxies; it is local testing, not production hosting.
        Invoke-Npm @('run', 'build')
        # Keep localhost usable alongside the phone URL. Django remains private.
        Invoke-Npm @('run', 'preview', '--', '--host', '0.0.0.0')
    }
} finally { Pop-Location }