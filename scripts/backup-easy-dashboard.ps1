param(
    [string]$BackupRoot = "",
    [int]$RetentionDays = 30
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
if (-not $BackupRoot) {
    $BackupRoot = Join-Path $ProjectRoot "backups\EasyDashboardGTE"
}
$EnvFile = Join-Path $ProjectRoot "backend\.env"
$PgDumpPath = "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe"
$SiinasFiles = @(
    (Join-Path $ProjectRoot "backend\data\Tabel Barang Lokal.xlsx"),
    (Join-Path $ProjectRoot "backend\data\Referensi Data SIinas.xlsx")
)

function Read-EnvFile {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "File konfigurasi tidak ditemukan: $Path"
    }

    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) {
            continue
        }

        $key, $value = $trimmed.Split("=", 2)
        $values[$key.Trim()] = $value.Trim().Trim('"').Trim("'")
    }
    return $values
}

function Write-BackupLog {
    param([string]$Message)

    $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Add-Content -LiteralPath (Join-Path $BackupRoot "backup.log") -Value $line
}

New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDirectory = Join-Path $BackupRoot "backup_$timestamp"
$databaseBackup = Join-Path $backupDirectory "easy_dashboard_gte.backup"

try {
    if (-not (Test-Path -LiteralPath $PgDumpPath)) {
        throw "pg_dump tidak ditemukan: $PgDumpPath"
    }

    $config = Read-EnvFile -Path $EnvFile
    foreach ($requiredKey in @("APP_DB_HOST", "APP_DB_PORT", "APP_DB_NAME", "APP_DB_USER", "APP_DB_PASSWORD")) {
        if (-not $config[$requiredKey]) {
            throw "Konfigurasi $requiredKey belum tersedia di backend/.env"
        }
    }

    New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
    $env:PGPASSWORD = $config["APP_DB_PASSWORD"]
    try {
        & $PgDumpPath `
            --host=$($config['APP_DB_HOST']) `
            --port=$($config['APP_DB_PORT']) `
            --username=$($config['APP_DB_USER']) `
            --dbname=$($config['APP_DB_NAME']) `
            --format=custom `
            --file=$databaseBackup
        if ($LASTEXITCODE -ne 0) {
            throw "pg_dump gagal dengan exit code $LASTEXITCODE"
        }
    }
    finally {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }

    foreach ($sourceFile in $SiinasFiles) {
        if (-not (Test-Path -LiteralPath $sourceFile)) {
            throw "File SIINAS tidak ditemukan: $sourceFile"
        }
        Copy-Item -LiteralPath $sourceFile -Destination $backupDirectory
    }

    $manifest = @(
        "Backup time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        "Database: $($config['APP_DB_NAME'])"
        "Database backup: $(Split-Path -Leaf $databaseBackup)"
        "Database SHA256: $((Get-FileHash -Algorithm SHA256 -LiteralPath $databaseBackup).Hash)"
    )
    foreach ($sourceFile in $SiinasFiles) {
        $copiedFile = Join-Path $backupDirectory (Split-Path -Leaf $sourceFile)
        $manifest += "$(Split-Path -Leaf $copiedFile) SHA256: $((Get-FileHash -Algorithm SHA256 -LiteralPath $copiedFile).Hash)"
    }
    Set-Content -LiteralPath (Join-Path $backupDirectory "manifest.txt") -Value $manifest

    $cutoff = (Get-Date).AddDays(-$RetentionDays)
    Get-ChildItem -LiteralPath $BackupRoot -Directory -Filter "backup_*" |
        Where-Object { $_.LastWriteTime -lt $cutoff } |
        ForEach-Object {
            $resolvedRoot = [System.IO.Path]::GetFullPath($BackupRoot).TrimEnd('\') + '\'
            $resolvedTarget = [System.IO.Path]::GetFullPath($_.FullName)
            if ($resolvedTarget.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
                Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
            }
        }

    Write-BackupLog "SUCCESS $backupDirectory"
    exit 0
}
catch {
    Write-BackupLog "FAILED $backupDirectory - $($_.Exception.Message)"
    throw
}
