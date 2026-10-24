# Makes small sample files for testing PDF Slash! (no installs, no Python/Node).
# Run:  powershell -ExecutionPolicy Bypass -File make-tests.ps1
$ErrorActionPreference = 'Stop'
$dir = $PSScriptRoot
$ascii = [System.Text.Encoding]::ASCII

# Builds a PDF from a list of pages: @{ w; h; rotate; content }. Every byte is ASCII, so string length = byte offset.
function New-Pdf($pages, [string]$extraTrailer = '', [string[]]$extraObjs = @()) {
  $objs = New-Object System.Collections.Generic.List[string]
  $n = $pages.Count
  $kids = (0..($n - 1) | ForEach-Object { "$(4 + 2 * $_) 0 R" }) -join ' '
  $objs.Add('<< /Type /Catalog /Pages 2 0 R >>')
  $objs.Add("<< /Type /Pages /Kids [$kids] /Count $n >>")
  $objs.Add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
  foreach ($p in $pages) {
    $num = $objs.Count + 1
    $rot = if ($p.rotate) { " /Rotate $($p.rotate)" } else { '' }
    $objs.Add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 $($p.w) $($p.h)]$rot /Resources << /Font << /F1 3 0 R >> >> /Contents $($num + 1) 0 R >>")
    $objs.Add("<< /Length $($p.content.Length) >>`nstream`n$($p.content)`nendstream")
  }
  foreach ($x in $extraObjs) { $objs.Add($x) }
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append("%PDF-1.4`n")
  $offsets = @()
  for ($i = 0; $i -lt $objs.Count; $i++) {
    $offsets += $sb.Length
    [void]$sb.Append("$($i + 1) 0 obj`n$($objs[$i])`nendobj`n")
  }
  $xref = $sb.Length
  [void]$sb.Append("xref`n0 $($objs.Count + 1)`n0000000000 65535 f `n")
  foreach ($o in $offsets) { [void]$sb.Append(('{0:D10} 00000 n ' -f $o) + "`n") }
  [void]$sb.Append("trailer`n<< /Size $($objs.Count + 1) /Root 1 0 R$extraTrailer >>`nstartxref`n$xref`n%%EOF`n")
  return $ascii.GetBytes($sb.ToString())
}

$colors = @('0.90 0.22 0.27', '0.97 0.50 0.00', '1.00 0.84 0.04', '0.20 0.45 0.85')

# A page that makes order, size and rotation easy to see: colored band at the top, big page label, arrow pointing up.
function New-Page($w, $h, $n, $sizeName, $rotate = 0) {
  $c = $colors[($n - 1) % $colors.Count]
  $cx = [int]($w / 2)
  $content = @"
0 0 0 RG 8 w 20 20 $($w - 40) $($h - 40) re S
$c rg 24 $($h - 110) $($w - 48) 86 re f
BT /F1 30 Tf 0 0 0 rg 44 $($h - 80) Td (TOP - $sizeName) Tj ET
BT /F1 90 Tf 0 0 0 rg 50 $([int]($h / 2)) Td (PAGE $n) Tj ET
BT /F1 20 Tf 0.3 0.3 0.3 rg 54 $([int]($h / 2) - 40) Td (${w} x ${h} pt  -  sample text line) Tj ET
0 0 0 rg $cx 170 m $($cx - 45) 100 l $($cx + 45) 100 l f
BT /F1 22 Tf $($cx - 18) 70 Td (UP) Tj ET
"@
  return @{ w = $w; h = $h; rotate = $rotate; content = $content }
}

function Save($name, [byte[]]$bytes) { [IO.File]::WriteAllBytes((Join-Path $dir $name), $bytes); $script:made += $name }
$made = @()

Save 'sample-3.pdf'  (New-Pdf @(1..3 | ForEach-Object { New-Page 595 842 $_ 'A4' }))
Save 'sample-12.pdf' (New-Pdf @(1..12 | ForEach-Object { New-Page 612 792 $_ 'LETTER' }))
Save 'big-50.pdf'    (New-Pdf @(1..50 | ForEach-Object { New-Page 595 842 $_ 'A4' }))
Save 'mixed-sizes.pdf' (New-Pdf @((New-Page 595 842 1 'A4'), (New-Page 612 792 2 'LETTER'), (New-Page 842 595 3 'A4 WIDE'), (New-Page 400 400 4 'SQUARE')))
Save 'rotated.pdf'   (New-Pdf @((New-Page 595 842 1 'A4'), (New-Page 595 842 2 'A4 ROT90' 90), (New-Page 595 842 3 'A4')))

# Password-protected look-alike: has an /Encrypt dictionary, so readers ask for a password.
$rnd = New-Object System.Random 42
function HexBytes($count) { -join (1..$count | ForEach-Object { '{0:x2}' -f $rnd.Next(256) }) }
$lockedPages = @((New-Page 595 842 1 'A4'), (New-Page 595 842 2 'A4'))
$encNum = 3 + 2 * $lockedPages.Count + 1
$id = HexBytes 16
Save 'locked.pdf' (New-Pdf $lockedPages " /Encrypt $encNum 0 R /ID [<$id><$id>]" @("<< /Filter /Standard /V 1 /R 2 /O <$(HexBytes 32)> /U <$(HexBytes 32)> /P -44 >>"))

# Damaged file: a PDF header followed by junk.
$junk = New-Object byte[] 2048
$rnd.NextBytes($junk)
Save 'broken.pdf' ($ascii.GetBytes("%PDF-1.4`n") + $junk)

# Images
Add-Type -AssemblyName System.Drawing
function New-Image($name, $w, $h, $label, $format) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::FromArgb(255, 214, 10))
  $red = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(230, 57, 70))
  $g.FillRectangle($red, 0, 0, $w, [int]($h / 3))
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::Black), 12
  $g.DrawRectangle($pen, 6, 6, $w - 12, $h - 12)
  $font = New-Object System.Drawing.Font 'Arial Black', 40
  $g.DrawString($label, $font, [System.Drawing.Brushes]::Black, 30, [int]($h / 2))
  $g.Dispose(); $red.Dispose(); $pen.Dispose(); $font.Dispose()
  $bmp.Save((Join-Path $dir $name), $format)
  $bmp.Dispose()
  $script:made += $name
}
New-Image 'photo-wide.jpg' 800 500 'IMG 1 WIDE' ([System.Drawing.Imaging.ImageFormat]::Jpeg)
New-Image 'photo-tall.png' 400 600 'IMG 2' ([System.Drawing.Imaging.ImageFormat]::Png)

# samples.js lets selftest.html read the samples from file:// with a plain <script> tag.
$lines = foreach ($name in $made) {
  "  '$name': '" + [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $dir $name))) + "',"
}
$js = "// Generated by make-tests.ps1. Base64 copies of the sample files.`nwindow.SAMPLES = {`n" + ($lines -join "`n") + "`n};`n"
[IO.File]::WriteAllText((Join-Path $dir 'samples.js'), $js, $ascii)

foreach ($name in $made + 'samples.js') { '{0,-18} {1,8:N0} bytes' -f $name, (Get-Item (Join-Path $dir $name)).Length }
