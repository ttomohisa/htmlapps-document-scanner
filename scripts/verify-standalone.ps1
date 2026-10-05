param([string]$OutputDirectory = '')
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$DefaultDist = [IO.Path]::GetFullPath((Join-Path $Root 'dist'))
$Dist = if ($OutputDirectory) { $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDirectory) } else { $DefaultDist }
$PathComparison = if ([IO.Path]::DirectorySeparatorChar -eq '\') { [StringComparison]::OrdinalIgnoreCase } else { [StringComparison]::Ordinal }
$Output = Join-Path $Dist 'index.html'
$SelfOutput = Join-Path $Dist 'index.self-extract.html'
foreach ($path in @($Output,$SelfOutput)) { if (!(Test-Path $path)) { throw "Missing $path" } }
$html = Get-Content -Raw -Encoding UTF8 $Output
if ($html -match '__[A-Z0-9_]+__') { throw 'Unresolved build placeholder found.' }
if ($html -notmatch "connect-src 'none'") { throw "CSP must keep connect-src 'none'." }
$bad = @(
  'https?://[^\s"''<>]+\.(js|css|woff2?|ttf)(\?[^\s"''<>]*)?',
  '<script[^>]+\bsrc\s*=',
  '<link[^>]+\brel=["'']stylesheet["''][^>]+\bhref\s*=',
  '<iframe\b'
)
foreach ($pattern in $bad) { if ($html -match $pattern) { throw "Potential external runtime dependency matched: $pattern" } }
if ($html -notmatch 'APP:BEGIN' -or $html -notmatch 'APP:END') { throw 'APP markers missing.' }
$bytes = [IO.File]::ReadAllBytes($Output)
if ([string]::Equals($Dist.TrimEnd([IO.Path]::DirectorySeparatorChar), $DefaultDist.TrimEnd([IO.Path]::DirectorySeparatorChar), $PathComparison)) {
  $release = Join-Path $Root 'document-scanner.html'
  if (!(Test-Path $release) -or [Convert]::ToBase64String([IO.File]::ReadAllBytes($release)) -cne [Convert]::ToBase64String($bytes)) { throw 'Root release must exactly match dist/index.html.' }
}
$self = [IO.File]::ReadAllText($SelfOutput)
$payload = [regex]::Match($self, "const b='([^']+)'")
if (!$payload.Success) { throw 'Self-extract payload missing.' }
$compressed = [Convert]::FromBase64String($payload.Groups[1].Value)
$inputStream = New-Object IO.MemoryStream(,$compressed)
$gzip = New-Object IO.Compression.GZipStream($inputStream, [IO.Compression.CompressionMode]::Decompress)
$decoded = New-Object IO.MemoryStream
try { $gzip.CopyTo($decoded); $decodedBytes = $decoded.ToArray() }
finally { $gzip.Dispose(); $inputStream.Dispose(); $decoded.Dispose() }
if ([Convert]::ToBase64String($decodedBytes) -cne [Convert]::ToBase64String($bytes)) { throw 'Self-extract payload does not match readable HTML.' }
$manifest = Get-Content -Raw -Encoding UTF8 (Join-Path $Dist 'self-extract-manifest.json') | ConvertFrom-Json
if ($manifest.sourceSha256 -cne (Get-FileHash $Output -Algorithm SHA256).Hash.ToLowerInvariant() -or
    $manifest.selfExtractSha256 -cne (Get-FileHash $SelfOutput -Algorithm SHA256).Hash.ToLowerInvariant() -or
    $manifest.sourceBytes -ne $bytes.Length -or $manifest.compressedBytes -ne $compressed.Length -or
    $manifest.selfExtractBytes -ne ([IO.File]::ReadAllBytes($SelfOutput)).Length) { throw 'Self-extract manifest hashes or sizes do not match artifacts.' }
Write-Host 'Standalone verification passed (root parity, decoded payload, manifest hashes and sizes).'
