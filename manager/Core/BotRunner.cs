using System.Diagnostics;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace AvieBoter.Core;

public record LogLine(long Seq, string Time, string Text, string Kind);
public record ChatItem(long Seq, long T, string Kind, string From, string FromId, string Text, bool Out);

/// <summary>One bot: its SecondBot process, log, state, resource use and command channel (signed HTTP on 127.0.0.1).</summary>
public class BotRunner
{
    public BotProfile Profile { get; }
    readonly BotManager owner;
    Process? proc;
    public string State { get; private set; } = "stopped"; // stopped starting connecting online stopping failed waiting
    public string LastError { get; private set; } = "";
    public string LoginStep { get; private set; } = "";
    public JsonObject? Status { get; private set; }
    public double RamMb { get; private set; }
    public double CpuPercent { get; private set; }
    public DateTime? StartedAt { get; private set; }
    public DateTime? OnlineSince { get; private set; }
    bool httpReady;
    bool stopRequested;
    DateTime? inWorldAt;      // "Connected to sim" seen; the command service should follow within seconds
    TimeSpan lastCpu; DateTime lastCpuAt;
    readonly List<LogLine> log = new();
    long seq;
    static readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(60) };   // a sit can take ~25 s
    static readonly Regex Ansi = new("\x1B\\[[0-9;]*[A-Za-z]");
    System.Threading.Timer? poll;

    // chat and IMs (the bot keeps the last ones; the app keeps its own history and daily files)
    readonly List<ChatItem> chat = new();
    long chatSeq, botChatSeq, botEventSeq;
    int pollCount;
    readonly List<JsonObject> events = new();
    // unread chat by kind: im (IMs), group (group and conference chats), local (local, whisper, shout), object (objects, system)
    readonly Dictionary<string, int> unreadBy = new();
    public int Unread { get { lock (unreadBy) return unreadBy.Values.Sum(); } }
    public Dictionary<string, int> UnreadBy() { lock (unreadBy) return new Dictionary<string, int>(unreadBy); }
    public static string ChatCategory(string kind) => kind switch
    {
        "im" => "im",
        "group" or "conference" => "group",
        "local" or "whisper" or "shout" => "local",
        _ => "object",
    };

    public BotRunner(BotProfile p, BotManager owner) { Profile = p; this.owner = owner; LoadChatHistory(); }

    // ---------- coming back after a lost connection or a crash ----------
    bool hardStop;            // login refused, logged in elsewhere, logged off on purpose: do not bring it back
    bool restorePending;      // after coming back: sit down again / follow again once online
    int retries;
    public DateTime? RetryAt { get; private set; }
    DateTime? offlineSince;   // was online, the status says offline now
    DateTime? netLostAt;      // "Network disconnected" because of a timeout or the server
    DateTime? logoffAsked;    // a Logoff command (HUD "Log off") was seen

    static TimeSpan Backoff(int n) => TimeSpan.FromSeconds(n switch { 0 => 20, 1 => 60, 2 => 120, _ => 300 });

    /// <summary>The user stops the bot: it is not brought back.</summary>
    public void UserStop(TimeSpan grace)
    {
        Profile.WantOnline = false; RetryAt = null; retries = 0; restorePending = false;
        owner.Save();
        if (State == "waiting") { SetState("stopped"); LastError = ""; return; }
        Stop(grace);
    }

    void ScheduleRetry(string why)
    {
        if (!Profile.WantOnline || hardStop) return;
        RetryAt = DateTime.Now + Backoff(retries);
        retries++;
        restorePending = true;
        LastError = why + " – trying again at " + RetryAt.Value.ToString("HH:mm:ss") + ".";
        AddLog("Manager: " + LastError, "app");
        SetState("waiting");
    }

    /// <summary>Every 10 s from the manager: start a bot that should be online again, restart one whose
    /// connection is gone, and do again what it was doing once it is back.</summary>
    public void Watchdog()
    {
        try
        {
            var now = DateTime.Now;
            if (State == "waiting" && RetryAt is DateTime at && now >= at && !Running)
            {
                RetryAt = null;
                AddLog("Manager: starting the bot again (try " + retries + ")", "app");
                string err = Start(resume: true);
                if (err != "") ScheduleRetry("Could not start: " + err);
                return;
            }
            if (!Running || !Profile.WantOnline || stopRequested) return;
            // was online and lost the connection (no clean logout): the program does not log in again by itself
            bool lost = offlineSince is DateTime off && now - off > TimeSpan.FromSeconds(60);
            bool stuck = State is "connecting" or "starting" && restorePending && StartedAt is DateTime st && now - st > TimeSpan.FromMinutes(4);
            if (lost || stuck)
            {
                offlineSince = null;
                AddLog("Manager: " + (lost ? "the connection to Second Life is gone" : "logging in again takes too long") + " – restarting the bot program", "app");
                Task.Run(() =>
                {
                    Stop(TimeSpan.FromSeconds(3), keepState: true);
                    ScheduleRetry(lost ? "Connection lost" : "Login did not finish");
                });
                return;
            }
            if (State == "online" && OnlineSince is DateTime on && now - on > TimeSpan.FromMinutes(5)) retries = 0;
            if (State == "online" && restorePending && OnlineSince is DateTime on2 && now - on2 > TimeSpan.FromSeconds(8)) { restorePending = false; _ = Restore(); }
        }
        catch (Exception e) { Log.Error("Watchdog " + Profile.Label, e); }
    }

    /// <summary>Back after a lost connection or a crash: sit down again or follow again.</summary>
    async Task Restore()
    {
        var a = Profile.LastActivity;
        if (a == null || a.Kind == "" || DateTime.Now - a.At > TimeSpan.FromDays(2)) return;
        var inv = System.Globalization.CultureInfo.InvariantCulture;
        if (a.Kind == "seat" && a.SeatId != "")
        {
            AddLog("Manager: back again – sitting down on " + (a.SeatName == "" ? "the seat" : a.SeatName) + " in " + a.Region + " again", "app");
            var r = await RunCommand("CompanionJoin", new[] { a.CornerX.ToString(inv), a.CornerY.ToString(inv), a.X.ToString("0.#", inv), a.Y.ToString("0.#", inv), a.Z.ToString("0.#", inv), a.SeatId, "none" });
            if (!r.Ok) AddLog("Manager: could not sit down again: " + r.Reply, "app");
        }
        else if (a.Kind == "follow" && a.FollowKey != "")
        {
            AddLog("Manager: back again – following " + a.FollowName + " again", "app");
            var r = await RunCommand("CompanionFollow", new[] { a.FollowKey, a.FollowDist.ToString("0.#", inv), a.FollowAngle.ToString("0", inv), "none" });
            if (!r.Ok) AddLog("Manager: could not follow again: " + r.Reply, "app");
        }
    }

    /// <summary>Remembers what the bot does (seated / following) while it is online.</summary>
    void NoteActivity(JsonObject st)
    {
        if (restorePending) return;      // just came back: keep what it did before until it does it again
        var a = new Activity();
        string seat = st["seatId"]?.ToString() ?? "", fk = st["followKey"]?.ToString() ?? "";
        if (st["sitting"]?.GetValue<bool>() == true && seat != "")
        {
            a.Kind = "seat"; a.SeatId = seat; a.SeatName = st["seatName"]?.ToString() ?? "";
            a.Region = st["region"]?.ToString() ?? "";
            a.CornerX = (long)(st["cornerX"]?.GetValue<double>() ?? 0); a.CornerY = (long)(st["cornerY"]?.GetValue<double>() ?? 0);
            a.X = st["x"]?.GetValue<double>() ?? 128; a.Y = st["y"]?.GetValue<double>() ?? 128; a.Z = st["z"]?.GetValue<double>() ?? 25;
        }
        else if (fk != "")
        {
            a.Kind = "follow"; a.FollowKey = fk; a.FollowName = st["following"]?.ToString() ?? "";
            a.FollowDist = st["followDist"]?.GetValue<double>() ?? 2; a.FollowAngle = st["followAngle"]?.GetValue<double>() ?? 180;
        }
        var o = Profile.LastActivity;
        if (o == null && a.Kind == "") return;      // still doing nothing: no save (it saved every poll before – the backups held only a minute)
        if (o != null && o.Kind == a.Kind && o.SeatId == a.SeatId && o.FollowKey == a.FollowKey
            && Math.Abs(o.FollowDist - a.FollowDist) < 0.01 && Math.Abs(o.FollowAngle - a.FollowAngle) < 0.01) return;
        Profile.LastActivity = a.Kind == "" ? null : a;
        owner.Save();
    }

    public bool Running => proc != null && !proc.HasExited;
    public string Dir => AppPaths.Ensure(Path.Combine(AppPaths.BotsDir, Profile.Id));

    public static string LoginUriFor(BotProfile p) => p.Grid switch
    {
        "aditi" => "https://login.aditi.lindenlab.com/cgi-bin/login.cgi",
        "custom" => p.LoginUri.Trim(),
        _ => "secondlife",
    };

    /// <summary>SecondBot wants "First Last"; a one-word SL username is "username Resident".</summary>
    public static string LoginName(string u)
    {
        u = u.Trim();
        if (u.Contains('.') && !u.Contains(' ')) u = u.Replace('.', ' ');
        return u.Contains(' ') ? u : u + " Resident";
    }

    /// <summary>All the spellings an avatar's name can arrive in (legacy name, Resident suffix, capitals).</summary>
    public static IEnumerable<string> NameVariants(string n)
    {
        n = n.Trim();
        if (n.Length == 0) yield break;
        string full = LoginName(n);
        yield return n;
        yield return full;
        var parts = full.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 2)
        {
            static string Cap(string s) => s.Length == 0 ? s : char.ToUpperInvariant(s[0]) + s[1..];
            yield return Cap(parts[0]) + " " + Cap(parts[1]);
            yield return parts[0].ToLowerInvariant() + " " + parts[1];
            if (parts[1].Equals("Resident", StringComparison.OrdinalIgnoreCase)) yield return parts[0];
        }
    }

    public string Start(bool resume = false)
    {
        if (Running) return "already running";
        hardStop = false; offlineSince = null; netLostAt = null; logoffAsked = null; RetryAt = null;
        if (!resume) { retries = 0; restorePending = false; }
        if (!Profile.WantOnline) { Profile.WantOnline = true; owner.Save(); }
        if (!File.Exists(AppPaths.BotExe)) return "Bot program missing: " + AppPaths.BotExe;
        if (string.IsNullOrWhiteSpace(Profile.Username)) return "No avatar name set";
        string pw;
        try { pw = Secrets.Unprotect(Profile.PasswordProtected); } catch { return "The saved password cannot be read on this Windows account. Enter it again."; }
        if (pw.Length == 0) return "No password set";
        if (Profile.Masters.Count == 0) return "Add your own avatar under 'Who may command the bot'";
        if (string.IsNullOrEmpty(Profile.Secret)) { Profile.Secret = Secrets.NewSecret(); owner.Save(); }
        Profile.Port = owner.EnsurePort(Profile);

        var masters = Profile.Masters.SelectMany(NameVariants).Distinct().Select(m => m.Replace(",", ""));
        var env = new Dictionary<string, string>
        {
            ["basic_Username"] = LoginName(Profile.Username),
            ["basic_Password"] = pw,
            ["basic_LoginURI"] = LoginUriFor(Profile),
            ["basic_LogCommands"] = "true",
            ["basic_DefaultHoverHeight"] = Profile.HoverHeight.ToString(System.Globalization.CultureInfo.InvariantCulture),
            ["http_Enabled"] = "true",
            ["http_Port"] = Profile.Port.ToString(),
            ["http_BindAddress"] = "127.0.0.1",
            ["http_DisableCommandValidation"] = "false",
            ["commands_Enabled"] = "true",
            ["commands_AllowIMcontrol"] = "true",
            ["commands_SharedSecret"] = Profile.Secret,
            ["commands_EnableMasterControls"] = "true",
            ["commands_MastersCSV"] = string.Join(",", masters),
            ["commands_CheckDotNames"] = "true",
            ["commands_EnforceTimeWindow"] = "true",
            ["commands_TimeWindowSecs"] = "120",
            ["commands_ObjectMasterOptout"] = "false",
            ["commands_AllowFundsCommands"] = "false",
            ["commands_AllowServiceControl"] = "false",
            ["commands_CommandHistoryLogResults"] = "false",
            // low load: nothing fetched that the companion does not need
            ["datastore_PrefetchGroupMembers"] = "false",
            ["datastore_PrefetchGroupRoles"] = "false",
            ["datastore_PrefetchInventory"] = "false",
            ["datastore_PrefetchEstateBanlist"] = "false",
            ["datastore_PrefetchAvatarDisplaynames"] = "false",
            ["datastore_AutoCleanAvatars"] = "true",
            ["interaction_Enabled"] = "true",
            ["interaction_AcceptTeleports"] = Profile.AcceptTeleportsFromMasters ? "true" : "false",
            ["interaction_TeleportRequestLevel"] = "Owner",
            ["interaction_AcceptInventory"] = Profile.AcceptInventoryFromMasters ? "true" : "false",
            ["interaction_InventoryTransferLevel"] = "Owner",
            ["interaction_AcceptFriendRequests"] = "true",
            ["interaction_FriendRequestLevel"] = "Owner",
            ["interaction_AcceptGroupInvites"] = "false",
            ["interaction_GroupInviteLevel"] = "Owner",
            ["discord_Enabled"] = "false", ["events_Enabled"] = "false", ["homebound_Enabled"] = "false",
            ["rlv_Enabled"] = "false", ["chatgpt_Enabled"] = "false", ["smtp_Enabled"] = "false",
            ["rabbit_Enabled"] = "false", ["onevent_Enabled"] = "false", ["relay_count"] = "0",
        };
        var psi = new ProcessStartInfo(AppPaths.BotExe)
        {
            WorkingDirectory = Dir,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };
        foreach (var (k, v) in env) psi.Environment[k] = v;
        psi.Environment["DOTNET_gcServer"] = "0";
        psi.Environment["DOTNET_GCHeapHardLimitPercent"] = "0";
        psi.Environment["DOTNET_TieredPGO"] = "0";
        psi.Environment["DOTNET_GCConserveMemory"] = "7";
        psi.Environment["SLBM_LEAVE_CONFERENCES"] = Profile.JoinConferences ? "0" : "1";
        // HUD making and automatic HUD updates (the bot reads the scripts from the app's folder)
        // the newest compatible set: the app's own or a newer one from GitHub (HudScripts); read live by the bot
        bool cur = File.Exists(HudScripts.PathOf("AvieBoterHUD.lsl"));
        string HudFile(string f) => cur ? HudScripts.PathOf(f) : Path.Combine(AppPaths.WwwRoot, "hud", f);
        psi.Environment["SLBM_HUD_SCRIPT"] = HudFile("AvieBoterHUD.lsl");
        psi.Environment["SLBM_HUD_UPDATER"] = HudFile("AvieBoterHUDUpdater.lsl");
        psi.Environment["SLBM_HUD_MENU"] = HudFile("AvieBoterHUDMenu.lsl");
        psi.Environment["SLBM_HUD_CAM"] = HudFile("AvieBoterHUDCam.lsl");
        psi.Environment["SLBM_START"] = StartUri(Profile.StartLocation);
        psi.Environment["SLBM_HUD_AUTOUPDATE"] = Profile.AutoUpdateHud ? "1" : "0";
        psi.Environment["SLBM_YOUNG_DAYS"] = Profile.YoungAlertDays.ToString();
        psi.Environment["SLBM_BOT_LABEL"] = Profile.Label;
        psi.Environment["SLBM_PEOPLE"] = PeopleCsv();

        stopRequested = false; httpReady = false; Status = null; LastError = ""; LoginStep = ""; inWorldAt = null; botChatSeq = 0;
        try
        {
            proc = new Process { StartInfo = psi, EnableRaisingEvents = true };
            proc.OutputDataReceived += (_, e) => { if (e.Data != null) OnLine(e.Data, "out"); };
            proc.ErrorDataReceived += (_, e) => { if (e.Data != null) OnLine(e.Data, "err"); };
            proc.Exited += (_, _) => OnExit();
            proc.Start();
            proc.BeginOutputReadLine();
            proc.BeginErrorReadLine();
            try { proc.PriorityClass = ProcessPriorityClass.BelowNormal; } catch { }
            JobObject.Add(proc);
        }
        catch (Exception e) { proc = null; SetState("failed"); LastError = e.Message; return e.Message; }
        StartedAt = DateTime.Now; OnlineSince = null;
        lastCpu = TimeSpan.Zero; lastCpuAt = DateTime.Now;
        AddLog("Manager: started bot process (port " + Profile.Port + ", grid " + LoginUriFor(Profile) + ")", "app");
        SetState("starting");
        poll = new System.Threading.Timer(_ => Poll(), null, 2000, 3000);
        return "";
    }

    void OnLine(string raw, string kind)
    {
        string line = Ansi.Replace(raw, "").TrimEnd();
        if (line.Length == 0 || BotReply.IsPollNoise(line)) return;
        AddLog(line, kind);
        if (line.Contains("{FAILED}"))
        {
            string why = line[(line.IndexOf("{FAILED}") + 8)..].Replace("Login status:", "").Trim();
            if (why.Contains("presence", StringComparison.OrdinalIgnoreCase) && Profile.WantOnline && retries < 6)
            {
                // the grid still has the old session (after a crash or a lost connection): wait and log in again
                AddLog("Manager: Second Life still has the bot's old session – logging in again in a moment.", "app");
                _ = Task.Run(() => { Stop(TimeSpan.FromSeconds(1), keepState: true); ScheduleRetry("Still logged in from before"); });
                return;
            }
            LastError = "Login failed: " + why;
            hardStop = true;
            AddLog("Manager: login failed, stopping the bot so it does not retry with the same details.", "app");
            SetState("failed");
            _ = Task.Run(() => Stop(TimeSpan.FromSeconds(1), keepState: true));
        }
        else if (line.Contains("Login status:")) { LoginStep = line[(line.IndexOf("Login status:") + 13)..].Trim(); if (State == "starting") SetState("connecting"); }
        else if (line.Contains("HTTP service [Enabled]")) { httpReady = true; if (LastError.StartsWith("The bot is in-world")) LastError = ""; }
        else if (line.Contains("Connected to sim:") && inWorldAt == null) inWorldAt = DateTime.Now;
        else if (line.Contains("attempting to log in from another location") && !stopRequested)
        {
            hardStop = true;
            LastError = "Second Life logged the bot out because this account was logged in somewhere else (e.g. in your viewer). The bot was stopped.";
        }
        else if (line.Contains("Network disconnected (NetworkTimeout") || line.Contains("Network disconnected (ServerInitiated") || line.Contains("Network disconnected (SimShutdown"))
            netLostAt = DateTime.Now;
        else if (line.Contains("\"command\":\"Logoff\"") || line.Contains("\"command\":\"CompanionLogoff\""))
            logoffAsked = DateTime.Now;
        else if (line.Contains("Client service ~ Logged out") && !stopRequested)
        {
            // logged out in-world (HUD "Log off", or SL kicked it): end the program so the app shows the truth
            httpReady = false;
            LoginStep = "Logged out in Second Life";
            bool connection = netLostAt is DateTime nl && DateTime.Now - nl < TimeSpan.FromMinutes(2) && !hardStop
                && !(logoffAsked is DateTime lo && DateTime.Now - lo < TimeSpan.FromMinutes(2));
            if (connection && Profile.WantOnline)
            {
                AddLog("Manager: the connection to Second Life was lost - the bot comes back when it can.", "app");
                _ = Task.Run(() => { Stop(TimeSpan.FromSeconds(2), keepState: true); ScheduleRetry("Connection lost"); });
            }
            else
            {
                if (logoffAsked != null) { Profile.WantOnline = false; owner.Save(); }
                hardStop = true;
                AddLog("Manager: the avatar was logged out in Second Life - stopping the bot program.", "app");
                _ = Task.Run(() => Stop(TimeSpan.FromSeconds(2)));
            }
        }
        else if (line.Contains("HTTP service [failed to start]")) LastError = "The bot's command service failed to start: " + line[(line.IndexOf("[failed to start]") + 17)..].Trim();
        else if (line.Contains("Config is not loaded")) { LastError = "The bot did not accept its settings."; }
    }

    void OnExit()
    {
        poll?.Dispose(); poll = null;
        int code = 0; try { code = proc?.ExitCode ?? 0; } catch { }
        AddLog("Manager: bot process ended (code " + code + ")", "app");
        httpReady = false; Status = null; RamMb = 0; CpuPercent = 0; OnlineSince = null;
        if (State == "waiting") { owner.Notify(); return; }      // a restart is planned already
        if (!stopRequested && !hardStop && Profile.WantOnline)
        {
            ScheduleRetry("The bot program ended unexpectedly (code " + code + ")");
            owner.Notify();
            return;
        }
        if (State != "failed") SetState(stopRequested ? "stopped" : "failed");
        if (!stopRequested && LastError == "") LastError = "The bot process ended unexpectedly (code " + code + ").";
        owner.Notify();
    }

    int polling;
    void Poll()
    {
        if (Interlocked.Exchange(ref polling, 1) == 1) return;
        try
        {
            if (proc == null || proc.HasExited) return;
            proc.Refresh();
            RamMb = Math.Round(proc.WorkingSet64 / 1048576.0, 1);
            var now = DateTime.Now; var cpu = proc.TotalProcessorTime;
            double dt = (now - lastCpuAt).TotalMilliseconds;
            if (lastCpu != TimeSpan.Zero && dt > 0) CpuPercent = Math.Round((cpu - lastCpu).TotalMilliseconds / dt / Environment.ProcessorCount * 100, 1);
            lastCpu = cpu; lastCpuAt = now;
            if (!httpReady && inWorldAt != null && (DateTime.Now - inWorldAt.Value).TotalSeconds > 30 && LastError == "")
                LastError = "The bot is in-world but its command service did not start, so it cannot take commands or teleport offers. See the Log, then Restart.";
            if (httpReady && !stopRequested)
            {
                var r = RunCommand("CompanionStatus", Array.Empty<string>()).GetAwaiter().GetResult();
                if (r.Ok && r.Reply is string s && JsonNode.Parse(s) is JsonObject st)
                {
                    Status = st;
                    bool online = st["online"]?.GetValue<bool>() == true;
                    if (online)
                    {
                        offlineSince = null;
                        if (State != "online") { OnlineSince = DateTime.Now; SetState("online"); if (LastError.Contains("trying again") || LastError.StartsWith("Connection lost")) LastError = ""; }
                        NoteActivity(st);
                        string uuid = st["uuid"]?.ToString() ?? "", name = st["name"]?.ToString() ?? "";
                        if (uuid != "" && (uuid != Profile.BotUuid || name != Profile.BotName)) { Profile.BotUuid = uuid; Profile.BotName = name; owner.Save(); }
                    }
                    else if (State == "online") { SetState("connecting"); offlineSince = DateTime.Now; }
                }
                PullChat();
                if (++pollCount % 2 == 0) PullEvents();
            }
            owner.Notify();
        }
        catch (Exception e) { Log.Error("Poll " + Profile.Label, e); }
        finally { polling = 0; }
    }

    public void Stop(TimeSpan grace, bool keepState = false)
    {
        var p = proc;
        if (p == null || p.HasExited) { if (!keepState) SetState("stopped"); return; }
        stopRequested = true;
        if (!keepState) SetState("stopping");
        try
        {
            if (httpReady) { AddLog("Manager: logging the avatar out…", "app"); RunCommand("Logoff", Array.Empty<string>()).Wait(TimeSpan.FromSeconds(4)); }
            if (!p.WaitForExit(grace)) { p.Kill(true); p.WaitForExit(3000); }
        }
        catch (Exception e) { Log.Error("Stop", e); }
        if (!keepState) SetState("stopped");
    }

    public record CmdResult(bool Ok, string? Reply, string Raw);

    /// <summary>Runs a SecondBot command over the local, signed HTTP channel.</summary>
    public async Task<CmdResult> RunCommand(string cmd, string[] args)
    {
        if (!httpReady) return new(false, "The bot is not online yet.", "");
        foreach (var a in args)
            foreach (var bad in new[] { "~#~", "|||", "@@@", ";|;", "#|#" })
                if (a.Contains(bad)) return new(false, "Text may not contain " + bad, "");
        long unix = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        string sig = Secrets.Sha1Hex(cmd + string.Join("~#~", args) + unix + Profile.Secret);
        string body = cmd + (args.Length > 0 ? "|||" + string.Join("~#~", args) : "") + "@@@" + sig + ";|;" + unix;
        try
        {
            var resp = await http.PostAsync($"http://127.0.0.1:{Profile.Port}/json", new StringContent(body, Encoding.UTF8, "text/plain"));
            string raw = await resp.Content.ReadAsStringAsync();
            var r = BotReply.Parse(raw);
            return new(r.Ok, r.Reply, r.Raw);
        }
        catch (Exception e) { return new(false, e.Message, ""); }
    }

    void SetState(string s) { State = s; owner.Notify(); }

    void PullChat()
    {
        var r = RunCommand("CompanionChatSince", new[] { botChatSeq.ToString() }).GetAwaiter().GetResult();
        if (!r.Ok || r.Reply is not string s || JsonNode.Parse(s) is not JsonObject o) return;
        long seq = o["seq"]?.GetValue<long>() ?? 0;
        if (seq < botChatSeq) { botChatSeq = 0; return; }   // bot program restarted: next poll reads from the start
        string me = Profile.BotUuid;
        int fresh = 0;
        var incoming = new List<ChatItem>();
        foreach (var it in o["items"] as JsonArray ?? new JsonArray())
        {
            if (it is not JsonObject i) continue;
            long bseq = i["seq"]?.GetValue<long>() ?? 0;
            if (bseq <= botChatSeq) continue;
            botChatSeq = bseq;
            string fromId = i["fromId"]?.ToString() ?? "";
            bool own = fromId == me;
            var item = new ChatItem(0, i["t"]?.GetValue<long>() ?? 0, i["kind"]?.ToString() ?? "", i["from"]?.ToString() ?? "", fromId, i["text"]?.ToString() ?? "", own);
            AddChat(item);
            if (!own) { fresh++; incoming.Add(item); }
        }
        if (seq > botChatSeq) botChatSeq = seq;
        if (fresh > 0)
        {
            lock (unreadBy) foreach (var it in incoming) { string k = ChatCategory(it.Kind); unreadBy[k] = unreadBy.GetValueOrDefault(k) + 1; }
            owner.Notify(); owner.RaiseChat(this, incoming);
        }
    }

    /// <summary>Where the bot logs in, for the login request: "last", "home" or "uri:Region&amp;x&amp;y&amp;z" from a SLURL.</summary>
    public static string StartUri(string v)
    {
        v = (v ?? "").Trim();
        if (v == "" || v.Equals("last", StringComparison.OrdinalIgnoreCase)) return "last";
        if (v.Equals("home", StringComparison.OrdinalIgnoreCase)) return "home";
        string t = Uri.UnescapeDataString(v);
        foreach (var pre in new[] { "secondlife:///app/teleport/", "secondlife:///app/region/", "secondlife://", "http://maps.secondlife.com/secondlife/", "https://maps.secondlife.com/secondlife/", "http://slurl.com/secondlife/", "https://slurl.com/secondlife/" })
            if (t.StartsWith(pre, StringComparison.OrdinalIgnoreCase)) { t = t[pre.Length..]; break; }
        var parts = t.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0) return "last";
        int P(int i, int d) => parts.Length > i && double.TryParse(parts[i], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out double x) ? (int)Math.Round(x) : d;
        return "uri:" + parts[0].Trim() + "&" + P(1, 128) + "&" + P(2, 128) + "&" + P(3, 30);
    }

    /// <summary>Who may use the bot with a HUD (the bot checks each HUD's owner against this list).</summary>
    string PeopleCsv() => string.Join(",", Profile.Masters.Select(m => m.Replace(",", "")));
    public void PushPeople() => _ = RunCommand("CompanionSetPeople", new[] { PeopleCsv() });

    /// <summary>Who came and went (radar, HUDs, people using the bot): kept in memory for the app and written to
    /// bots\<id>\events\events-YYYY-MM-DD.jsonl (one JSON object per line: t, type, uuid, name, region, extra, bot).</summary>
    void PullEvents()
    {
        var r = RunCommand("CompanionEventsSince", new[] { botEventSeq.ToString() }).GetAwaiter().GetResult();
        if (!r.Ok || r.Reply is not string s || JsonNode.Parse(s) is not JsonObject o) return;
        long seq = o["seq"]?.GetValue<long>() ?? 0;
        if (seq < botEventSeq) { botEventSeq = 0; return; }   // bot program restarted
        var lines = new StringBuilder();
        bool hudCheck = false;
        foreach (var it in o["items"] as JsonArray ?? new JsonArray())
        {
            if (it is not JsonObject i) continue;
            long bseq = i["seq"]?.GetValue<long>() ?? 0;
            if (bseq <= botEventSeq) continue;
            botEventSeq = bseq;
            var e = new JsonObject
            {
                ["t"] = i["t"]?.GetValue<long>() ?? 0,
                ["type"] = i["type"]?.ToString() ?? "",
                ["uuid"] = i["uuid"]?.ToString() ?? "",
                ["name"] = i["name"]?.ToString() ?? "",
                ["region"] = i["region"]?.ToString() ?? "",
                ["extra"] = i["extra"]?.ToString() ?? "",
                ["bot"] = Profile.Label
            };
            string ty = e["type"]!.ToString();
            if (ty == "hud-check") hudCheck = true;
            else if (ty == "young" && Profile.YoungAlertDays > 0)
                owner.RaiseAlert(this, "New avatar near " + Profile.Label, e["name"] + " (" + e["extra"] + " in Second Life) is in " + e["region"] + ".");
            else if (ty == "group-invite")
                owner.RaiseAlert(this, Profile.Label + " got a group invitation", e["extra"] + " – answer it under 👥 Groups.");
            lock (events) { events.Add(e); if (events.Count > 500) events.RemoveRange(0, 100); }
            lines.Append(e.ToJsonString()).Append(Environment.NewLine);
        }
        if (seq > botEventSeq) botEventSeq = seq;
        if (hudCheck) _ = CheckHudFor();
        if (lines.Length == 0 || !Profile.SaveEvents) return;      // files only when switched on (Radar)
        try
        {
            string dir = AppPaths.Ensure(Path.Combine(Dir, "events"));
            File.AppendAllText(Path.Combine(dir, $"events-{DateTime.Now:yyyy-MM-dd}.jsonl"), lines.ToString());
        }
        catch { }
    }

    /// <summary>Update HUD pressed in a worn HUD: look on GitHub for a newer HUD now (at most once a minute), then the
    /// bot answers the HUD with the newest one it has (CompanionHudCheckDone).</summary>
    static DateTime lastHudCheck = DateTime.MinValue;
    static readonly SemaphoreSlim hudCheckGate = new(1, 1);
    async Task CheckHudFor()
    {
        string note;
        await hudCheckGate.WaitAsync();
        try
        {
            if (DateTime.Now - lastHudCheck < TimeSpan.FromMinutes(1)) note = "checked less than a minute ago";
            else
            {
                lastHudCheck = DateTime.Now;
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(25));
                var v = await HudScripts.CheckAsync(cts.Token);
                note = v != null ? "HUD " + v + " taken from GitHub" : "no newer HUD on GitHub";
            }
        }
        catch (Exception e) { note = "GitHub check failed: " + e.Message; Log.Info("HUD check for " + Profile.Label + ": " + e.Message); }
        finally { hudCheckGate.Release(); }
        AddLog("Manager: Update HUD from the worn HUD - " + note, "app");
        await RunCommand("CompanionHudCheckDone", new[] { note.Replace("|", "/").Replace("~", "-").Replace("@", "-").Replace("#", "") });
        owner.Notify();
    }

    public List<JsonObject> RecentEvents(int n) { lock (events) return events.TakeLast(n).Reverse().ToList(); }

    public void AddOutgoing(string kind, string to, string toId, string text) =>
        AddChat(new ChatItem(0, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), kind, to, toId, text, true));

    void AddChat(ChatItem c)
    {
        ChatItem item;
        lock (chat)
        {
            item = c with { Seq = ++chatSeq };
            chat.Add(item);
            if (chat.Count > 2000) chat.RemoveRange(0, 300);
        }
        try
        {
            string dir = AppPaths.Ensure(Path.Combine(Dir, "chat"));
            File.AppendAllText(Path.Combine(dir, $"chat-{DateTime.Now:yyyy-MM-dd}.jsonl"),
                System.Text.Json.JsonSerializer.Serialize(item, JsonStore.Options) + Environment.NewLine);
        }
        catch { }
    }

    void LoadChatHistory()
    {
        try
        {
            string dir = Path.Combine(AppPaths.BotsDir, Profile.Id, "chat");
            if (!Directory.Exists(dir)) return;
            var lines = Directory.GetFiles(dir, "chat-*.jsonl").OrderByDescending(f => f).Take(3).Reverse()
                .SelectMany(File.ReadLines).TakeLast(400);
            foreach (var l in lines)
            {
                try { if (System.Text.Json.JsonSerializer.Deserialize<ChatItem>(l, JsonStore.Options) is ChatItem c) lock (chat) chat.Add(c with { Seq = ++chatSeq }); } catch { }
            }
        }
        catch (Exception e) { Log.Error("Chat history", e); }
    }

    public List<ChatItem> ChatSince(long after) { lock (chat) return chat.Where(c => c.Seq > after).TakeLast(600).ToList(); }
    /// <summary>The chat was looked at: everything (all) or the kind its filter shows (local, im, group, object).</summary>
    public void MarkRead(string what = "all")
    {
        bool changed;
        lock (unreadBy)
        {
            changed = what == "all" ? unreadBy.Count > 0 : unreadBy.Remove(what);
            if (what == "all") unreadBy.Clear();
        }
        if (changed) owner.Notify();
    }

    void AddLog(string text, string kind)
    {
        var l = new LogLine(Interlocked.Increment(ref seq), DateTime.Now.ToString("HH:mm:ss"), text, kind);
        lock (log) { log.Add(l); if (log.Count > 3000) log.RemoveRange(0, 500); }
        try { File.AppendAllText(Path.Combine(AppPaths.Ensure(Path.Combine(Dir, "logs")), $"bot-{DateTime.Now:yyyy-MM-dd}.log"), $"{l.Time} {text}{Environment.NewLine}"); } catch { }
    }

    public List<LogLine> LogSince(long after) { lock (log) return log.Where(l => l.Seq > after).TakeLast(1500).ToList(); }
    public string LogFolder => AppPaths.Ensure(Path.Combine(Dir, "logs"));
}
