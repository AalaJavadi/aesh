# AESH private backup utility. Read only. Runs locally on the account owner's Windows PC.
# No credentials/backup objects are saved to the public GitHub repository.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Required($condition, $description) { if (-not $condition) { throw $description } }
function Read-SecretPlain([string]$prompt) {
  $secure = Read-Host $prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
function New-ArchiveFolder {
  $homeDocs = [Environment]::GetFolderPath('MyDocuments')
  Required (-not [string]::IsNullOrWhiteSpace($homeDocs)) 'Documents folder is unavailable.'
  $dir = Join-Path $homeDocs ('AESH_PRIVATE_BACKUPS\supabase_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
  return $dir
}
function Storage-List([string]$projectUrl, [hashtable]$headers, [string]$bucket, [string]$prefix) {
  $offset = 0
  $collected = @()
  do {
    $bucketEncoded = [uri]::EscapeDataString($bucket)
    $url = "$projectUrl/storage/v1/object/list/$bucketEncoded"
    $body = @{ prefix = $prefix; limit = 100; offset = $offset; sortBy = @{column='name';order='asc'} } | ConvertTo-Json -Depth 5
    $items = @(Invoke-RestMethod -Method Post -Uri $url -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 45)
    foreach ($item in $items) {
      if ([string]::IsNullOrWhiteSpace([string]$item.name)) { continue }
      $full = $prefix + [string]$item.name
      if ($null -eq $item.metadata) {
        $nested = Storage-List $projectUrl $headers $bucket ($full + '/')
        $collected += @($nested)
      } else {
        $collected += $full
      }
    }
    $offset += $items.Count
  } while ($items.Count -ge 100)
  return $collected
}
function SHA256String([string]$input) {
  $hasher = [Security.Cryptography.SHA256]::Create()
  try { $bytes = [Text.Encoding]::UTF8.GetBytes($input); return ([BitConverter]::ToString($hasher.ComputeHash($bytes))).Replace('-','').ToLowerInvariant() }
  finally { $hasher.Dispose() }
}

Write-Host 'AESH / Supabase free private backup (READ ONLY)' -ForegroundColor Cyan
Write-Host 'This tool backs up database + optional private/public Storage objects locally.'
Write-Host 'Never commit the backup folder or any passwords to GitHub.'
$folder = New-ArchiveFolder
Write-Host "Destination: $folder"
$issues = New-Object 'System.Collections.Generic.List[string]'
$dump = Get-Command pg_dump.exe -ErrorAction SilentlyContinue
$restore = Get-Command pg_restore.exe -ErrorAction SilentlyContinue
if (-not $dump -or -not $restore) {
  Write-Host 'PostgreSQL command-line tools (pg_dump and pg_restore) are missing.' -ForegroundColor Yellow
  Write-Host 'Install PostgreSQL command line tools from https://www.postgresql.org/download/windows/ (or ask a technician).'
  $issues.Add('Database tools missing: no database backup made')
} else {
  $hostName = Read-Host 'Database HOST from Supabase Connect (e.g. db.xxxxx.supabase.co or session pooler hostname)'
  Required ($hostName -match '^[A-Za-z0-9.-]+$' -and $hostName -match '(\.supabase\.co|\.pooler\.supabase\.com)$') 'Only a Supabase database host is accepted.'
  $portText = Read-Host 'Database PORT (press Enter for 5432)'
  if (-not $portText) { $portText = '5432' }
  Required ($portText -match '^\d{1,5}$' -and [int]$portText -ge 1 -and [int]$portText -le 65535) 'Invalid port'
  $dbUser = Read-Host 'Database USER from Connect (e.g. postgres or postgres.project-ref)'
  Required ($dbUser -match '^[A-Za-z0-9._-]{3,100}$') 'Invalid database username'
  $dbName = Read-Host 'Database name (press Enter for postgres)'
  if (-not $dbName) { $dbName = 'postgres' }
  Required ($dbName -match '^[A-Za-z0-9_-]{3,100}$') 'Invalid database name'
  $secret = Read-SecretPlain 'Database PASSWORD (input is hidden)'
  try {
    $env:PGPASSWORD = $secret
    $out = Join-Path $folder 'database_full.dump'
    & $dump.Source --host=$hostName --port=$portText --username=$dbUser --dbname=$dbName --format=custom --no-owner --no-acl --file=$out
    if ($LASTEXITCODE -ne 0) { throw ('pg_dump failed (exit ' + $LASTEXITCODE + ')') }
    Required ((Get-Item $out).Length -gt 1000) 'Database dump unexpectedly empty'
    $listing = Join-Path $folder 'database_contents.txt'
    & $restore.Source --list $out | Out-File -FilePath $listing -Encoding UTF8
    if ($LASTEXITCODE -ne 0) { throw 'pg_restore could not read the archive' }
    $listData = Get-Content -Raw $listing
    if ($listData -notmatch 'auth' -or $listData -notmatch 'storage') {
      $issues.Add('Full database dump does not visibly include both auth and storage schema objects; review manually')
    }
    $fileSha = (Get-FileHash $out -Algorithm SHA256).Hash.ToLowerInvariant()
    Set-Content (Join-Path $folder 'database_sha256.txt') -Value "$fileSha  database_full.dump" -Encoding ascii
    Write-Host 'Database file created and archive table of contents read successfully.' -ForegroundColor Green
  } catch {
    $issues.Add('Database backup failed: ' + $_.Exception.Message)
  } finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue; $secret = $null }
}

$answer = Read-Host 'Back up Storage objects too? (YES is recommended) [Y/n]'
if ($answer -notin @('n','N','no','NO')) {
  $ref = Read-Host 'Supabase project ref (from URL: https://PROJECTREF.supabase.co)'
  Required ($ref -match '^[a-z0-9]{8,40}$') 'Invalid Supabase project ref'
  $url = 'https://' + $ref + '.supabase.co'
  $serviceKey = Read-SecretPlain 'Supabase service_role key (private; input hidden)'
  $headers = @{Authorization = "Bearer $serviceKey";apikey = $serviceKey}
  try {
    $buckets = @(Invoke-RestMethod -Method Get -Uri "$url/storage/v1/bucket" -Headers $headers -TimeoutSec 40)
    $objects = New-Object 'System.Collections.Generic.List[object]'
    $blobDir = Join-Path $folder 'storage-blobs'
    New-Item -ItemType Directory -Path $blobDir | Out-Null
    foreach ($bucket in $buckets) {
      $name = [string]$bucket.name
      $paths = @(Storage-List $url $headers $name '')
      Write-Host "Bucket: $name / objects found: $($paths.Count)"
      foreach ($objectPath in $paths) {
        $id = SHA256String ($name + '/' + $objectPath)
        $filename = $id + '.blob'
        $target = Join-Path $blobDir $filename
        $pathEncoded = (($objectPath -split '/') | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
        $bucketEncoded = [uri]::EscapeDataString($name)
        Invoke-WebRequest -Method Get -Uri "$url/storage/v1/object/authenticated/$bucketEncoded/$pathEncoded" -Headers $headers -TimeoutSec 90 -OutFile $target -UseBasicParsing | Out-Null
        $hash = (Get-FileHash $target -Algorithm SHA256).Hash.ToLowerInvariant()
        $size = (Get-Item $target).Length
        $objects.Add(@{bucket=$name;path=$objectPath;blob=$filename;bytes=$size;sha256=$hash})
      }
    }
    @{version=1;created_at=(Get-Date).ToUniversalTime().ToString('o');objects=$objects} | ConvertTo-Json -Depth 6 | Set-Content -Path (Join-Path $folder 'storage_manifest.json') -Encoding UTF8
    Write-Host "Storage backed up: $($objects.Count) objects" -ForegroundColor Green
  } catch { $issues.Add('Storage backup INCOMPLETE: '+$_.Exception.Message) }
  finally { $serviceKey = $null; $headers.Clear() }
} else { $issues.Add('Storage backup deliberately skipped; NOT a complete backup') }

if ($issues.Count -gt 0) {
  $issues | Set-Content -Path (Join-Path $folder 'BACKUP_INCOMPLETE.txt') -Encoding UTF8
  Write-Host 'Backup is NOT VERIFIED COMPLETE. Read BACKUP_INCOMPLETE.txt.' -ForegroundColor Red
  $issues | ForEach-Object { Write-Host $_ }
} else {
  Set-Content (Join-Path $folder 'BACKUP_FILES_CREATED_NOT_RESTORE_TESTED.txt') -Value 'Database archive and Storage objects were saved. A RESTORE into a separate disposable test project is still required before any migration.' -Encoding UTF8
  Write-Host 'Backup files saved. Restore verification still required.' -ForegroundColor Yellow
}
Write-Host "Files are at: $folder"
