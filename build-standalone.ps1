$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourcePath = Join-Path $Root 'src\index.template.html'
$ConfigPath = Join-Path $Root 'app.config.json'
$Dist = Join-Path $Root 'dist'
$Output = Join-Path $Dist 'index.html'
$SelfOutput = Join-Path $Dist 'index.self-extract.html'

New-Item -ItemType Directory -Force -Path $Dist | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($false)
$source = [IO.File]::ReadAllText($SourcePath, $utf8)
$configRaw = [IO.File]::ReadAllText($ConfigPath, $utf8)
$config = $configRaw | ConvertFrom-Json
$manifestObj = [ordered]@{
  name = $config.name
  version = $config.version
  generatedAtUtc = [DateTime]::UtcNow.ToString('o')
  dependencyCount = 0
  runtimeNetworkBlocked = $true
}
$manifest = $manifestObj | ConvertTo-Json -Compress

foreach ($token in @('__APP_CONFIG_JSON__','__BUILD_MANIFEST_JSON__','__EMBEDDED_ASSET_BUNDLE_BASE64__')) {
  $count = ([regex]::Matches($source, [regex]::Escape($token))).Count
  if ($count -ne 1) { throw "Expected exactly one $token placeholder, found $count." }
}

$html = $source.Replace('__APP_CONFIG_JSON__', $configRaw.Trim())
$html = $html.Replace('__BUILD_MANIFEST_JSON__', $manifest)
$html = $html.Replace('__EMBEDDED_ASSET_BUNDLE_BASE64__', '"e30="')
[IO.File]::WriteAllText($Output, $html, $utf8)
[IO.File]::WriteAllText((Join-Path $Dist 'build-manifest.json'), ($manifestObj | ConvertTo-Json -Depth 4), $utf8)
[IO.File]::WriteAllText((Join-Path $Dist '.nojekyll'), '', $utf8)
$dependencyManifest = [ordered]@{
  generatedAtUtc = $manifestObj.generatedAtUtc
  dependencies = @()
}
[IO.File]::WriteAllText((Join-Path $Dist 'dependency-manifest.json'), ($dependencyManifest | ConvertTo-Json -Depth 4), $utf8)

$bytes = $utf8.GetBytes($html)
$memory = New-Object IO.MemoryStream
$gzip = New-Object IO.Compression.GZipStream($memory, [IO.Compression.CompressionMode]::Compress, $true)
$gzip.Write($bytes, 0, $bytes.Length)
$gzip.Dispose()
$compressed = $memory.ToArray()
$memory.Dispose()
$b64 = [Convert]::ToBase64String($compressed)
$self = @"
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="light"><meta http-equiv="Content-Security-Policy" content="default-src 'self' data: blob:; script-src 'unsafe-inline' 'self' blob:; style-src 'unsafe-inline' 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'"><title>$($config.name)</title></head><body><noscript>JavaScript is required.</noscript><script>(async()=>{const b='$b64',raw=Uint8Array.from(atob(b),c=>c.charCodeAt(0));if(!('DecompressionStream'in window)){document.body.textContent='This browser does not support DecompressionStream. Open dist/index.html instead.';return}const stream=new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'));const html=await new Response(stream).text();document.open();document.write(html);document.close()})().catch(e=>{document.body.textContent='Failed to open standalone app: '+e.message})</script></body></html>
"@
[IO.File]::WriteAllText($SelfOutput, $self, $utf8)
$sha = [Security.Cryptography.SHA256]::Create()
try {
  $htmlHash = ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
  $selfBytes = $utf8.GetBytes($self)
  $selfHash = ([BitConverter]::ToString($sha.ComputeHash($selfBytes))).Replace('-', '').ToLowerInvariant()
} finally { $sha.Dispose() }
$selfManifest = [ordered]@{
  generatedAtUtc = $manifestObj.generatedAtUtc
  sourceBytes = $bytes.Length
  compressedBytes = $compressed.Length
  selfExtractBytes = $selfBytes.Length
  sourceSha256 = $htmlHash
  selfExtractSha256 = $selfHash
}
[IO.File]::WriteAllText((Join-Path $Dist 'self-extract-manifest.json'), ($selfManifest | ConvertTo-Json -Depth 4), $utf8)
Write-Host "Built $Output"
Write-Host "Built $SelfOutput"
