# Donne un numéro de version à cette mise en ligne (Windows / PowerShell)
# Même rôle que stamp.sh : ?v=AAAAMMJJ-HHMMSS sur les scripts/styles de index.html,
# window.APP_VERSION et version.json. Lancer depuis le dossier du site :
#   powershell -ExecutionPolicy Bypass -File stamp.ps1
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$v = Get-Date -Format 'yyyyMMdd-HHmmss'
$utf8 = New-Object System.Text.UTF8Encoding($false)   # UTF-8 sans BOM
$path = Join-Path $PSScriptRoot 'index.html'
$html = [System.IO.File]::ReadAllText($path, $utf8)
$html = [regex]::Replace($html, '\?v=[A-Za-z0-9_-]+"', "?v=$v`"")
$html = [regex]::Replace($html, "window\.APP_VERSION = '[^']*'", "window.APP_VERSION = '$v'")
[System.IO.File]::WriteAllText($path, $html, $utf8)
[System.IO.File]::WriteAllText((Join-Path $PSScriptRoot 'version.json'), "{ `"v`": `"$v`" }`n", $utf8)
Write-Output $v
