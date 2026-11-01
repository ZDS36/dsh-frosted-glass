# Capture a window (or the full screen) to PNG. Read-only: screenshots only.
# Usage: powershell -File shot.ps1 -Out out.png -Title "DeepSeek"   |   -Full for the whole desktop
param(
  [string]$Out = "shot.png",
  [string]$Title = "",
  [switch]$Full
)
Add-Type -AssemblyName System.Drawing, System.Windows.Forms

if ($Full -or $Title -eq "") {
  $b = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $x = $b.X; $y = $b.Y; $w = $b.Width; $h = $b.Height
} else {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
}
"@
  $p = Get-Process | Where-Object { $_.MainWindowTitle -like "*$Title*" -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if (-not $p) { Write-Error "no window matching '$Title'"; exit 1 }
  $r = New-Object W+RECT
  [void][W]::GetWindowRect($p.MainWindowHandle, [ref]$r)
  $x = $r.L; $y = $r.T; $w = $r.R - $r.L; $h = $r.B - $r.T
  Write-Host "window '$($p.MainWindowTitle)' pid=$($p.Id) ${w}x${h} at $x,$y"
}

$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($x, $y, 0, 0, (New-Object System.Drawing.Size $w, $h))
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Host "saved $Out"
