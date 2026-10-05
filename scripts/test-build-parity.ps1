$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Fixture = Join-Path ([IO.Path]::GetTempPath()) ('scanner-build-' + [Guid]::NewGuid().ToString('N'))
$utf8 = New-Object System.Text.UTF8Encoding($false)
function Assert-SameBytes($a, $b, $message) {
  if ([Convert]::ToBase64String([IO.File]::ReadAllBytes($a)) -cne [Convert]::ToBase64String([IO.File]::ReadAllBytes($b))) { throw $message }
}
try {
  New-Item -ItemType Directory -Force -Path (Join-Path $Fixture 'src'), (Join-Path $Fixture 'scripts') | Out-Null
  foreach ($name in @('build-standalone.ps1', 'app.config.json', 'src/index.template.html', 'scripts/verify-standalone.ps1')) {
    Copy-Item (Join-Path $Root $name) (Join-Path $Fixture $name)
  }
  $release = Join-Path $Fixture 'document-scanner.html'
  $readable = Join-Path $Fixture 'dist/index.html'
  [IO.File]::WriteAllText($release, 'stale catalog release', $utf8)
  & (Join-Path $Fixture 'build-standalone.ps1')
  Assert-SameBytes $release $readable 'Default build must refresh the catalog root release alias.'
  & (Join-Path $Fixture 'scripts/verify-standalone.ps1')
  $before = @{}
  foreach ($file in @(Get-ChildItem (Join-Path $Fixture 'dist') -File -Force) + @(Get-Item $release)) {
    $before[$file.FullName] = (Get-FileHash $file.FullName -Algorithm SHA256).Hash
  }
  $custom = Join-Path $Fixture 'custom output'
  & (Join-Path $Fixture 'build-standalone.ps1') -OutputDirectory $custom
  & (Join-Path $Fixture 'scripts/verify-standalone.ps1') -OutputDirectory $custom
  foreach ($path in $before.Keys) {
    if ((Get-FileHash $path -Algorithm SHA256).Hash -cne $before[$path]) { throw "Custom build mutated $path" }
  }
  # Relative outputs follow PowerShell's location, even when its process CWD differs.
  $locationBase = Join-Path $Fixture 'location base'
  New-Item -ItemType Directory -Path $locationBase | Out-Null
  $processDirectory = [Environment]::CurrentDirectory
  Push-Location $locationBase
  try {
    [Environment]::CurrentDirectory = $Fixture
    & (Join-Path $Fixture 'build-standalone.ps1') -OutputDirectory 'relative output'
    if (!(Test-Path (Join-Path $locationBase 'relative output/index.html'))) { throw 'Relative output must follow the PowerShell location.' }
    & (Join-Path $Fixture 'scripts/verify-standalone.ps1') -OutputDirectory 'relative output'
  } finally { [Environment]::CurrentDirectory = $processDirectory; Pop-Location }
  # On case-sensitive filesystems, DIST is a custom destination, not dist.
  $caseOutput = Join-Path $Fixture 'DIST'
  if (!(Test-Path $caseOutput)) {
    $rootHash = (Get-FileHash $release -Algorithm SHA256).Hash
    & (Join-Path $Fixture 'build-standalone.ps1') -OutputDirectory $caseOutput
    if ((Get-FileHash $release -Algorithm SHA256).Hash -cne $rootHash) { throw 'Case-distinct custom output must not rewrite root release.' }
    & (Join-Path $Fixture 'scripts/verify-standalone.ps1') -OutputDirectory $caseOutput
  }
  [IO.File]::WriteAllText($release, 'stale again', $utf8)
  $rejected = $false
  try { & (Join-Path $Fixture 'scripts/verify-standalone.ps1') } catch { $rejected = $_.Exception.Message -match 'Root release.*match' }
  if (!$rejected) { throw 'Verifier must reject catalog root drift without silently rebuilding it.' }
  & (Join-Path $Fixture 'build-standalone.ps1')
  & (Join-Path $Fixture 'scripts/verify-standalone.ps1')
  Assert-SameBytes $release $readable 'Default rebuild must repair catalog drift.'
  Write-Host 'Build parity regression passed: default root, custom isolation, payload/hashes, drift rejection and repair.'
} finally {
  if (Test-Path $Fixture) { Remove-Item -Recurse -Force $Fixture }
}
