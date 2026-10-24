# Builds "PDF Slash.exe" from PDFSlash.cs with the C# compiler that comes with Windows (.NET Framework 4.8).
# Nothing is downloaded or installed. Run:  right-click build.ps1 > Run with PowerShell
$ErrorActionPreference = 'Stop'
$dir = $PSScriptRoot
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw 'The .NET Framework C# compiler was not found.' }
$icon = Join-Path (Split-Path $dir) 'icon.ico'
Push-Location $dir
try {
  & $csc /nologo /target:winexe /platform:x64 /optimize+ "/win32icon:$icon" /win32manifest:app.manifest `
    /reference:Microsoft.Web.WebView2.Core.dll /reference:Microsoft.Web.WebView2.WinForms.dll `
    /reference:System.Windows.Forms.dll /reference:System.Drawing.dll "/out:PDF Slash.exe" PDFSlash.cs
  if ($LASTEXITCODE -ne 0) { throw "Build failed ($LASTEXITCODE)" }
  "built: $(Join-Path $dir 'PDF Slash.exe')"
} finally { Pop-Location }
