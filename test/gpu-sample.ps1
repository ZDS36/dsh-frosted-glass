# Average the DSH gpu-process GPU utilisation over N one-second samples.
param([int]$Samples = 6)
$gpuPid = (Get-CimInstance Win32_Process -Filter "Name='DeepSeek Harness.exe'" |
  Where-Object { $_.CommandLine -match '--type=gpu-process' }).ProcessId
if (-not $gpuPid) { Write-Output 'no gpu-process found'; exit 1 }
$vals = @()
for ($i = 0; $i -lt $Samples; $i++) {
  $c = (Get-Counter '\GPU Engine(*)\Utilization Percentage' -ErrorAction SilentlyContinue).CounterSamples
  $sum = 0
  foreach ($s in $c) {
    if ($s.InstanceName -match "pid_${gpuPid}_") { $sum += $s.CookedValue }
  }
  $vals += $sum
  Start-Sleep -Milliseconds 1000
}
$avg = ($vals | Measure-Object -Average).Average
$max = ($vals | Measure-Object -Maximum).Maximum
Write-Output ("gpu-process pid={0} samples=[{1}] avg={2:N1}% max={3:N1}%" -f $gpuPid, (($vals | ForEach-Object { '{0:N1}' -f $_ }) -join ','), $avg, $max)
