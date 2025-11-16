param(
    [int]$Port = 5000
)

$exe = Join-Path $PSScriptRoot 'bin\Debug\net8.0\EventsApi.exe'
if(Test-Path $exe){
    Write-Output "Using executable: $exe"

    # stop any running EventsApi processes
    $existing = Get-Process -Name EventsApi -ErrorAction SilentlyContinue
    if($existing){
        foreach($e in $existing){
            try{ Write-Output "Stopping existing EventsApi PID $($e.Id)"; Stop-Process -Id $e.Id -Force -ErrorAction Stop }
            catch{ Write-Output "Could not stop PID $($e.Id): $($_.Exception.Message)" }
        }
    }

    $out = Join-Path $PSScriptRoot 'eventsapi_out.log'
    $err = Join-Path $PSScriptRoot 'eventsapi_err.log'

    Write-Output "Starting EventsApi on http://localhost:$Port (logs: $out, $err)"
    $proc = Start-Process -FilePath $exe -ArgumentList "--urls","http://localhost:$Port" -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
    Write-Output "Started PID: $($proc.Id)"
    Write-Output "To stop: Stop-Process -Id $($proc.Id)"
} else {
    Write-Output "Executable not found: $exe"
    Write-Output "Build first: Set-Location '$PSScriptRoot'; dotnet build .\EventsApi.csproj -c Debug"
}
