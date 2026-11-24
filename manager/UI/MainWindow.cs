using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Wpf;
using AvieBoter.Core;

namespace AvieBoter.UI;

/// <summary>The main window: a WebView2 page (wwwroot/index.html) talking to the app through postMessage RPC.</summary>
public class MainWindow : Window
{
    readonly App app;
    WebView2 web = new();
    bool webReleased;
    readonly DispatcherTimer releaseTimer = new() { Interval = TimeSpan.FromSeconds(30) };
    readonly Rpc rpc;
    readonly DispatcherTimer push;
    bool dirty = true;

    public MainWindow(App app)
    {
        this.app = app;
        Title = Program.AppName;
        var s = app.Settings.Data;
        Width = Math.Max(820, s.WinW); Height = Math.Max(560, s.WinH);
        MinWidth = 820; MinHeight = 560;
        if (!double.IsNaN(s.WinX) && !double.IsNaN(s.WinY) && OnScreen(s.WinX, s.WinY)) { Left = s.WinX; Top = s.WinY; WindowStartupLocation = WindowStartupLocation.Manual; }
        else WindowStartupLocation = WindowStartupLocation.CenterScreen;
        if (s.WinMax) WindowState = WindowState.Maximized;
        try { Icon = new System.Windows.Media.Imaging.BitmapImage(new Uri(Path.Combine(AppPaths.AppDir, "Assets", "AvieBoter.ico"))); } catch { }
        Background = new SolidColorBrush(Color.FromRgb(0x3E, 0x54, 0x70));
        Content = web;
        rpc = new Rpc(app, this);
        Loaded += async (_, _) => await InitWeb();
        Closing += (_, e) =>
        {
            SaveWindow();
            if (!app.Quitting && app.Settings.Data.CloseAction == "tray") { e.Cancel = true; Hide(); }
            else if (!app.Quitting) { e.Cancel = true; Dispatcher.BeginInvoke(() => app.Quit()); }
        };
        // While the window is hidden in the tray, its page engine (WebView2, several processes, ~450 MB) is released.
        releaseTimer.Tick += (_, _) => { releaseTimer.Stop(); if (!IsVisible) ReleaseWeb(); };
        IsVisibleChanged += (_, _) => { if (IsVisible) releaseTimer.Stop(); else releaseTimer.Start(); };
        app.Bots.Changed += () => dirty = true;
        push = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(700) };
        push.Tick += (_, _) => { if (dirty && IsVisible && web.CoreWebView2 != null) { dirty = false; Post(new JsonObject { ["type"] = "state", ["bots"] = rpc.BotsJson() }); } };
        push.Start();
    }

    static bool OnScreen(double x, double y) =>
        x > SystemParameters.VirtualScreenLeft - 50 && y > SystemParameters.VirtualScreenTop - 10 &&
        x < SystemParameters.VirtualScreenLeft + SystemParameters.VirtualScreenWidth - 100 &&
        y < SystemParameters.VirtualScreenTop + SystemParameters.VirtualScreenHeight - 60;

    async Task InitWeb()
    {
        try
        {
            await WebHost.Init(web);
            web.CoreWebView2.WebMessageReceived += async (_, e) =>
            {
                JsonObject? reply;
                try { reply = await rpc.Handle(JsonNode.Parse(e.WebMessageAsJson)!.AsObject()); }
                catch (Exception ex) { Log.Error("RPC", ex); reply = null; }
                if (reply != null) web.CoreWebView2.PostWebMessageAsJson(reply.ToJsonString());
            };
            web.CoreWebView2.Navigate(WebHost.Origin + "/index.html");
        }
        catch (Exception e)
        {
            Log.Error("WebView2", e);
            MessageBox.Show("The window could not open its page (Microsoft Edge WebView2 Runtime).\n\n" + e.Message +
                "\n\nInstall the WebView2 Runtime from Microsoft and start the app again.", Program.AppName);
        }
    }

    /// <summary>Shows a bot's section in the page (if the page is loaded; otherwise the saved settings open it).</summary>
    public void OpenSection(string botId, string section) =>
        Post(new JsonObject { ["type"] = "open", ["bot"] = botId, ["section"] = section });

    public void Flash()
    {
        if (!IsVisible || IsActive) return;
        try
        {
            var h = new System.Windows.Interop.WindowInteropHelper(this).Handle;
            var fi = new FLASHWINFO { cbSize = (uint)System.Runtime.InteropServices.Marshal.SizeOf<FLASHWINFO>(), hwnd = h, dwFlags = 3 | 12, uCount = 3, dwTimeout = 0 };
            FlashWindowEx(ref fi);   // FLASHW_ALL | FLASHW_TIMERNOFG: until the window comes to the front
        }
        catch { }
    }

    [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
    struct FLASHWINFO { public uint cbSize; public IntPtr hwnd; public uint dwFlags; public uint uCount; public uint dwTimeout; }
    [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool FlashWindowEx(ref FLASHWINFO pwfi);

    public void Post(JsonObject o) { try { web.CoreWebView2?.PostWebMessageAsJson(o.ToJsonString()); } catch { } }
    public void MarkDirty() => dirty = true;

    public void SetBackground(string hex)
    {
        try
        {
            var c = (Color)ColorConverter.ConvertFromString(hex);
            Background = new SolidColorBrush(c);
            web.DefaultBackgroundColor = System.Drawing.Color.FromArgb(c.R, c.G, c.B);
        }
        catch { }
    }

    void ReleaseWeb()
    {
        if (webReleased) return;
        try { web.Dispose(); } catch (Exception e) { Log.Error("Release WebView2", e); }
        web = new WebView2();
        Content = web;
        webReleased = true;
        Log.Info("Window hidden: page engine released");
    }

    public void ShowAndFocus()
    {
        if (webReleased)
        {
            webReleased = false;
            _ = InitWeb();
        }
        if (!IsVisible) Show();
        if (WindowState == WindowState.Minimized) WindowState = WindowState.Normal;
        Activate(); Topmost = true; Topmost = false; Focus();
        dirty = true;
    }

    public void SaveWindow()
    {
        var s = app.Settings.Data;
        s.WinMax = WindowState == WindowState.Maximized;
        var b = RestoreBounds;
        if (!b.IsEmpty && WindowState != WindowState.Minimized) { s.WinX = b.Left; s.WinY = b.Top; s.WinW = b.Width; s.WinH = b.Height; }
        app.Settings.Save();
    }
}
