# Donne un numéro de version à cette mise en ligne (Windows / PowerShell)
# Même rôle que stamp.sh : ?v=AAAAMMJJ-HHMMSS sur les scripts/styles de index.html,
# <meta name="app-version"> (lu par js/util.js → window.APP_VERSION) et version.json. Lancer depuis le dossier du site :
#   powershell -ExecutionPolicy Bypass -File outils/stamp.ps1
$ErrorActionPreference = 'Stop'
$site = Split-Path -Parent $PSScriptRoot   # ce script est dans outils/
Set-Location -LiteralPath $site
$v = Get-Date -Format 'yyyyMMdd-HHmmss'
$utf8 = New-Object System.Text.UTF8Encoding($false)   # UTF-8 sans BOM
$path = Join-Path $site 'index.html'
$html = [System.IO.File]::ReadAllText($path, $utf8)
$html = [regex]::Replace($html, '\?v=[A-Za-z0-9_-]+"', "?v=$v`"")
$html = [regex]::Replace($html, '<meta name="app-version" content="[^"]*">', "<meta name=`"app-version`" content=`"$v`">")
[System.IO.File]::WriteAllText($path, $html, $utf8)
[System.IO.File]::WriteAllText((Join-Path $site 'version.json'), "{ `"v`": `"$v`" }`n", $utf8)
Write-Output $v
