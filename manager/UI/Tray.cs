using System.Windows.Forms;
using AvieBoter.Core;

namespace AvieBoter.UI;

/// <summary>Tray icon: double-click opens the window; the menu starts/stops bots and quits.</summary>
public sealed class Tray : IDisposable
{
    readonly NotifyIcon icon;
    readonly App app;

    public Tray(App app)
    {
        this.app = app;
        icon = new NotifyIcon
        {
            Icon = LoadIcon(),
            Text = Program.AppName,
            Visible = true,
            ContextMenuStrip = new ContextMenuStrip(),
        };
        icon.DoubleClick += (_, _) => app.ShowMain();
        icon.MouseClick += (_, e) => { if (e.Button == MouseButtons.Left) app.ShowMain(); };
        icon.ContextMenuStrip.Opening += (_, _) => BuildMenu();
        icon.BalloonTipClicked += (_, _) => { if (popupBot != "") app.OpenChat(popupBot); else app.ShowMain(); };
        BuildMenu();
    }

    static System.Drawing.Icon LoadIcon()
    {
        try { return new System.Drawing.Icon(Path.Combine(AppPaths.AppDir, "Assets", "AvieBoter.ico")); }
        catch { return System.Drawing.SystemIcons.Application; }
    }

    void BuildMenu()
    {
        var m = icon.ContextMenuStrip!;
        m.Items.Clear();
        m.Items.Add("Open " + Program.AppName, null, (_, _) => app.ShowMain()).Font = new System.Drawing.Font(m.Font, System.Drawing.FontStyle.Bold);
        m.Items.Add(new ToolStripSeparator());
        foreach (var r in app.Bots.All)
        {
            var item = new ToolStripMenuItem($"{r.Profile.Label}  –  {Pretty(r.State)}");
            if (r.Running) item.DropDownItems.Add("Stop", null, (_, _) => Task.Run(() => r.Stop(TimeSpan.FromSeconds(6))));
            else item.DropDownItems.Add("Start", null, (_, _) => r.Start());
            m.Items.Add(item);
        }
        if (app.Bots.All.Any()) m.Items.Add(new ToolStripSeparator());
        m.Items.Add("Quit (logs all bots out)", null, (_, _) => app.Quit());
    }

    public static string Pretty(string s) => s switch
    {
        "online" => "online", "starting" => "starting", "connecting" => "logging in", "stopping" => "logging out",
        "failed" => "problem", _ => "stopped",
    };

    public void Update(BotManager bots)
    {
        int on = bots.All.Count(r => r.State == "online");
        string t = $"{Program.AppName} – {on} of {bots.All.Count()} bots online";
        try { icon.Text = t.Length > 63 ? t[..63] : t; } catch { }
    }

    string popupBot = "";

    /// <summary>A Windows notification from the tray icon; clicking it opens that bot's Chat.</summary>
    public void ShowPopup(string title, string text, string botId)
    {
        popupBot = botId;
        if (text.Length > 240) text = text[..240] + "…";
        try { icon.ShowBalloonTip(6000, title, text, ToolTipIcon.Info); } catch (Exception e) { Log.Error("Popup", e); }
    }

    public void Dispose() { icon.Visible = false; icon.Dispose(); }
}
