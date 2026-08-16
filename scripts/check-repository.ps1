$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
& (Join-Path $Root 'build-standalone.ps1')
& (Join-Path $Root 'scripts\verify-standalone.ps1')
if (!(Test-Path (Join-Path $Root 'README.md'))) { throw 'README.md missing' }
if (!(Test-Path (Join-Path $Root 'README.ja.md'))) { throw 'README.ja.md missing' }
if (!(Test-Path (Join-Path $Root 'APP_SPEC.md'))) { throw 'APP_SPEC.md missing' }
Write-Host 'Repository check passed.'
