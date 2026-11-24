using System.Text.Json.Nodes;
using System.Windows;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using AvieBoter.Core;

namespace AvieBoter.UI;

/// <summary>Prints or saves as PDF an HTML text (done list of the User notes) through an off-screen WebView2.</summary>
public static class Printer
{
    public static async Task<JsonNode?> Print(string html, bool pdf)
    {
        string? file = null;
        if (pdf)
        {
            var dlg = new Microsoft.Win32.SaveFileDialog { Filter = "PDF|*.pdf", FileName = $"done-list-{DateTime.Now:yyyy-MM-dd}.pdf" };
            if (dlg.ShowDialog() != true) return new JsonObject { ["cancelled"] = true };
            file = dlg.FileName;
        }
        var w = new Window { Width = 900, Height = 1100, Left = -12000, Top = 0, ShowInTaskbar = false, WindowStyle = WindowStyle.None, ShowActivated = false };
        var web = new WebView2();
        w.Content = web;
        w.Show();
        try
        {
            await web.EnsureCoreWebView2Async(await WebHost.Environment());
            web.CoreWebView2.Settings.IsScriptEnabled = false;
            var done = new TaskCompletionSource<bool>();
            web.CoreWebView2.NavigationCompleted += (_, e) => done.TrySetResult(e.IsSuccess);
            web.CoreWebView2.NavigateToString(html);
            await done.Task;
            if (file != null)
            {
                bool ok = await web.CoreWebView2.PrintToPdfAsync(file);
                return new JsonObject { ["file"] = ok ? file : null };
            }
            var status = await web.CoreWebView2.PrintAsync(null);
            return new JsonObject { ["printed"] = status == CoreWebView2PrintStatus.Succeeded };
        }
        finally { w.Close(); }
    }
}
