using System.Media;
using AvieBoter.Core;

namespace AvieBoter.UI;

/// <summary>Popups and sounds for incoming chat, separately for IMs, group chats and local chat – each with its own
/// sound, so you can tell them apart, and its own pace, so a busy local chat or group does not keep beeping.</summary>
public class Notifier
{
    readonly App app;
    readonly Dictionary<string, DateTime> lastPopup = new();
    readonly Dictionary<string, DateTime> lastSound = new();
    readonly Dictionary<string, SoundPlayer> players = new();

    public Notifier(App app) { this.app = app; }

    static string KindOf(string k) => k switch
    {
        "im" or "objectim" => "im",
        "group" or "conference" => "group",
        "local" or "whisper" or "shout" => "local",
        _ => "",
    };

    // at most one sound of a kind every few seconds: IMs ring each time, busy chats less often
    static readonly Dictionary<string, double> SoundGap = new() { ["im"] = 2, ["group"] = 8, ["local"] = 15 };

    public void Handle(BotRunner r, List<ChatItem> items)
    {
        var s = app.Settings.Data;
        if (app.IsViewingChat(r.Profile.Id)) return;   // already looking at it
        var by = items.GroupBy(i => KindOf(i.Kind)).Where(g => g.Key != "").ToDictionary(g => g.Key, g => g.ToList());
        bool Pop(string k) => by.ContainsKey(k) && (k == "im" ? s.NotifyImPopup : k == "group" ? s.NotifyGroupPopup : s.NotifyLocalPopup);
        bool Snd(string k) => by.ContainsKey(k) && (k == "im" ? s.NotifyImSound : k == "group" ? s.NotifyGroupSound : s.NotifyLocalSound);
        string? popKind = new[] { "im", "group", "local" }.FirstOrDefault(Pop);
        if (popKind != null)
        {
            var show = by[popKind];
            var last = show[^1];
            string what = last.Kind switch { "im" => "IM", "group" => "group chat", "conference" => "conference", "objectim" => "object IM", "whisper" => "whisper", "shout" => "shout", _ => "local chat" };
            string title = $"{r.Profile.Label} – {what} from {last.From}";
            string text = last.Text + (show.Count > 1 ? $"  (+{show.Count - 1} more)" : "");
            // at most one popup per bot every 4 seconds; the Chat section has everything
            if (!lastPopup.TryGetValue(r.Profile.Id, out var t) || (DateTime.Now - t).TotalSeconds > 4)
            {
                lastPopup[r.Profile.Id] = DateTime.Now;
                app.TrayIcon?.ShowPopup(title, text, r.Profile.Id);
            }
            app.FlashWindow();
        }
        string? sndKind = new[] { "im", "group", "local" }.FirstOrDefault(Snd);   // the most important kind wins
        if (sndKind != null && (!lastSound.TryGetValue(sndKind, out var ls) || (DateTime.Now - ls).TotalSeconds > SoundGap[sndKind]))
        {
            lastSound[sndKind] = DateTime.Now;
            PlaySound(sndKind);
        }
    }

    public void PlaySound(string kind = "im")
    {
        try
        {
            if (!players.TryGetValue(kind, out var p))
            {
                p = kind == "im" ? new SoundPlayer(Path.Combine(AppPaths.AppDir, "Assets", "im.wav"))
                    : new SoundPlayer(Tone(kind == "group" ? new[] { (660.0, 0.07), (880.0, 0.09) } : new[] { (520.0, 0.06) }, kind == "group" ? 0.22 : 0.15));
                players[kind] = p;
            }
            p.Play();
        }
        catch { SystemSounds.Asterisk.Play(); }
    }

    /// <summary>A short, soft sound made here (no file): a few sine notes with a gentle fade.</summary>
    static MemoryStream Tone((double hz, double sec)[] notes, double volume)
    {
        const int rate = 22050;
        var samples = new List<short>();
        foreach (var (hz, sec) in notes)
        {
            int n = (int)(rate * sec);
            for (int i = 0; i < n; i++)
            {
                double env = Math.Min(1, i / (rate * 0.008)) * Math.Min(1, (n - i) / (rate * 0.03));
                samples.Add((short)(Math.Sin(2 * Math.PI * hz * i / rate) * env * volume * short.MaxValue));
            }
        }
        var ms = new MemoryStream();
        var w = new BinaryWriter(ms);
        int data = samples.Count * 2;
        w.Write("RIFF"u8.ToArray()); w.Write(36 + data); w.Write("WAVE"u8.ToArray());
        w.Write("fmt "u8.ToArray()); w.Write(16); w.Write((short)1); w.Write((short)1); w.Write(rate); w.Write(rate * 2); w.Write((short)2); w.Write((short)16);
        w.Write("data"u8.ToArray()); w.Write(data);
        foreach (var v in samples) w.Write(v);
        w.Flush();
        ms.Position = 0;
        return ms;
    }

    public void Test(string kind = "all")
    {
        if (kind == "all")
        {
            app.TrayIcon?.ShowPopup("AvieBoter – test", "This is how an IM to your bot is announced.", "");
            PlaySound("im");
            return;
        }
        PlaySound(kind);
    }
}
