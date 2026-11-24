using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace AvieBoter.Core;

/// <summary>
/// The HUD scripts the bots hand out (new HUDs and automatic HUD updates). The app ships a set in wwwroot\hud; a newer
/// set can come from the project's GitHub repository without a new app release: hud/hud.json on the main branch names
/// the HUD version, the oldest app it works with (minApp: the bot commands it needs) and the SHA-256 of each script
/// (line endings normalised to LF). The bots read the scripts from DataDir\hud\current, which holds the newest
/// compatible set; a downloaded set takes effect at once, also for running bots.
/// </summary>
public static class HudScripts
{
    public static readonly string[] Files = ["AvieBoterHUD.lsl", "AvieBoterHUDMenu.lsl", "AvieBoterHUDUpdater.lsl"];
    const string RawBase = "https://raw.githubusercontent.com/" + Updater.Repo + "/main/hud/";

    /// <summary>AVIEBOTER_HUD_URL (testing only): another folder URL holding hud.json and the scripts.</summary>
    static string Base => Environment.GetEnvironmentVariable("AVIEBOTER_HUD_URL") is { Length: > 0 } u ? u.TrimEnd('/') + "/" : RawBase;

    static string BuiltIn => Path.Combine(AppPaths.WwwRoot, "hud");
    static string Downloaded => Path.Combine(AppPaths.DataDir, "hud", "github");
    public static string Current => Path.Combine(AppPaths.DataDir, "hud", "current");

    public static string PathOf(string file) => Path.Combine(Current, file);

    /// <summary>Version and origin of the set in use ("app" or "GitHub").</summary>
    public static string InUse { get; private set; } = "";
    public static string InUseFrom { get; private set; } = "app";
    public static string LastCheck { get; private set; } = "";

    static readonly object gate = new();
    static readonly HttpClient Http = CreateClient();

    static HttpClient CreateClient()
    {
        var h = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        h.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("AvieBoter", Updater.Current.ToString()));
        return h;
    }

    public static Version? VersionOfFolder(string dir)
    {
        try
        {
            var f = Path.Combine(dir, Files[0]);
            if (!File.Exists(f)) return null;
            var m = Regex.Match(File.ReadAllText(f), "string\\s+VERSION\\s*=\\s*\"([^\"]+)\"");
            return m.Success ? Updater.ParseVersion(m.Groups[1].Value) : null;
        }
        catch { return null; }
    }

    static bool Complete(string dir) => Files.All(f => File.Exists(Path.Combine(dir, f)));

    /// <summary>Puts the newest compatible set into DataDir\hud\current (at start and after a download).</summary>
    public static void Prepare()
    {
        lock (gate)
        {
            var app = VersionOfFolder(BuiltIn) ?? new Version(0, 0, 0);
            var gh = Complete(Downloaded) && Compatible(Downloaded) ? VersionOfFolder(Downloaded) : null;
            string from = gh != null && gh > app ? Downloaded : BuiltIn;
            Directory.CreateDirectory(Current);
            foreach (var f in Files)
            {
                string src = Path.Combine(from, f), dst = Path.Combine(Current, f);
                if (!File.Exists(src)) continue;
                if (File.Exists(dst) && File.ReadAllBytes(dst).AsSpan().SequenceEqual(File.ReadAllBytes(src))) continue;
                string tmp = dst + ".new";
                File.Copy(src, tmp, true);
                File.Move(tmp, dst, true);      // the bots read whole files; a replaced file is never half written
            }
            InUse = (VersionOfFolder(Current) ?? app).ToString();
            InUseFrom = from == Downloaded ? "GitHub" : "app";
        }
    }

    /// <summary>A downloaded set is used only by an app at least as new as its minApp.</summary>
    static bool Compatible(string dir)
    {
        try
        {
            var j = JsonDocument.Parse(File.ReadAllText(Path.Combine(dir, "hud.json"))).RootElement;
            var min = Updater.ParseVersion(j.GetProperty("minApp").GetString());
            return min != null && Updater.Current >= min;
        }
        catch { return false; }
    }

    public static string Sha256Lf(byte[] data)
    {
        var text = Encoding.UTF8.GetString(data).Replace("\r\n", "\n");
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text))).ToLowerInvariant();
    }

    /// <summary>Looks for a newer HUD on GitHub and takes it when it fits this app. Returns the new version, or null.</summary>
    public static async Task<string?> CheckAsync(CancellationToken ct = default)
    {
        LastCheck = DateTime.Now.ToString("o");
        string manifest = await Http.GetStringAsync(Base + "hud.json?t=" + DateTime.UtcNow.Ticks, ct);
        var j = JsonDocument.Parse(manifest).RootElement;
        var v = Updater.ParseVersion(j.GetProperty("version").GetString());
        var min = Updater.ParseVersion(j.GetProperty("minApp").GetString());
        var inUse = Updater.ParseVersion(InUse) ?? new Version(0, 0, 0);
        if (v == null || min == null) throw new InvalidDataException("hud.json without version or minApp");
        if (v <= inUse) return null;
        if (Updater.Current < min) { Log.Info("HUD " + v + " on GitHub needs AvieBoter " + min + " or newer - waiting for that update"); return null; }
        var files = j.GetProperty("files");
        var got = new Dictionary<string, byte[]>();
        foreach (var f in Files)
        {
            string want = files.GetProperty(f).GetString() ?? "";
            byte[] data = await Http.GetByteArrayAsync(Base + f + "?t=" + DateTime.UtcNow.Ticks, ct);
            if (Sha256Lf(data) != want.ToLowerInvariant()) throw new InvalidDataException(f + " does not match hud.json (try again later)");
            got[f] = data;
        }
        lock (gate)
        {
            string tmp = Downloaded + ".new";
            if (Directory.Exists(tmp)) Directory.Delete(tmp, true);
            Directory.CreateDirectory(tmp);
            foreach (var kv in got) File.WriteAllBytes(Path.Combine(tmp, kv.Key), kv.Value);
            File.WriteAllText(Path.Combine(tmp, "hud.json"), manifest);
            if (Directory.Exists(Downloaded)) Directory.Delete(Downloaded, true);
            Directory.Move(tmp, Downloaded);
        }
        Prepare();
        Log.Info("HUD " + v + " taken from GitHub; bots hand it out from now on");
        return v.ToString();
    }
}
