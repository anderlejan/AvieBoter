using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using AvieBoter.Core;

namespace AvieBoter.UI;

/// <summary>Page → app calls: {id, m, a:[...]} → {id, ok, v | err}.</summary>
public class Rpc
{
    readonly App app;
    readonly MainWindow win;
    public Rpc(App app, MainWindow win) { this.app = app; this.win = win; }

    static string S(JsonArray a, int i) => a.Count > i ? a[i]?.ToString() ?? "" : "";

    public async Task<JsonObject?> Handle(JsonObject msg)
    {
        var id = msg["id"]?.GetValue<int>() ?? 0;
        string m = msg["m"]?.ToString() ?? "";
        var a = msg["a"] as JsonArray ?? new JsonArray();
        try
        {
            JsonNode? v = await Call(m, a);
            return new JsonObject { ["id"] = id, ["ok"] = true, ["v"] = v };
        }
        catch (Exception e)
        {
            if (e is not UserError) Log.Error("RPC " + m, e);
            return new JsonObject { ["id"] = id, ["ok"] = false, ["err"] = e.Message };
        }
    }

    class UserError(string m) : Exception(m);

    async Task<JsonNode?> Call(string m, JsonArray a)
    {
        var st = app.Settings.Data;
        switch (m)
        {
            case "init":
                st.StartWithWindows = SettingsStore.AutostartIsOn();
                return new JsonObject
                {
                    ["version"] = typeof(App).Assembly.GetName().Version?.ToString(3),
                    ["settings"] = JsonSerializer.SerializeToNode(st, JsonStore.Options),
                    ["bots"] = BotsJson(),
                    ["dataDir"] = AppPaths.DataDir,
                    ["botExeFound"] = File.Exists(AppPaths.BotExe),
                    ["update"] = app.UpdateJson(),
                    ["notesConfig"] = NotesConfig(),
                };
            case "update.state": return app.UpdateJson();
            case "update.check": await app.CheckForUpdate(); return app.UpdateJson();
            case "update.install":
                {
                    if (app.UpdateFound is not { } u) throw new UserError("No newer version was found yet – press Check now.");
                    _ = app.InstallUpdateAsync(u);
                    return null;
                }
            case "state": return BotsJson();
            case "setting": return SetSetting(S(a, 0), a.Count > 1 ? a[1] : null);
            case "setBg": win.SetBackground(S(a, 0)); return null;
            case "addRecentSlurl":
                {
                    string u = S(a, 0).Trim();
                    if (u.Length > 0) { st.RecentSlurls.Remove(u); st.RecentSlurls.Insert(0, u); if (st.RecentSlurls.Count > 12) st.RecentSlurls.RemoveRange(12, st.RecentSlurls.Count - 12); app.Settings.Save(); }
                    return JsonSerializer.SerializeToNode(st.RecentSlurls);
                }

            case "bot.save": return SaveBot(a[0]!.AsObject(), a.Count > 1 ? a[1]?.ToString() : null);
            case "bot.delete": app.Bots.Remove(S(a, 0)); return BotsJson();
            case "bot.start":
                {
                    var r = Runner(S(a, 0));
                    string err = r.Start();
                    if (err != "") throw new UserError(err);
                    return null;
                }
            case "bot.stop": { var r = Runner(S(a, 0)); await Task.Run(() => r.Stop(TimeSpan.FromSeconds(6))); return null; }
            case "bot.restart":
                {
                    var r = Runner(S(a, 0));
                    await Task.Run(() => r.Stop(TimeSpan.FromSeconds(6)));
                    string err = r.Start();
                    if (err != "") throw new UserError(err);
                    return null;
                }
            case "bot.run":
                {
                    var r = Runner(S(a, 0));
                    var args = (a[2] as JsonArray ?? new JsonArray()).Select(x => x?.ToString() ?? "").ToArray();
                    var res = await r.RunCommand(S(a, 1), args);
                    return new JsonObject { ["ok"] = res.Ok, ["reply"] = res.Reply, ["raw"] = res.Raw };
                }
            case "bot.log":
                {
                    var r = Runner(S(a, 0));
                    long after = a.Count > 1 ? a[1]!.GetValue<long>() : 0;
                    return JsonSerializer.SerializeToNode(r.LogSince(after).Select(l => new { seq = l.Seq, t = l.Time, x = l.Text, k = l.Kind }));
                }
            case "bot.openLogs": Open(Runner(S(a, 0)).LogFolder); return null;
            case "bot.outfits":
                {
                    var res = await Runner(S(a, 0)).RunCommand("CompanionOutfits", Array.Empty<string>());
                    if (!res.Ok) throw new UserError(res.Reply ?? "No answer");
                    return JsonNode.Parse(res.Reply ?? "[]");
                }
            case "bot.wear":
                {
                    var r = Runner(S(a, 0));
                    string name = S(a, 1).Trim();
                    if (name == "") throw new UserError("Type or pick the folder name first.");
                    var res = await r.RunCommand("CompanionWear", new[] { name, "none" });
                    if (res.Ok)
                    {
                        var list = r.Profile.RecentOutfits;
                        list.RemoveAll(x => string.Equals(x, name, StringComparison.OrdinalIgnoreCase));
                        list.Insert(0, name);
                        if (list.Count > 12) list.RemoveRange(12, list.Count - 12);
                        app.Bots.Save(); app.Bots.Notify();
                    }
                    return new JsonObject { ["ok"] = res.Ok, ["reply"] = res.Reply };
                }
            case "seats.save":
                {
                    // [botId, seatId or "", name, uuid, region]
                    var r = Runner(S(a, 0));
                    string sid = S(a, 1), name = S(a, 2).Trim(), uuid = S(a, 3).Trim().ToLowerInvariant(), region = S(a, 4);
                    if (!Guid.TryParse(uuid, out _)) throw new UserError("That is not an object key (UUID), e.g. a5af0b84-db98-a727-438f-272cac90dc21.");
                    var seats = r.Profile.Seats;
                    var seat = sid == "" ? null : seats.FirstOrDefault(x => x.Id == sid);
                    if (seat == null && seats.Any(x => x.Uuid == uuid)) throw new UserError("This object is already in the list as \"" + seats.First(x => x.Uuid == uuid).Name + "\".");
                    if (name == "") name = NextName(seats, "Seat");
                    if (seats.Any(x => x != seat && Norm(x.Name) == Norm(name))) throw new UserError("Another seat is already called \"" + name + "\".");
                    if (seat == null) { seat = new Seat { Uuid = uuid, Region = region }; seats.Add(seat); }
                    seat.Name = name; seat.Uuid = uuid;
                    if (region != "") seat.Region = region;
                    app.Bots.Save(); app.Bots.Notify();
                    return seat.Id;
                }
            case "seats.delete":
                {
                    var r = Runner(S(a, 0));
                    r.Profile.Seats.RemoveAll(x => x.Id == S(a, 1));
                    app.Bots.Save(); app.Bots.Notify();
                    return null;
                }
            case "seats.sit":
                {
                    // [botId, seatId or "", uuid when not saved]
                    var r = Runner(S(a, 0));
                    var seat = r.Profile.Seats.FirstOrDefault(x => x.Id == S(a, 1));
                    string uuid = seat?.Uuid ?? S(a, 2).Trim();
                    if (!Guid.TryParse(uuid, out _)) throw new UserError("That is not an object key (UUID).");
                    var res = await r.RunCommand("SitOn", new[] { uuid });
                    if (seat != null && res.Ok) { seat.Uses++; seat.LastUsed = DateTime.Now; app.Bots.Save(); app.Bots.Notify(); }
                    return new JsonObject { ["ok"] = res.Ok, ["reply"] = res.Reply };
                }
            case "bot.openChat": Open(AppPaths.Ensure(Path.Combine(AppPaths.BotsDir, S(a, 0), "chat"))); return null;
            case "bot.chat":
                {
                    var r = Runner(S(a, 0));
                    long after = a.Count > 1 ? a[1]!.GetValue<long>() : 0;
                    if (a.Count > 2 && a[2]?.GetValue<bool>() == true) r.MarkRead();
                    return JsonSerializer.SerializeToNode(r.ChatSince(after), JsonStore.Options);
                }
            case "bot.sendChat":
                {
                    // mode: local | whisper | shout | im ; target = avatar name or key (im)
                    var r = Runner(S(a, 0));
                    string mode = S(a, 1), target = S(a, 2), targetName = S(a, 3), text = S(a, 4);
                    if (text.Trim() == "") throw new UserError("Nothing to send.");
                    var res = mode switch
                    {
                        "im" => await r.RunCommand("CompanionIM", new[] { target, text }),
                        "whisper" => await r.RunCommand("Whisper", new[] { "0", text }),
                        "shout" => await r.RunCommand("Shout", new[] { "0", text }),
                        _ => await r.RunCommand("Say", new[] { "0", text }),
                    };
                    if (!res.Ok) throw new UserError(res.Reply ?? "Not sent.");
                    if (mode == "im")
                    {
                        // CompanionIM answers {uuid, name}: keep the real key and name for replies
                        string toId = target, toName = targetName != "" ? targetName : target;
                        try { if (JsonNode.Parse(res.Reply ?? "") is JsonObject who) { toId = who["uuid"]?.ToString() ?? toId; toName = who["name"]?.ToString() is { Length: > 0 } n ? n : toName; } } catch { }
                        r.AddOutgoing("im", toName, toId, text);
                    }
                    return null;   // local chat comes back from the region by itself
                }
            case "bot.newSecret":
                {
                    var r = Runner(S(a, 0));
                    r.Profile.Secret = Secrets.NewSecret(); app.Bots.Save(); app.Bots.Notify();
                    return r.Running ? "restart" : "ok";
                }
            case "bot.pairCode":
                {
                    var p = Runner(S(a, 0)).Profile;
                    if (string.IsNullOrEmpty(p.BotUuid)) throw new UserError("Start the bot once so the app learns its avatar key (UUID).");
                    return "SLB1|" + p.BotUuid + "|" + p.Secret + "|" + p.Label.Replace("|", "/");
                }
            case "people.add":
                {
                    // share the bot: add a person who may use it (HUD, IM commands, teleport offers)
                    var r = Runner(S(a, 0));
                    string name = S(a, 1).Trim();
                    if (name == "") throw new UserError("Type the avatar's name, e.g. \"Jane Resident\" or \"jane\".");
                    if (!r.Profile.Masters.Any(m => Norm(m) == Norm(name))) r.Profile.Masters.Add(name);
                    app.Bots.Save(); app.Bots.Notify();
                    if (r.Running) r.PushPeople();
                    return new JsonObject { ["restartNeeded"] = r.Running };
                }
            case "hud.update":
                return await UpdateHud(S(a, 0));
            case "people.remove":
                {
                    var r = Runner(S(a, 0));
                    string name = S(a, 1);
                    if (r.Profile.Masters.Count <= 1) throw new UserError("Keep at least one person – the bot needs someone who may command it.");
                    r.Profile.Masters.RemoveAll(m => Norm(m) == Norm(name));
                    app.Bots.Save(); app.Bots.Notify();
                    if (r.Running) r.PushPeople();
                    return null;
                }
            case "bot.radar":
                {
                    var r = Runner(S(a, 0));
                    if (!r.Running) return new JsonArray();
                    var res = await r.RunCommand("CompanionRadar", Array.Empty<string>());
                    return res.Ok && res.Reply is string rs ? JsonNode.Parse(rs) : new JsonArray();
                }
            case "bot.events":
                {
                    var r = Runner(S(a, 0));
                    var arr = new JsonArray();
                    foreach (var e in r.RecentEvents(150)) arr.Add(e.DeepClone());
                    return arr;
                }
            case "bot.openEvents":
                {
                    var r = Runner(S(a, 0));
                    Open(AppPaths.Ensure(Path.Combine(r.Dir, "events")));
                    return null;
                }
            case "hud.send":
                {
                    // the bot builds a 2-prim HUD (with updater and pairing), gives it to the avatar; progress shows in status.hudJob
                    var r = Runner(S(a, 0));
                    if (!r.Running) throw new UserError("Start the bot first – it builds the HUD in Second Life.");
                    string to = S(a, 1);
                    if (to == "") throw new UserError("Add your avatar under ✎ Bot settings (who may command the bot) first.");
                    var res = await r.RunCommand("CompanionMakeHud", new[] { to, "app" });
                    if (!res.Ok) throw new UserError("The bot could not start building the HUD: " + res.Reply);
                    return null;
                }
            case "bot.hudAuto":
                {
                    var r = Runner(S(a, 0));
                    r.Profile.AutoUpdateHud = a[1]!.GetValue<bool>();
                    app.Bots.Save(); app.Bots.Notify();
                    if (r.Running) _ = r.RunCommand("CompanionHudAutoUpdate", new[] { r.Profile.AutoUpdateHud ? "on" : "off" });
                    return null;
                }
            case "bot.saveEvents":
                {
                    var r = Runner(S(a, 0));
                    r.Profile.SaveEvents = a[1]!.GetValue<bool>();
                    app.Bots.Save(); app.Bots.Notify();
                    return null;
                }
            case "hud.script":
                {
                    string f = S(a, 0) == "menu" ? "AvieBoterHUDMenu.lsl" : "AvieBoterHUD.lsl";
                    return File.ReadAllText(File.Exists(HudScripts.PathOf(f)) ? HudScripts.PathOf(f) : Path.Combine(AppPaths.WwwRoot, "hud", f));
                }
            case "copy":
                Clipboard.SetText(S(a, 0));
                return null;
            case "openData": Open(AppPaths.DataDir); return null;
            case "openUrl": WebHost.OpenOutside(S(a, 0)); return null;
            case "quit": _ = win.Dispatcher.BeginInvoke(() => app.Quit()); return null;
            case "notify.test": app.TestNotify(); return null;
            case "hide": win.Hide(); return null;

            // User notes module host api
            case "notes.get": return Notes.Get();
            case "notes.save": Notes.Save(a[0]!); return null;
            case "notes.saveText": return Notes.SaveText(S(a, 0), S(a, 1));
            case "notes.openFolder": Open(S(a, 0).Length > 0 && File.Exists(S(a, 0)) ? Path.GetDirectoryName(S(a, 0))! : AppPaths.PromptsDir); return null;
            case "notes.getDeleted": return Notes.GetDeleted();
            case "notes.saveDeleted": Notes.SaveDeleted(a[0]!); return null;
            case "notes.print": return await Printer.Print(S(a, 0), a.Count > 1 && a[1]?["pdf"]?.GetValue<bool>() == true);
        }
        throw new UserError("Unknown call " + m);
    }

    BotRunner Runner(string id) => app.Bots.Get(id) ?? throw new UserError("That bot no longer exists.");

    static void Open(string folder)
    {
        try { Process.Start(new ProcessStartInfo("explorer.exe", "\"" + folder + "\"") { UseShellExecute = true }); } catch { }
    }

    /// <summary>The User notes prompt settings: the page's defaults describe the public project; a private
    /// notes-config.json in the data folder (same fields) replaces them for whoever develops the app.</summary>
    static JsonNode? NotesConfig()
    {
        try
        {
            string f = Path.Combine(AppPaths.DataDir, "notes-config.json");
            return File.Exists(f) ? JsonNode.Parse(File.ReadAllText(f)) : null;
        }
        catch (Exception e) { Log.Error("notes-config.json", e); return null; }
    }

    JsonNode? SetSetting(string key, JsonNode? val)
    {
        var s = app.Settings.Data;
        switch (key)
        {
            case "theme": s.Theme = val?.ToString() ?? s.Theme; break;
            case "fontPercent": s.FontPercent = Math.Clamp(val?.GetValue<int>() ?? 100, 70, 200); break;
            case "startInTray": s.StartInTray = val?.GetValue<bool>() == true; break;
            case "startBotsWithApp": s.StartBotsWithApp = val?.GetValue<bool>() == true; break;
            case "closeAction": s.CloseAction = val?.ToString() == "quit" ? "quit" : "tray"; break;
            case "showNotesButton": s.ShowNotesButton = val?.GetValue<bool>() == true; break;
            case "checkForUpdates": s.CheckForUpdates = val?.GetValue<bool>() == true; break;
            case "installUpdatesAutomatically": s.InstallUpdatesAutomatically = val?.GetValue<bool>() == true; break;
            case "notifyImPopup": s.NotifyImPopup = val?.GetValue<bool>() == true; break;
            case "notifyImSound": s.NotifyImSound = val?.GetValue<bool>() == true; break;
            case "notifyLocalPopup": s.NotifyLocalPopup = val?.GetValue<bool>() == true; break;
            case "notifyLocalSound": s.NotifyLocalSound = val?.GetValue<bool>() == true; break;
            case "lastBot": s.LastBot = val?.ToString() ?? ""; break;
            case "lastSection": s.LastSection = val?.ToString() ?? "overview"; break;
            case "startWithWindows":
                s.StartWithWindows = val?.GetValue<bool>() == true;
                SettingsStore.ApplyAutostart(s.StartWithWindows);
                break;
            case "ui":
                if (val is JsonObject o) foreach (var (k, v) in o) s.Ui[k] = v?.ToString() ?? "";
                break;
            default: throw new UserError("Unknown setting " + key);
        }
        app.Settings.Save();
        return null;
    }

    JsonNode SaveBot(JsonObject o, string? password)
    {
        string id = o["id"]?.ToString() ?? "";
        var existing = id == "" ? null : app.Bots.Get(id);
        string label = (o["label"]?.ToString() ?? "").Trim();
        string user = (o["username"]?.ToString() ?? "").Trim();
        if (label == "") label = user;
        if (label == "") throw new UserError("Give the bot a name.");
        if (app.Bots.All.Any(r => r != existing && Norm(r.Profile.Label) == Norm(label))) throw new UserError("Another bot already has the name \"" + label + "\".");
        string grid = o["grid"]?.ToString() ?? "sl";
        string uri = (o["loginUri"]?.ToString() ?? "").Trim();
        if (grid == "custom" && !(uri.StartsWith("http://") || uri.StartsWith("https://"))) throw new UserError("The login URI must start with http:// or https://");
        var masters = (o["masters"] as JsonArray ?? new JsonArray()).Select(x => (x?.ToString() ?? "").Trim()).Where(x => x != "")
            .Distinct(StringComparer.OrdinalIgnoreCase).ToList();

        var p = existing?.Profile ?? new BotProfile();
        // what only takes effect when the bot logs in again
        string before = existing == null ? "" : string.Join("\u0001", p.Label, p.Username, p.Grid, p.LoginUri, string.Join(",", p.Masters),
            p.AcceptTeleportsFromMasters, p.AcceptInventoryFromMasters);
        double hoverBefore = p.HoverHeight;
        p.Label = label; p.Username = user; p.Grid = grid; p.LoginUri = uri; p.Masters = masters;
        p.AutoStart = o["autoStart"]?.GetValue<bool>() == true;
        bool conf = o["joinConferences"]?.GetValue<bool>() == true;     // off unless switched on
        bool confChanged = p.JoinConferences != conf;
        p.JoinConferences = conf;
        p.AcceptTeleportsFromMasters = o["acceptTeleports"]?.GetValue<bool>() != false;
        p.AcceptInventoryFromMasters = o["acceptInventory"]?.GetValue<bool>() != false;
        if (o["hoverHeight"] is JsonNode hh && double.TryParse(hh.ToString(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out double h)) p.HoverHeight = Math.Clamp(h, -2, 2);
        if (!string.IsNullOrEmpty(password)) p.PasswordProtected = Secrets.Protect(password);
        if (existing == null) { var r = app.Bots.Add(p); return new JsonObject { ["id"] = r.Profile.Id }; }
        app.Bots.Save(); app.Bots.Notify();
        // the conference switch works at once on a running bot
        if (confChanged && existing.Running) _ = existing.RunCommand("CompanionConferences", new[] { conf ? "on" : "off" });
        if (existing.Running) existing.PushPeople();     // who may use the bot with a HUD: at once
        // the hover height too
        if (existing.Running && p.HoverHeight != hoverBefore)
            _ = existing.RunCommand("CompanionSetHover", new[] { p.HoverHeight.ToString(System.Globalization.CultureInfo.InvariantCulture) });
        string after = string.Join("\u0001", p.Label, p.Username, p.Grid, p.LoginUri, string.Join(",", p.Masters),
            p.AcceptTeleportsFromMasters, p.AcceptInventoryFromMasters);
        return new JsonObject { ["id"] = p.Id, ["restartNeeded"] = existing.Running && (before != after || !string.IsNullOrEmpty(password)) };
    }

    static string PairingLine(BotProfile p) => "SLB1|" + p.BotUuid + "|" + p.Secret + "|" + p.Label.Replace("|", "/");

    /// <summary>Puts every bot this person may use into the HUD they wear. Silently through a bot their HUD already
    /// talks to (its last known address, message signed with that bot's secret); otherwise each online bot sends them
    /// an IM with a one-click link carrying a one-time code.</summary>
    async Task<JsonNode> UpdateHud(string person)
    {
        person = (person ?? "").Trim();
        if (person == "") throw new UserError("Whose HUD?");
        var mine = app.Bots.All.Where(r => r.Profile.Masters.Any(m => Norm(m) == Norm(person))).ToList();
        if (mine.Count == 0) throw new UserError(person + " is not among the people of any bot here.");
        var known = mine.Where(r => !string.IsNullOrEmpty(r.Profile.BotUuid)).ToList();
        var unknown = mine.Where(r => string.IsNullOrEmpty(r.Profile.BotUuid)).Select(r => r.Profile.Label).ToList();
        var online = known.Where(r => r.Running && r.State == "online").ToList();
        var result = new JsonObject { ["person"] = person, ["bots"] = new JsonArray(known.Select(r => (JsonNode)r.Profile.Label).ToArray()),
            ["neverOnline"] = new JsonArray(unknown.Select(x => (JsonNode)x).ToArray()) };
        if (online.Count == 0) { result["way"] = "none"; return result; }
        // the newest HUD first, so the worn HUD can update itself when it says hello after the change
        if (app.Settings.Data.CheckForUpdates) await app.CheckHud();
        result["hud"] = HudScripts.InUse;

        // 1. silently: the online bot that heard from this person's HUD most recently
        var lines = string.Join("\n", known.Select(r => PairingLine(r.Profile)));
        var addrs = new List<(BotRunner r, double age)>();
        foreach (var r in online)
        {
            var res = await r.RunCommand("CompanionHudAddress", new[] { person });
            if (!res.Ok || res.Reply == null) continue;
            try { var j = JsonNode.Parse(res.Reply); addrs.Add((r, j?["age"]?.GetValue<double>() ?? 1e9)); } catch { }
        }
        foreach (var (r, _) in addrs.OrderBy(x => x.age))
        {
            long unix = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            string body = r.Profile.BotUuid + " " + unix + " " + Secrets.Sha1Hex(lines + unix + r.Profile.Secret) + "\n" + lines;
            var res = await r.RunCommand("CompanionHudDeliver", new[] { person, "CompanionAddBots", Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(body)) });
            Log.Info("update HUD of " + person + " through " + r.Profile.Label + ": " + (res.Ok ? res.Reply : "failed: " + res.Reply));
            if (res.Ok && (res.Reply ?? "").StartsWith("added"))
            {
                result["way"] = "silent"; result["through"] = r.Profile.Label; result["answer"] = res.Reply;
                return result;
            }
        }

        // 2. a one-click invitation from each online bot
        var invited = new JsonArray();
        foreach (var r in online)
        {
            string code = Secrets.NewSecret(12);
            var res = await r.RunCommand("CompanionInvite", new[] { person, code, Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(PairingLine(r.Profile))) });
            Log.Info("HUD invitation to " + person + " from " + r.Profile.Label + ": " + (res.Ok ? "sent" : "failed: " + res.Reply));
            if (res.Ok) invited.Add(r.Profile.Label);
        }
        result["way"] = invited.Count > 0 ? "invite" : "failed";
        result["invited"] = invited;
        result["offline"] = new JsonArray(known.Where(r => !online.Contains(r)).Select(r => (JsonNode)r.Profile.Label).ToArray());
        return result;
    }

    static string Norm(string s) => new string(s.Where(c => !char.IsWhiteSpace(c)).ToArray()).ToLowerInvariant();

    static string NextName(List<Seat> seats, string stem)
    {
        for (int i = 1; ; i++) { string n = stem + " " + i; if (!seats.Any(x => Norm(x.Name) == Norm(n))) return n; }
    }

    public JsonArray BotsJson()
    {
        var arr = new JsonArray();
        foreach (var r in app.Bots.All)
        {
            var p = r.Profile;
            arr.Add(new JsonObject
            {
                ["id"] = p.Id, ["label"] = p.Label, ["username"] = p.Username, ["grid"] = p.Grid, ["loginUri"] = p.LoginUri,
                ["masters"] = JsonSerializer.SerializeToNode(p.Masters), ["autoStart"] = p.AutoStart,
                ["acceptTeleports"] = p.AcceptTeleportsFromMasters, ["acceptInventory"] = p.AcceptInventoryFromMasters,
                ["hoverHeight"] = p.HoverHeight, ["hasPassword"] = p.PasswordProtected != "", ["port"] = p.Port,
                ["botUuid"] = p.BotUuid, ["botName"] = p.BotName,
                ["state"] = r.State, ["lastError"] = r.LastError, ["loginStep"] = r.LoginStep,
                ["status"] = r.Status?.DeepClone(), ["ramMb"] = r.RamMb, ["cpu"] = r.CpuPercent,
                ["startedAt"] = r.StartedAt?.ToString("o"), ["onlineSince"] = r.OnlineSince?.ToString("o"),
                ["unread"] = r.Unread,
                ["joinConferences"] = p.JoinConferences,
                ["autoUpdateHud"] = p.AutoUpdateHud,
                ["saveEvents"] = p.SaveEvents,
                ["recentOutfits"] = JsonSerializer.SerializeToNode(p.RecentOutfits),
                ["seats"] = JsonSerializer.SerializeToNode(p.Seats.OrderByDescending(x => x.Uses).ThenBy(x => x.Name, StringComparer.OrdinalIgnoreCase), JsonStore.Options),
            });
        }
        return arr;
    }
}
