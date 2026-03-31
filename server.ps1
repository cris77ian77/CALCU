$port = if ($env:PORT) { $env:PORT } else { 3000 }
$root = $PSScriptRoot
$http = [System.Net.HttpListener]::new()
$http.Prefixes.Add("http://localhost:$port/")
$http.Start()
[Console]::Out.Flush()

$mimeTypes = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
}

while ($http.IsListening) {
    $ctx  = $http.GetContext()
    $path = $ctx.Request.Url.LocalPath -replace '/', [System.IO.Path]::DirectorySeparatorChar
    $path = $path.TrimStart([System.IO.Path]::DirectorySeparatorChar)
    $file = Join-Path $root $path

    # Si es directorio, buscar index.html
    if ([System.IO.Directory]::Exists($file)) {
        $file = Join-Path $file 'index.html'
    }

    if ([System.IO.File]::Exists($file)) {
        $ext  = [System.IO.Path]::GetExtension($file).ToLower()
        $mime = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { 'application/octet-stream' }
        $buf  = [System.IO.File]::ReadAllBytes($file)
        $ctx.Response.ContentType     = $mime
        $ctx.Response.ContentLength64 = $buf.Length
        $ctx.Response.StatusCode      = 200
        $ctx.Response.OutputStream.Write($buf, 0, $buf.Length)
    } else {
        $msg = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found')
        $ctx.Response.StatusCode      = 404
        $ctx.Response.ContentLength64 = $msg.Length
        $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
    }
    $ctx.Response.Close()
}
