# Petit serveur web local pour CollecDex (aucune installation necessaire).
# Il sert les fichiers de ce dossier sur http://localhost:8765/ et ouvre le navigateur.
# Fermer cette fenetre arrete le site.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8765
$url = "http://localhost:$port/"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)
try {
    $listener.Start()
} catch {
    # Deja lance (ou port occupe) : on ouvre simplement le navigateur
    Start-Process $url
    exit
}

Write-Host ""
Write-Host "  CollecDex est lance sur $url" -ForegroundColor Green
Write-Host "  Laisse cette fenetre ouverte pendant que tu utilises le site."
Write-Host "  Ferme-la pour arreter."
Write-Host ""
Start-Process $url

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.webp' = 'image/webp'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
    '.md'   = 'text/plain; charset=utf-8'
}
$rootFull = [System.IO.Path]::GetFullPath($root)

while ($listener.IsListening) {
    try {
        $ctx = $listener.GetContext()
    } catch {
        break
    }
    $res = $ctx.Response
    try {
        $path = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
        if ($path -eq '/' -or $path -eq '') { $path = '/index.html' }
        $rel = $path.TrimStart('/').Replace('/', '\')
        $full = [System.IO.Path]::GetFullPath((Join-Path $rootFull $rel))
        if ($full.StartsWith($rootFull) -and (Test-Path -LiteralPath $full -PathType Leaf)) {
            $bytes = [System.IO.File]::ReadAllBytes($full)
            $ext = [System.IO.Path]::GetExtension($full).ToLower()
            if ($mime.ContainsKey($ext)) { $res.ContentType = $mime[$ext] } else { $res.ContentType = 'application/octet-stream' }
            $res.Headers.Add('Cache-Control', 'no-cache')
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $res.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes('Introuvable')
            $res.OutputStream.Write($msg, 0, $msg.Length)
        }
    } catch {
        try { $res.StatusCode = 500 } catch {}
    } finally {
        try { $res.OutputStream.Close() } catch {}
    }
}
