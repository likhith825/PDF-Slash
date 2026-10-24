// PDF Slash! desktop app: a small Windows program that shows the toolkit (../index.html) in its own window
// using the WebView2 engine that ships with Windows 11. Built by build.ps1 with Windows' own C# compiler
// (C# 5, so no newer syntax). Nothing here talks to the internet; every web request is blocked.
using System;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

class PdfSlash : Form
{
    readonly WebView2 web;
    readonly string root;      // the anime-pdf folder
    readonly string dataDir;   // WebView2 profile: settings like Sound on/off and Tips
    readonly int testPort;     // test runs only: opens a DevTools port on 127.0.0.1

    [STAThread]
    static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new PdfSlash(args));
    }

    PdfSlash(string[] args)
    {
        root = Path.GetFullPath(Path.Combine(Application.StartupPath, ".."));
        dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PDFSlash");
        bool offscreen = false;
        foreach (string a in args)
        {
            if (a.StartsWith("--test-port=")) testPort = int.Parse(a.Substring(12));
            else if (a.StartsWith("--data=")) dataDir = a.Substring(7);
            else if (a == "--offscreen") offscreen = true;
        }

        Text = "PDF Slash!";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        BackColor = Color.FromArgb(253, 246, 227);
        MinimumSize = new Size(900, 600);
        if (offscreen)
        {
            StartPosition = FormStartPosition.Manual;
            Location = new Point(-3000, -3000);
            ClientSize = new Size(1366, 768);
        }
        else
        {
            Size = new Size(1366, 768);
            WindowState = FormWindowState.Maximized;
        }

        web = new WebView2();
        web.Dock = DockStyle.Fill;
        web.DefaultBackgroundColor = BackColor;
        Controls.Add(web);
        Load += async (s, e) => await Start();
    }

    async Task Start()
    {
        string index = Path.Combine(root, "index.html");
        if (!File.Exists(index))
        {
            MessageBox.Show("index.html was not found next to the app folder:\n" + root, "PDF Slash!", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
            return;
        }
        try
        {
            // Sound effects may play before the first click (hover sounds), like any desktop app.
            // No background network work (component updates, pings): the app stays offline and quiet.
            string flags = "--autoplay-policy=no-user-gesture-required --disable-background-networking --disable-component-update --no-pings";
            if (testPort > 0) flags += " --remote-debugging-port=" + testPort;
            var env = await CoreWebView2Environment.CreateAsync(null, dataDir, new CoreWebView2EnvironmentOptions(flags));
            await web.EnsureCoreWebView2Async(env);
        }
        catch (Exception ex)
        {
            MessageBox.Show("The Edge WebView2 engine could not start.\n\n" + ex.Message, "PDF Slash!", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
            return;
        }

        CoreWebView2 cw = web.CoreWebView2;
        cw.Settings.AreDevToolsEnabled = testPort > 0;
        cw.Settings.IsStatusBarEnabled = false;
        cw.Settings.IsPasswordAutosaveEnabled = false;
        cw.Settings.IsGeneralAutofillEnabled = false;
        cw.Settings.IsReputationCheckingRequired = false; // no SmartScreen lookups online when saving results
        cw.DocumentTitleChanged += (s, e) => { Text = cw.DocumentTitle; };
        // Offline promise: only the app's own files, blob: and data: are allowed. Links never open new windows.
        string rootUri = new Uri(root + Path.DirectorySeparatorChar).AbsoluteUri;
        cw.NavigationStarting += (s, e) =>
        {
            string u = e.Uri;
            if (!(u.StartsWith(rootUri, StringComparison.OrdinalIgnoreCase) || u.StartsWith("about:") || u.StartsWith("data:") || u.StartsWith("blob:"))) e.Cancel = true;
        };
        cw.NewWindowRequested += (s, e) => { e.Handled = true; };
        cw.AddWebResourceRequestedFilter("http://*", CoreWebView2WebResourceContext.All);
        cw.AddWebResourceRequestedFilter("https://*", CoreWebView2WebResourceContext.All);
        cw.WebResourceRequested += (s, e) => { e.Response = cw.Environment.CreateWebResourceResponse(null, 403, "Blocked: PDF Slash works offline", ""); };

        // "?app" tells the page it runs inside the desktop app.
        cw.Navigate(new Uri(index).AbsoluteUri + "?app");
    }
}
