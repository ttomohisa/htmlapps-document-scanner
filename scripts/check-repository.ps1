$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
& (Join-Path $Root 'build-standalone.ps1')
& (Join-Path $Root 'scripts\verify-standalone.ps1')
& (Join-Path $Root 'scripts\test-build-parity.ps1')
if (!(Test-Path (Join-Path $Root 'README.md'))) { throw 'README.md missing' }
if (!(Test-Path (Join-Path $Root 'README.ja.md'))) { throw 'README.ja.md missing' }
if (!(Test-Path (Join-Path $Root 'APP_SPEC.md'))) { throw 'APP_SPEC.md missing' }
foreach ($variant in @('src/index.template.html', 'dist/index.html', 'dist/index.self-extract.html', 'document-scanner.html')) {
  & node (Join-Path $Root 'scripts/test-workflow.cjs') (Join-Path $Root $variant)
  if ($LASTEXITCODE -ne 0) { throw "Workflow regression tests failed for $variant" }
}
Write-Host 'Repository check passed.'
