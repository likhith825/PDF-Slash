# PDF Slash!

**Open PDF Slash** from the Desktop, the Start menu, or the `PDF Slash` shortcut in this folder. All three start `app\PDF Slash.exe`, a real Windows program with its own window and taskbar icon.

- **How it's built:** the app shows its screens with the Edge WebView2 engine that comes with Windows 11.
- **Settings:** your choices (Sound, Tips) are kept in `%LOCALAPPDATA%\PDFSlash`.
- **Fallback:** you can still double-click `index.html` to use it in a normal browser tab. There, sounds only start after your first click, which is a browser rule.

No install, no internet, no server, no account. Inside the app, every internet request is blocked and WebView2's background network work is switched off.

- **Pin it:** open the app, then right-click its taskbar icon and choose "Pin to taskbar".
- **Moved the folder?** Right-click `make-app.ps1`, choose "Run with PowerShell", and add `-Desktop -StartMenu` to fix those shortcuts too. It rebuilds the app and its shortcuts.
- **Remove it completely:** delete this folder, `%LOCALAPPDATA%\PDFSlash`, and the two shortcuts.

Everything happens inside that window on this PC. Your files are never uploaded anywhere. The app works with Wi-Fi off.

## How to use any tool
1. **Drop files**: drop them anywhere on the tool page, or click **Choose files**.
2. **Check options**: the defaults already work, so you can usually skip this step. Rarely needed settings are under **More options**.
3. **GO!**: the result downloads to your Downloads folder. You'll see a **DONE!** burst, or **ERROR!** with a plain explanation.

- Press **Esc** or **← Back** to return to the tool list.
- Drop a file on the home page to see only the tools that fit it.
- The **Tips** button hides or shows the mascot.
- **Sound on / Sound off** (top right) turns the sound effects on or off, and the app remembers your choice:
  - a whoosh when a tool opens or closes
  - "BAM!" when files land
  - a power-up when you press GO!
  - a ta-da for DONE! and a buzz for ERROR!
  - a light tick on buttons
  - a soft click when the mouse moves onto a tool card or button

  The sounds are made live by the browser's audio synthesizer (no sound files). The audio engine sleeps between sounds, so it uses no CPU while idle.
- Animations are short one-shots: cards slam in, panels rise, the mascot hops when it has a new tip, GO! pulses when ready, and DONE!/ERROR! burst. Nothing loops, so the app uses no CPU while idle. To turn them all off, turn off Settings → Accessibility → Visual effects → **Animation effects** in Windows.

## Tools
| Tool | What it does |
|---|---|
| Merge | Join PDFs into one, in the order you choose (↑ ↓ or drag). |
| Split | By page ranges, every page, or pages you pick from thumbnails. Several files come as one ZIP. |
| Compress | **Lossy and slow on big files.** Redraws each page as a JPEG at the quality you pick. Text becomes a picture. Shows the size before and after. |
| JPG → PDF | One JPG/PNG per page: same size as the image, or A4/Letter with a margin. |
| PDF → JPG | Save pages as JPG or PNG (several pages come as a ZIP). |
| Organize | Drag pages to reorder, turn them, or delete them. Keyboard: ← → move, R turn, Delete remove. |
| Rotate | Turn all pages, or only some, by 90°, 180° or 270°. |
| Page Numbers | 6 positions and 3 styles (`1`, `Page 1 of 9`, `1 / 9`), plus a first number. |
| Watermark | Text (size, angle, color) or an image, once in the center or tiled, see-through. |
| Edit | Add text, boxes, circles, lines and pictures on top of pages. |
| Sign | Draw or type your signature, then place it (as many times as you like). |
| Crop | Drag a box. Cut that area from the shown page or from every page. |
| Redact | Drag black boxes over private info. Those pages are flattened into pictures, so the hidden text is really gone. |
| Compare | Two PDFs side by side. Flip both together with Prev/Next or ← →. Nothing to download. |
| HTML → PDF | Paste HTML, check the safe preview (no scripts, no internet), then **PRINT!** → choose "Save as PDF". |

Boxes in Edit, Sign, Crop and Redact: drag to move, drag the yellow corner to resize. Arrow keys nudge, Shift + arrows resize, Delete removes.

Big files: anything over 50 MB or 200 pages asks before it's loaded, because it will be slow on this PC.

Text you type (Edit, Page Numbers, Watermark) uses the built-in Helvetica font, which covers English letters, numbers and common symbols. Other alphabets show a clear error instead of a broken file.

## Later (not built yet)
**OCR, PDF ↔ Word, PDF ↔ Excel, PDF ↔ PowerPoint, Protect / Unlock, PDF/A, Repair.**

These heavy tools need large extra downloads and lots of memory and CPU, so they are left out for now and don't appear in the app. Before any of them is added, Claude will tell you the download size, the cost and the limits, and wait for your yes.

## Checking that everything works
Double-click `test-files/selftest.html`. It runs every tool on the sample files, then re-opens each result in both PDF libraries to check it. Every line should say PASS.

## Files and folders
- `PDF Slash.lnk`, `icon.ico`, `make-app.ps1`: the app shortcut, its icon, and the script that makes them.
- `app/`: the desktop app.
  - `PDF Slash.exe` (30 KB) is built from `PDFSlash.cs` by `build.ps1`, using the C# compiler that comes with Windows.
  - Microsoft's three signed WebView2 connector files (about 0.9 MB) come from the Microsoft.Web.WebView2 1.0.4314.35 package on nuget.org.
- `vendor/`: the only libraries, saved locally, about 1.93 MB in total.
  - pdf-lib 1.17.1 edits PDFs.
  - pdf.js 3.11.174 draws pages.
  - A tool loads them only when it needs them. The home page loads neither.
- `tools/`: one file per tool.
- `test-files/`: sample files and test pages.
  - Run `make-tests.ps1` in PowerShell to rebuild the samples.
  - `check-home.html` and `shell-test.html` are extra checks for a browser started with `--allow-file-access-from-files`.
