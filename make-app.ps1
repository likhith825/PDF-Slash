# Makes the "PDF Slash" app: the icon, app\PDF Slash.exe (a real Windows program that shows the toolkit
# with the WebView2 engine built into Windows 11), and shortcuts to it. Nothing is downloaded or installed.
# Run again if you move this folder:  right-click make-app.ps1 > Run with PowerShell
# Optional:  -Desktop  also puts the shortcut on the desktop,  -StartMenu  adds it to the Start menu.
param([switch]$Desktop, [switch]$StartMenu)
$ErrorActionPreference = 'Stop'
$dir = $PSScriptRoot
Add-Type -AssemblyName System.Drawing

# ---------- icon: yellow manga panel, red slash, outlined "PDF" ----------
function Draw-Icon([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAlias'
  $g.ScaleTransform($size / 256, $size / 256)
  $ink = [System.Drawing.Color]::FromArgb(17, 17, 17)
  # panel with a hard shadow
  $g.FillRectangle((New-Object System.Drawing.SolidBrush $ink), 22, 22, 228, 228)
  $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 214, 10))), 8, 8, 224, 224)
  $g.DrawRectangle((New-Object System.Drawing.Pen $ink, 12), 8, 8, 224, 224)
  # red slash with a black edge
  $g.DrawLine((New-Object System.Drawing.Pen $ink, 46), 40, 216, 216, 40)
  $g.DrawLine((New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(230, 57, 70)), 30), 40, 216, 216, 40)
  # "PDF" in Impact: white fill, thick black outline
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'
  $path.AddString('PDF', (New-Object System.Drawing.FontFamily 'Impact'), 0, 112, (New-Object System.Drawing.RectangleF 8, 14, 224, 224), $fmt)
  $outline = New-Object System.Drawing.Pen $ink, 18
  $outline.LineJoin = 'Round'
  $g.DrawPath($outline, $path)
  $g.FillPath([System.Drawing.Brushes]::White, $path)
  $g.Dispose()
  return $bmp
}
# .ico: PNG for 256 px, classic 32-bit bitmaps for the small sizes (what Windows expects there)
function Icon-Bitmap($bmp) {
  $s = $bmp.Width
  $ms = New-Object IO.MemoryStream
  $bw = New-Object IO.BinaryWriter $ms
  $bw.Write([uint32]40); $bw.Write([int32]$s); $bw.Write([int32]($s * 2)); $bw.Write([uint16]1); $bw.Write([uint16]32)
  $bw.Write([uint32]0); $bw.Write([uint32]0); $bw.Write([int32]0); $bw.Write([int32]0); $bw.Write([uint32]0); $bw.Write([uint32]0)
  for ($y = $s - 1; $y -ge 0; $y--) {   # rows bottom-up, pixels as B G R A
    for ($x = 0; $x -lt $s; $x++) { $c = $bmp.GetPixel($x, $y); $bw.Write([byte]$c.B); $bw.Write([byte]$c.G); $bw.Write([byte]$c.R); $bw.Write([byte]$c.A) }
  }
  $bw.Write((New-Object byte[] ([math]::Ceiling($s / 32) * 4 * $s)))   # empty AND mask (alpha does the work)
  $bw.Flush()
  return , $ms.ToArray()
}
$sizes = 256, 48, 32, 16
$pngs = foreach ($s in $sizes) {
  $bmp = Draw-Icon $s
  if ($s -eq 256) {
    $ms = New-Object IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $data = $ms.ToArray()
  } else {
    $data = Icon-Bitmap $bmp
  }
  $bmp.Dispose()
  , $data
}
$out = New-Object IO.MemoryStream
$w = New-Object IO.BinaryWriter $out
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $s = $sizes[$i] % 256   # 0 means 256
  $w.Write([byte]$s); $w.Write([byte]$s); $w.Write([byte]0); $w.Write([byte]0)
  $w.Write([uint16]1); $w.Write([uint16]32)
  $w.Write([uint32]$pngs[$i].Length); $w.Write([uint32]$offset)
  $offset += $pngs[$i].Length
}
foreach ($p in $pngs) { $w.Write($p) }
$w.Flush()
$icon = Join-Path $dir 'icon.ico'
[IO.File]::WriteAllBytes($icon, $out.ToArray())

# ---------- the app: app\PDF Slash.exe (built with Windows' own C# compiler) ----------
$exe = Join-Path $dir 'app\PDF Slash.exe'
& (Join-Path $dir 'app\build.ps1')   # rebuild so the exe carries the fresh icon
$shell = New-Object -ComObject WScript.Shell
function Make-Shortcut($path) {
  $lnk = $shell.CreateShortcut($path)
  $lnk.TargetPath = $exe
  $lnk.Arguments = ''
  $lnk.WorkingDirectory = Split-Path $exe
  $lnk.IconLocation = "$exe,0"
  $lnk.Description = 'PDF Slash! - offline PDF toolkit'
  $lnk.Save()
  "made: $path"
}
Make-Shortcut (Join-Path $dir 'PDF Slash.lnk')
if ($Desktop) { Make-Shortcut (Join-Path ([Environment]::GetFolderPath('Desktop')) 'PDF Slash.lnk') }
if ($StartMenu) { Make-Shortcut (Join-Path ([Environment]::GetFolderPath('Programs')) 'PDF Slash.lnk') }
