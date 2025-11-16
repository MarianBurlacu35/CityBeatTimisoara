param(
    [int]$Port = 3001
)

# Prefer using npx http-server (devDependency present in package.json). If not available, fall back to Python's simple server.
Write-Output "Starting frontend static server on http://127.0.0.1:$Port"

# Try npx http-server
try{
    $npx = Get-Command npx -ErrorAction Stop
    Write-Output "Using npx http-server (from package.json devDependency)."
    # Run in background
    Start-Process -FilePath $npx.Path -ArgumentList "http-server",".","-p",$Port,"-c-1" -NoNewWindow -PassThru | ForEach-Object { Write-Output "Started http-server PID $($_.Id)" }
    return
}catch{
    Write-Output "npx not found or failed — falling back to Python http.server if available."
}

# Try Python fallback
try{
    $py = Get-Command python -ErrorAction SilentlyContinue
    if(-not $py){ $py = Get-Command python3 -ErrorAction SilentlyContinue }
    if($py){
        Write-Output "Using Python to serve files. Command: $($py.Path) -m http.server $Port"
        Start-Process -FilePath $py.Path -ArgumentList "-m","http.server",$Port -NoNewWindow -PassThru | ForEach-Object { Write-Output "Started python server PID $($_.Id)" }
        return
    }
}catch{
    # fall through
}

Write-Output "No suitable static server found. Install http-server with: npm install --save-dev http-server or install Node.js/npm to use npx, or install Python to use python -m http.server."