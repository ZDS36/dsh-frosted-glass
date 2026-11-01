# Resize the DSH window in 24 steps and measure the renderer CPU while it happens.
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hh, bool repaint);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$p = Get-Process -Id 40636
$h = $p.MainWindowHandle
$r = New-Object W+RECT
[void][W]::GetWindowRect($h, [ref]$r)
$x = $r.Left; $y = $r.Top; $w = $r.Right - $r.Left; $hh = $r.Bottom - $r.Top
Write-Output ("before: {0}x{1} at {2},{3}" -f $w,$hh,$x,$y)

$cpu0 = $p.TotalProcessorTime.TotalSeconds
$sw = [System.Diagnostics.Stopwatch]::StartNew()
for ($i = 1; $i -le 24; $i++) {
  $dw = [int](-260 * [math]::Sin($i / 24 * [math]::PI))
  [void][W]::MoveWindow($h, $x, $y, $w + $dw, $hh + [int]($dw * 0.4), $true)
  Start-Sleep -Milliseconds 40
}
$sw.Stop()
$p.Refresh()
$d = $p.TotalProcessorTime.TotalSeconds - $cpu0
[void][W]::MoveWindow($h, $x, $y, $w, $hh, $true)
Start-Sleep -Milliseconds 400
Write-Output ("resize burst: {0:N2}s wall, renderer cpu_s={1:N2}, one-core%={2:N1}" -f $sw.Elapsed.TotalSeconds, $d, (($d / $sw.Elapsed.TotalSeconds) * 100))
$r2 = New-Object W+RECT
[void][W]::GetWindowRect($h, [ref]$r2)
Write-Output ("restored: {0}x{1}" -f ($r2.Right - $r2.Left), ($r2.Bottom - $r2.Top))
