$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Output = Join-Path $Root 'dist\index.html'
$SelfOutput = Join-Path $Root 'dist\index.self-extract.html'
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
Write-Host 'Standalone verification passed.'
