using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Threading;
using AvieBoter.Core;
using AvieBoter.UI;

namespace AvieBoter;

public class App : Application
{
    readonly bool startHidden;
    public BotManager Bots { get; } = new();
    public SettingsStore Settings { get; } = new();
    MainWindow? main;
    Notifier notifier = null!;
    public Tray? TrayIcon => tray;
    Tray? tray;
    public bool Quitting { get; private set; }

    public App(bool startHidden)
    {
        this.startHidden = startHidden;
        ShutdownMode = ShutdownMode.OnExplicitShutdown;
        DispatcherUnhandledException += (_, e) => { Log.Error("UI", e.Exception); e.Handled = true; };
        AppDomain.CurrentDomain.UnhandledException += (_, e) => Log.Error("App", e.ExceptionObject as Exception);
    }

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        Log.Info("Start " + typeof(App).Assembly.GetName().Version);
        if (AppPaths.Migration == "moved") Log.Info("Data moved from the former name (SL Bot Manager) to " + AppPaths.DataDir);
        else if (AppPaths.Migration != "") Log.Info("Could not move the data of the former name, using it in place: " + AppPaths.Migration);
        Bots.Load();
        tray = new Tray(this);
        main = new MainWindow(this);
        if (!(startHidden && Settings.Data.StartInTray)) main.ShowAndFocus();
        // bots that an update closed are started again once (within 15 minutes of the update)
        var resume = Settings.Data.ResumeUntil is DateTime until && DateTime.Now < until ? Settings.Data.ResumeBots.ToList() : new List<string>();
        if (Settings.Data.ResumeBots.Count > 0 || Settings.Data.ResumeUntil != null)
        {
            Settings.Data.ResumeBots.Clear(); Settings.Data.ResumeUntil = null; Settings.Save();
        }
        if (resume.Count > 0) Log.Info("Restarting bots after the update: " + resume.Count);
        if (Settings.Data.StartBotsWithApp || resume.Count > 0) Bots.StartAutoBots(resume);
        Bots.Changed += () => tray?.Update(Bots);
        notifier = new Notifier(this);
        if (StartAfterLaunch != "") StartBot(StartAfterLaunch);
        Bots.ChatArrived += (r, items) => Dispatcher.BeginInvoke(() => notifier.Handle(r, items));
        AnnounceUpdated();
        // updates: once a minute after the start, then the hourly timer checks whether a day has passed
        updateTimer.Tick += async (_, _) => await AutoUpdate(false);
        updateTimer.Start();
        var first = new DispatcherTimer { Interval = TimeSpan.FromSeconds(60) };
        first.Tick += async (_, _) => { first.Stop(); await AutoUpdate(true); };
        first.Start();
    }

    // ---------- updates (GitHub releases, checked against the release's SHA256 list) ----------
    readonly DispatcherTimer updateTimer = new() { Interval = TimeSpan.FromHours(1) };
    bool installingUpdate;
    public UpdateInfo? UpdateFound { get; private set; }
    public string UpdateStatus { get; private set; } = "";
    bool AnyBotOnline => Bots.All.Any(r => r.Running);

    /// <summary>One-time notices: after an update, and after the move from the former name.</summary>
    void AnnounceUpdated()
    {
        var s = Settings.Data;
        string now = Updater.Current.ToString();
        if (AppPaths.Migration == "moved")
            tray?.ShowPopup("SL Bot Manager is now called AvieBoter", "Your bots, settings and chats were moved over. Version " + now + ".", "");
        else if (s.LastRunVersion != "" && s.LastRunVersion != now)
            tray?.ShowPopup("AvieBoter was updated to " + now, "See Help for what it can do.", "");
        if (s.LastRunVersion != now) { s.LastRunVersion = now; Settings.Save(); }
    }

    /// <summary>The hourly/at-start step: install a found update when allowed and no bot is online (a restart
    /// would drop a passenger bot from your vehicle), else check once a day.</summary>
    async Task AutoUpdate(bool atStart)
    {
        if (installingUpdate || Quitting) return;
        var s = Settings.Data;
        if (UpdateFound != null && s.InstallUpdatesAutomatically && !AnyBotOnline) { await InstallUpdateAsync(UpdateFound); return; }
        if (!s.CheckForUpdates) return;
        if (!atStart && s.LastUpdateCheck is { } last && DateTime.Now - last < TimeSpan.FromHours(23)) return;
        await CheckForUpdate();
        if (UpdateFound != null && s.InstallUpdatesAutomatically && !AnyBotOnline) await InstallUpdateAsync(UpdateFound);
    }

    public async Task CheckForUpdate()
    {
        var s = Settings.Data;
        UpdateStatus = "checking";
        PushUpdate();
        try
        {
            UpdateFound = await Updater.CheckAsync();
            s.LastUpdateCheck = DateTime.Now;
            UpdateStatus = "";
            if (UpdateFound is { } f && s.NotifiedVersion != f.Version.ToString() && !(s.InstallUpdatesAutomatically && !AnyBotOnline))
            {
                tray?.ShowPopup("AvieBoter " + f.Version + " is available", "You have " + Updater.Current
                    + ". Open AvieBoter and press Install now – running bots restart within a minute.", "");
                s.NotifiedVersion = f.Version.ToString();
            }
            Settings.Save();
        }
        catch (Exception e) { Log.Error("update check", e); UpdateStatus = "error: " + e.Message; }
        PushUpdate();
    }

    /// <summary>Downloads and verifies the installer, starts it silently and quits; the installer restarts the app
    /// and the bots that were running.</summary>
    public async Task<string?> InstallUpdateAsync(UpdateInfo u)
    {
        if (installingUpdate) return "The update is already being installed.";
        installingUpdate = true;
        try
        {
            UpdateStatus = "downloading 0%";
            PushUpdate();
            var file = await Updater.DownloadAsync(u, pct => Dispatcher.Invoke(() =>
            {
                if (pct >= 0 && "downloading " + pct + "%" != UpdateStatus) { UpdateStatus = "downloading " + pct + "%"; PushUpdate(); }
            }));
            UpdateStatus = "installing";
            PushUpdate();
            Updater.StartInstaller(file);
            Quit(forUpdate: true);
            return null;
        }
        catch (Exception e)
        {
            Log.Error("update", e);
            installingUpdate = false;
            UpdateStatus = "error: " + e.Message;
            PushUpdate();
            tray?.ShowPopup("The update failed", e.Message + " Nothing was changed.", "");
            return e.Message;
        }
    }

    public JsonObject UpdateJson() => new()
    {
        ["current"] = Updater.Current.ToString(),
        ["check"] = Settings.Data.CheckForUpdates,
        ["auto"] = Settings.Data.InstallUpdatesAutomatically,
        ["lastCheck"] = Settings.Data.LastUpdateCheck?.ToString("o"),
        ["status"] = UpdateStatus,
        ["available"] = UpdateFound == null ? null : new JsonObject { ["version"] = UpdateFound.Version.ToString(), ["page"] = UpdateFound.PageUrl },
        ["botsOnline"] = AnyBotOnline,
    };

    void PushUpdate() => main?.Post(new JsonObject { ["type"] = "update", ["update"] = UpdateJson() });

    public void HandleRemote(string cmd)
    {
        if (cmd.StartsWith("start:")) StartBot(cmd[6..]);
        else if (cmd == "quit") Quit();
        else if (cmd == "quitupdate") Quit(forUpdate: true);
        else if (cmd == "show") main?.ShowAndFocus();
    }

    public void ShowMain() => main?.ShowAndFocus();

    /// <summary>Opens the window on a bot's Chat (from a notification).</summary>
    public void OpenChat(string botId)
    {
        Settings.Data.LastBot = botId; Settings.Data.LastSection = "chat"; Settings.Save();
        main?.ShowAndFocus();
        main?.OpenSection(botId, "chat");
    }

    public bool IsViewingChat(string botId) =>
        main != null && main.IsVisible && main.IsActive && Settings.Data.LastBot == botId && Settings.Data.LastSection == "chat";

    public void FlashWindow() => main?.Flash();
    public string StartAfterLaunch { get; set; } = "";

    public void StartBot(string nameOrId)
    {
        var r = Bots.All.FirstOrDefault(x => x.Profile.Id == nameOrId || string.Equals(x.Profile.Label, nameOrId, StringComparison.OrdinalIgnoreCase));
        if (r == null) { Log.Info("--start: no bot called " + nameOrId); return; }
        if (r.Running) return;
        var err = r.Start();
        Log.Info("--start " + r.Profile.Label + (err == "" ? "" : ": " + err));
    }
    public void TestNotify() => notifier.Test();

    public void Quit(bool forUpdate = false)
    {
        if (Quitting) return;
        Quitting = true;
        if (forUpdate)
        {
            Settings.Data.ResumeBots = Bots.All.Where(r => r.Running).Select(r => r.Profile.Id).ToList();
            Settings.Data.ResumeUntil = DateTime.Now.AddMinutes(15);
            Settings.Save();
            Log.Info("Quit for an update; bots to restart: " + Settings.Data.ResumeBots.Count);
        }
        try { main?.SaveWindow(); } catch { }
        Bots.StopAll(TimeSpan.FromSeconds(6));
        tray?.Dispose();
        Log.Info("Quit");
        Shutdown();
    }
}
