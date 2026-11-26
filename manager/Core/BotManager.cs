using System.Net;
using System.Net.Sockets;

namespace AvieBoter.Core;

public class BotManager
{
    static string FilePath => Path.Combine(AppPaths.DataDir, "bots.json");
    BotList list = new();
    readonly Dictionary<string, BotRunner> runners = new();
    public event Action? Changed;
    public event Action<BotRunner, List<ChatItem>>? ChatArrived;
    public void RaiseChat(BotRunner r, List<ChatItem> items) => ChatArrived?.Invoke(r, items);
    public event Action<BotRunner, string, string>? Alert;      // a Windows popup (title, text)
    public void RaiseAlert(BotRunner r, string title, string text) => Alert?.Invoke(r, title, text);
    DateTime lastNotify = DateTime.MinValue;

    System.Threading.Timer? watchdog;

    public void Load()
    {
        list = JsonStore.Load<BotList>(FilePath);
        foreach (var b in list.Bots) runners[b.Id] = new BotRunner(b, this);
        // brings bots back after a lost connection or a crash of the bot program (see BotRunner.Watchdog)
        watchdog = new System.Threading.Timer(_ => { foreach (var r in runners.Values.ToList()) r.Watchdog(); }, null, 10000, 10000);
    }

    public void Save() { lock (list) JsonStore.Save(FilePath, list, 15); }
    public void Notify() => Changed?.Invoke();
    public IEnumerable<BotRunner> All => list.Bots.Select(b => runners[b.Id]);
    public BotRunner? Get(string id) => runners.TryGetValue(id, out var r) ? r : null;

    public BotRunner Add(BotProfile p)
    {
        if (string.IsNullOrEmpty(p.Secret)) p.Secret = Secrets.NewSecret();
        list.Bots.Add(p);
        runners[p.Id] = new BotRunner(p, this);
        p.Port = EnsurePort(p);
        Save(); Notify();
        return runners[p.Id];
    }

    public void Remove(string id)
    {
        if (runners.TryGetValue(id, out var r)) { r.Stop(TimeSpan.FromSeconds(5)); runners.Remove(id); }
        list.Bots.RemoveAll(b => b.Id == id);
        Save(); Notify();
    }

    /// <summary>Each bot keeps its own local port (47810+); a port taken by another program is skipped.</summary>
    public int EnsurePort(BotProfile p)
    {
        var used = list.Bots.Where(b => b != p).Select(b => b.Port).ToHashSet();
        if (p.Port >= 1024 && !used.Contains(p.Port) && Free(p.Port)) return p.Port;
        for (int port = 47810; port < 47999; port++)
            if (!used.Contains(port) && Free(port)) { p.Port = port; Save(); return port; }
        return p.Port;
    }

    static bool Free(int port)
    {
        try { var l = new TcpListener(IPAddress.Loopback, port); l.Start(); l.Stop(); return true; } catch { return false; }
    }

    public void StartAutoBots(IEnumerable<string>? alsoIds = null)
    {
        var ids = new HashSet<string>(alsoIds ?? Enumerable.Empty<string>());
        foreach (var r in All.Where(r => r.Profile.AutoStart || ids.Contains(r.Profile.Id)))
        {
            if (r.Running) continue;
            var err = r.Start(resume: ids.Contains(r.Profile.Id));
            Log.Info("Start at launch " + r.Profile.Label + (err == "" ? "" : ": " + err));
        }
    }

    public void StopAll(TimeSpan grace)
    {
        var tasks = All.Where(r => r.Running).Select(r => Task.Run(() => r.Stop(grace))).ToArray();
        Task.WaitAll(tasks, grace + TimeSpan.FromSeconds(5));
    }
}
