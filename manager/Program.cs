using System.IO.Pipes;
using System.Threading;

namespace AvieBoter;

/// <summary>Entry point: one copy per Windows user. A second start (or --quit / --show) talks to the running copy.</summary>
public static class Program
{
    public const string AppName = "AvieBoter";
    static string PipeName => "AvieBoter-" + Environment.UserName;

    [STAThread]
    public static int Main(string[] args)
    {
        // "--quit --update" (installer): quit and restart the running bots after the update
        string cmd = args.Contains("--quit") ? (args.Contains("--update") ? "quitupdate" : "quit") : args.Contains("--tray") ? "tray" : "show";
        // "--start <bot name or id>": start that bot (in a running copy, or after this one starts)
        int si = Array.IndexOf(args, "--start");
        if (si >= 0 && si + 1 < args.Length) cmd = "start:" + args[si + 1];
        using var mutex = new Mutex(true, "Local\\AvieBoter-single", out bool first);
        if (!first)
        {
            try
            {
                using var c = new NamedPipeClientStream(".", PipeName, PipeDirection.Out);
                c.Connect(3000);
                using var w = new StreamWriter(c);
                w.WriteLine(cmd);
            }
            catch { }
            return 0;
        }
        if (cmd == "quit" || cmd == "quitupdate") return 0;
        var app = new App(startHidden: cmd == "tray" || cmd.StartsWith("start:"));
        if (cmd.StartsWith("start:")) app.StartAfterLaunch = cmd[6..];
        StartPipe(app);
        app.Run();
        return 0;
    }

    static void StartPipe(App app)
    {
        var t = new Thread(() =>
        {
            while (true)
            {
                try
                {
                    using var s = new NamedPipeServerStream(PipeName, PipeDirection.In, 1);
                    s.WaitForConnection();
                    using var r = new StreamReader(s);
                    string? line = r.ReadLine();
                    app.Dispatcher.BeginInvoke(() => app.HandleRemote(line ?? "show"));
                }
                catch { Thread.Sleep(500); }
            }
        }) { IsBackground = true, Name = "pipe" };
        t.Start();
    }
}
