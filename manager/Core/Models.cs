namespace AvieBoter.Core;

public class AppSettings
{
    public string Theme { get; set; } = "storm";
    public int FontPercent { get; set; } = 100;
    public bool StartInTray { get; set; } = false;
    public bool StartBotsWithApp { get; set; } = true;
    public string CloseAction { get; set; } = "tray";   // tray | quit
    public bool StartWithWindows { get; set; } = false;
    public double WinW { get; set; } = 1180;
    public double WinH { get; set; } = 760;
    public double WinX { get; set; } = double.NaN;
    public double WinY { get; set; } = double.NaN;
    public bool WinMax { get; set; }
    public string LastBot { get; set; } = "";
    public string LastSection { get; set; } = "overview";
    public bool ShowNotesButton { get; set; } = false;   // User notes: a feedback tool for whoever develops the app
    public List<string> RecentSlurls { get; set; } = new();
    public Dictionary<string, string> Ui { get; set; } = new();   // small UI choices the page remembers
    // notifications about incoming chat (also while the window is hidden)
    public bool NotifyImPopup { get; set; } = true;
    public bool NotifyImSound { get; set; } = true;
    public bool NotifyLocalPopup { get; set; } = false;
    public bool NotifyLocalSound { get; set; } = false;
    // bots that were running when an update closed the app; restarted once after the update
    public List<string> ResumeBots { get; set; } = new();
    public DateTime? ResumeUntil { get; set; }
    // updates from GitHub releases
    public bool CheckForUpdates { get; set; } = true;
    public bool InstallUpdatesAutomatically { get; set; } = true;   // only while no bot is online
    public DateTime? LastUpdateCheck { get; set; }
    public string NotifiedVersion { get; set; } = "";
    public string LastRunVersion { get; set; } = "";
}

public class BotProfile
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N")[..10];
    public string Label { get; set; } = "";
    public string Grid { get; set; } = "sl";           // sl | aditi | custom
    public string LoginUri { get; set; } = "";
    public string Username { get; set; } = "";         // "first last" or "username"
    public string PasswordProtected { get; set; } = ""; // DPAPI (current Windows user), base64
    public List<string> Masters { get; set; } = new();  // avatars allowed to command the bot
    public string Secret { get; set; } = "";
    public int Port { get; set; }
    public bool AutoStart { get; set; } = false;
    public string BotUuid { get; set; } = "";
    public string BotName { get; set; } = "";
    public bool AcceptTeleportsFromMasters { get; set; } = true;
    public bool AcceptInventoryFromMasters { get; set; } = true;
    public double HoverHeight { get; set; } = 0;
    public DateTime Created { get; set; } = DateTime.Now;
    public List<Seat> Seats { get; set; } = new();   // saved "sit on" objects, most used first in the UI
    public bool JoinConferences { get; set; } = false;  // false (default): the bot leaves conference chats at once
    public List<string> RecentOutfits { get; set; } = new();
    public bool SaveEvents { get; set; } = false;     // write comings and goings to daily files (off: only the list in the app)
    public bool AutoUpdateHud { get; set; } = true;   // HUDs made by the bot update themselves when the app has a newer one
}

public class Seat
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N")[..8];
    public string Name { get; set; } = "";
    public string Uuid { get; set; } = "";
    public string Region { get; set; } = "";
    public int Uses { get; set; }
    public DateTime? LastUsed { get; set; }
    public DateTime Added { get; set; } = DateTime.Now;
}

public class BotList
{
    public int Version { get; set; } = 1;
    public List<BotProfile> Bots { get; set; } = new();
}
