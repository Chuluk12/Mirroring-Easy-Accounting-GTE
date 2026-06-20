$ErrorActionPreference = "Stop"

$destination = Split-Path -Parent $MyInvocation.MyCommand.Path
$localIp = (
  Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike "169.254*" -and $_.IPAddress -ne "127.0.0.1" } |
    Select-Object -First 1 -ExpandProperty IPAddress
)
if (-not $localIp) {
  $localIp = "localhost"
}

@"
EASY_DB_HOST=127.0.0.1
EASY_DB_PORT=3999
EASY_DB_PATH=D:/EASY/AQPA.EASY6
EASY_DB_USER=SYSDBA
EASY_DB_PASSWORD=NewPassword123
EASY_BACKEND_PORT=5001
"@ | Set-Content -LiteralPath (Join-Path $destination "backend\.env") -Encoding UTF8

@"
VITE_API_BASE_URL=http://$localIp:5001
VITE_API_PORT=5001
VITE_DEV_PORT=5175
VITE_PREVIEW_PORT=4175
"@ | Set-Content -LiteralPath (Join-Path $destination "frontend\.env") -Encoding UTF8

Write-Host "Selesai setup AQPA di: $destination"
Write-Host "Backend AQPA : http://0.0.0.0:5001"
Write-Host "Frontend AQPA: http://0.0.0.0:5175"
