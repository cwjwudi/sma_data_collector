param(
    [Parameter(Mandatory = $true)]
    [int]$ProcessId,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [int]$IntervalSeconds = 300,

    [int]$DurationSeconds = 86400
)

$startedAt = Get-Date
$parent = Split-Path -Parent $OutputPath
if ($parent -and -not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
}

if (-not (Test-Path -LiteralPath $OutputPath)) {
    'captured_at,elapsed_seconds,pid,cpu_seconds,working_set_bytes,threads,handles,status' |
        Set-Content -LiteralPath $OutputPath -Encoding utf8
}

while (((Get-Date) - $startedAt).TotalSeconds -lt $DurationSeconds) {
    $capturedAt = Get-Date
    $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        '"{0}",{1},{2},,,,,"exited"' -f
            $capturedAt.ToString('o'),
            [math]::Round(($capturedAt - $startedAt).TotalSeconds, 1),
            $ProcessId |
            Add-Content -LiteralPath $OutputPath -Encoding utf8
        break
    }

    '"{0}",{1},{2},{3},{4},{5},{6},"running"' -f
        $capturedAt.ToString('o'),
        [math]::Round(($capturedAt - $startedAt).TotalSeconds, 1),
        $ProcessId,
        [math]::Round($process.CPU, 3),
        $process.WorkingSet64,
        $process.Threads.Count,
        $process.Handles |
        Add-Content -LiteralPath $OutputPath -Encoding utf8

    Start-Sleep -Seconds $IntervalSeconds
}
