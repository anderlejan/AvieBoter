using System.Diagnostics;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using AvieBoter.Core;

namespace AvieBoter.UI;

/// <summary>WebView2 set-up: the app's wwwroot is served as https://app.avieboter.local/, other links open outside.</summary>
public static class WebHost
{
    public const string Host = "app.avieboter.local";
    public const string Origin = "https://" + Host;
    static Task<CoreWebView2Environment>? env;
    public static Task<CoreWebView2Environment> Environment() => env ??= CoreWebView2Environment.CreateAsync(null, AppPaths.WebViewDir);

    public static async Task Init(WebView2 web)
    {
        await web.EnsureCoreWebView2Async(await Environment());
        var core = web.CoreWebView2;
        core.Settings.AreDevToolsEnabled = Debugger.IsAttached || System.Environment.GetEnvironmentVariable("SLBM_DEVTOOLS") == "1";
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.IsZoomControlEnabled = false;
        core.SetVirtualHostNameToFolderMapping(Host, AppPaths.WwwRoot, CoreWebView2HostResourceAccessKind.DenyCors);
        core.NewWindowRequested += (_, e) => { e.Handled = true; OpenOutside(e.Uri); };
        core.NavigationStarting += (_, e) =>
        {
            if (e.Uri.StartsWith(Origin, StringComparison.OrdinalIgnoreCase) || e.Uri.StartsWith("about:") || e.Uri.StartsWith("data:")) return;
            e.Cancel = true;
            OpenOutside(e.Uri);
        };
    }

    public static void OpenOutside(string uri)
    {
        if (!uri.StartsWith("https://") && !uri.StartsWith("http://") && !uri.StartsWith("secondlife://")) return;
        try { Process.Start(new ProcessStartInfo(uri) { UseShellExecute = true }); } catch { }
    }
}
