# Measure GPU + renderer CPU with the DSH window minimized, then restored.
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Wn {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
$SW_MINIMIZE = 6
$SW_RESTORE = 9

function Get-RolePids {
  $rows = Get-CimInstance Win32_Process -Filter "Name='DeepSeek Harness.exe'"
  $gpu = ($rows | Where-Object { $_.CommandLine -match '--type=gpu-process' }).ProcessId
  $ren = ($rows | Where-Object { $_.CommandLine -match '--type=renderer' }).ProcessId
  return @{ gpu = $gpu; renderer = $ren }
}

function Sample([int]$seconds) {
  $roles = Get-RolePids
  $gpuVals = @()
  $cpu0 = (Get-Process -Id $roles.renderer -ErrorAction SilentlyContinue).TotalProcessorTime.TotalSeconds
  for ($i = 0; $i -lt $seconds; $i++) {
    $c = (Get-Counter '\GPU Engine(*)\Utilization Percentage' -ErrorAction SilentlyContinue).CounterSamples
    $sum = 0
    foreach ($s in $c) { if ($s.InstanceName -match "pid_$($roles.gpu)_") { $sum += $s.CookedValue } }
    $gpuVals += $sum
    Start-Sleep -Milliseconds 1000
  }
  $cpu1 = (Get-Process -Id $roles.renderer -ErrorAction SilentlyContinue).TotalProcessorTime.TotalSeconds
  $cpu = ($cpu1 - $cpu0) / $seconds * 100
  $avg = ($gpuVals | Measure-Object -Average).Average
  return "gpu avg={0:N1}% [{1}]  renderer cpu={2:N1}% of one core" -f $avg, (($gpuVals | ForEach-Object { '{0:N1}' -f $_ }) -join ','), $cpu
}

$main = Get-Process -Id 40636 -ErrorAction SilentlyContinue
if (-not $main) { $main = Get-Process | Where-Object { $_.MainWindowTitle -match 'DSH|DeepSeek' } | Select-Object -First 1 }
$h = $main.MainWindowHandle
Write-Output ("window handle {0}  iconic={1}" -f $h, [Wn]::IsIconic($h))
Write-Output ("RESTORED(now): " + (Sample 5))

[void][Wn]::ShowWindow($h, $SW_MINIMIZE)
Start-Sleep -Seconds 2
Write-Output ("iconic now = {0}" -f [Wn]::IsIconic($h))
Write-Output ("MINIMIZED: " + (Sample 6))

[void][Wn]::ShowWindow($h, $SW_RESTORE)
Start-Sleep -Seconds 2
Write-Output ("iconic after restore = {0}" -f [Wn]::IsIconic($h))
Write-Output ("RESTORED(again): " + (Sample 5))
