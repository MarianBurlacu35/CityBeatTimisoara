<#
Interactive environment setup script for CityBeatTimisoara

This script prompts for the CONTACT_OWNER_EMAIL and SMTP settings and offers to:
 - export them into the current PowerShell session (temporary for this shell), OR
 - persist them for the current Windows user using setx (persists across sessions).

Security note: persisting secrets with `setx` stores them in the user environment (not encrypted). Prefer using this only on your dev machine. For production use a proper secret store.

Usage:
  - Open PowerShell as your user (no need for admin for setx)
  - Run: .\env-setup.ps1
  - Follow prompts. Leave input empty to skip a value.
#>

function Read-PlainSecret([string]$prompt){
    Write-Host $prompt -NoNewline
    return Read-Host
}

function Read-SecureAsPlain([string]$prompt){
    # Read as secure string for privacy while typing, then convert to plain text in memory
    $s = Read-Host -AsSecureString -Prompt $prompt
    if($null -eq $s) { return "" }
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try{ return [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

Write-Host "CityBeat — Environment setup" -ForegroundColor Cyan
Write-Host "This will help you set CONTACT_OWNER_EMAIL and SMTP_* variables.\n"

# Prompt values
$owner = Read-Host -Prompt "CONTACT_OWNER_EMAIL (your Gmail where you want to receive contact messages)"
$smtpHost = Read-Host -Prompt "SMTP_HOST (e.g. smtp.gmail.com)" -Default 'smtp.gmail.com'
$smtpPort = Read-Host -Prompt "SMTP_PORT (e.g. 587)" -Default '587'
$smtpUser = Read-Host -Prompt "SMTP_USER (SMTP username/email)"
Write-Host "SMTP_PASS (enter securely). If you want to leave blank, press Enter."
$smtpPass = Read-SecureAsPlain "SMTP_PASS"
$smtpFrom = Read-Host -Prompt "SMTP_FROM (optional, what appears in From; leave empty to use SMTP_USER)"
if([string]::IsNullOrWhiteSpace($smtpFrom) -and -not [string]::IsNullOrWhiteSpace($smtpUser)){ $smtpFrom = $smtpUser }
$smtpSsl = Read-Host -Prompt "SMTP_SSL (true/false)" -Default 'true'

Write-Host "`nYou entered:" -ForegroundColor Yellow
Write-Host "  CONTACT_OWNER_EMAIL = $owner"
Write-Host "  SMTP_HOST = $smtpHost"
Write-Host "  SMTP_PORT = $smtpPort"
Write-Host "  SMTP_USER = $smtpUser"
Write-Host "  SMTP_FROM = $smtpFrom"
Write-Host "  SMTP_SSL = $smtpSsl"
if(-not [string]::IsNullOrWhiteSpace($smtpPass)){ Write-Host "  SMTP_PASS = (provided)" } else { Write-Host "  SMTP_PASS = (empty)" }

# Choose persistence
$persist = Read-Host -Prompt "Persist these values for your Windows user using setx? (y/N)"
if($persist -match '^[Yy]'){
    Write-Host "Persisting variables with setx (will be available after you open a new PowerShell window)." -ForegroundColor Green
    if(-not [string]::IsNullOrWhiteSpace($owner)){ setx CONTACT_OWNER_EMAIL "$owner" | Out-Null }
    if(-not [string]::IsNullOrWhiteSpace($smtpHost)){ setx SMTP_HOST "$smtpHost" | Out-Null }
    if(-not [string]::IsNullOrWhiteSpace($smtpPort)){ setx SMTP_PORT "$smtpPort" | Out-Null }
    if(-not [string]::IsNullOrWhiteSpace($smtpUser)){ setx SMTP_USER "$smtpUser" | Out-Null }
    if(-not [string]::IsNullOrWhiteSpace($smtpPass)){
        Write-Host "Persisting SMTP_PASS with setx — WARNING: this will store the secret in your user environment (not encrypted)." -ForegroundColor Red
        $confirmPass = Read-Host -Prompt "Confirm persist password? Type 'YES' to persist securely (makes it visible in env)"
        if($confirmPass -eq 'YES'){ setx SMTP_PASS "$smtpPass" | Out-Null } else { Write-Host "Skipping persistence of SMTP_PASS" }
    }
    if(-not [string]::IsNullOrWhiteSpace($smtpFrom)){ setx SMTP_FROM "$smtpFrom" | Out-Null }
    if(-not [string]::IsNullOrWhiteSpace($smtpSsl)){ setx SMTP_SSL "$smtpSsl" | Out-Null }

    Write-Host "Persisted. Open a new PowerShell window to use the persisted variables." -ForegroundColor Green
} else {
    Write-Host "Setting variables in the current session only (they'll be lost when you close this shell)." -ForegroundColor Green
    if(-not [string]::IsNullOrWhiteSpace($owner)){ $env:CONTACT_OWNER_EMAIL = $owner }
    if(-not [string]::IsNullOrWhiteSpace($smtpHost)){ $env:SMTP_HOST = $smtpHost }
    if(-not [string]::IsNullOrWhiteSpace($smtpPort)){ $env:SMTP_PORT = $smtpPort }
    if(-not [string]::IsNullOrWhiteSpace($smtpUser)){ $env:SMTP_USER = $smtpUser }
    if(-not [string]::IsNullOrWhiteSpace($smtpPass)){ $env:SMTP_PASS = $smtpPass }
    if(-not [string]::IsNullOrWhiteSpace($smtpFrom)){ $env:SMTP_FROM = $smtpFrom }
    if(-not [string]::IsNullOrWhiteSpace($smtpSsl)){ $env:SMTP_SSL = $smtpSsl }
    Write-Host "Session variables set. You can now start the backend from this shell." -ForegroundColor Green
}

Write-Host "\nDone. Helpful next steps:" -ForegroundColor Cyan
Write-Host "  1) Build the backend: dotnet build ./backend/EventsApi/EventsApi.csproj -c Debug"
Write-Host "  2) Start backend: Set-Location './backend/EventsApi'; .\start-backend.ps1 -Port 5000"
Write-Host "  3) Serve frontend: Set-Location '.'; .\start-frontend.ps1 -Port 3001"
Write-Host "Note: If you persisted variables, open a NEW PowerShell window before starting services to pick up setx changes." -ForegroundColor Yellow
