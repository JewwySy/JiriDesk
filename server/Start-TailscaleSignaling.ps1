# Keeps the signaling server running and records every start and exit in logs\signaling.log.
# The scheduled task starts this every minute; only the first copy stays, the rest exit here.
$mutex = New-Object System.Threading.Mutex($false, 'Local\JiriDeskSignaling')
try {
    if (-not $mutex.WaitOne(0)) { exit 0 }
} catch [System.Threading.AbandonedMutexException] {
    # The previous copy was killed. This one now owns the mutex.
}

# '::' also answers IPv4 and localhost, and it fails if another server has the port, so devices can't split across two servers.
$env:HOST = '::'
$env:PORT = '3001'
Set-Location -LiteralPath $PSScriptRoot
New-Item -ItemType Directory -Force -Path logs | Out-Null
$log = 'logs\signaling.log'

function Write-Log($text) {
    Add-Content -LiteralPath $log -Encoding ascii -Value "$(Get-Date -Format s) $text"
}

while ($true) {
    if ((Test-Path -LiteralPath $log) -and (Get-Item -LiteralPath $log).Length -gt 1MB) {
        Move-Item -LiteralPath $log -Destination "$log.old" -Force
    }
    Write-Log 'starting server'
    & cmd.exe /c "call `"C:\Program Files\nodejs\node.exe`" server.js >> $log 2>&1"
    Write-Log "server exited with code $LASTEXITCODE"
    Start-Sleep -Seconds 5
}
