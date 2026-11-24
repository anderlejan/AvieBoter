using System.Media;
using AvieBoter.Core;

namespace AvieBoter.UI;

/// <summary>Popup (tray notification) and sound for incoming IMs and local chat, as chosen in Settings.</summary>
public class Notifier
{
    readonly App app;
    readonly Dictionary<string, DateTime> lastPopup = new();
    DateTime lastSound = DateTime.MinValue;
    SoundPlayer? player;

    public Notifier(App app) { this.app = app; }

    static readonly HashSet<string> ImKinds = new() { "im", "group", "conference", "objectim" };
    static readonly HashSet<string> LocalKinds = new() { "local", "whisper", "shout" };

    public void Handle(BotRunner r, List<ChatItem> items)
    {
        var s = app.Settings.Data;
        if (app.IsViewingChat(r.Profile.Id)) return;   // already looking at it
        var ims = items.Where(i => ImKinds.Contains(i.Kind)).ToList();
        var local = items.Where(i => LocalKinds.Contains(i.Kind)).ToList();
        bool popupIm = s.NotifyImPopup && ims.Count > 0, popupLocal = s.NotifyLocalPopup && local.Count > 0;
        bool sound = (s.NotifyImSound && ims.Count > 0) || (s.NotifyLocalSound && local.Count > 0);
        if (popupIm || popupLocal)
        {
            var show = popupIm ? ims : local;
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
        if (sound && (DateTime.Now - lastSound).TotalSeconds > 2)
        {
            lastSound = DateTime.Now;
            PlaySound();
        }
    }

    public void PlaySound()
    {
        try
        {
            player ??= new SoundPlayer(Path.Combine(AppPaths.AppDir, "Assets", "im.wav"));
            player.Play();
        }
        catch { SystemSounds.Asterisk.Play(); }
    }

    public void Test()
    {
        app.TrayIcon?.ShowPopup("AvieBoter – test", "This is how an IM to your bot is announced.", "");
        PlaySound();
    }
}
