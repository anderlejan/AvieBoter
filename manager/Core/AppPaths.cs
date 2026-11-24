namespace AvieBoter.Core;

public static class AppPaths
{
    public static string AppDir { get; } = AppContext.BaseDirectory;
    /// <summary>"moved" when the data of the app's former name (SL Bot Manager) was moved over at this start,
    /// or the reason it could not be moved (then the old folder is used as it is). Declared before DataDir:
    /// static initializers run in this order, so DataDir's result is not reset afterwards.</summary>
    public static string Migration { get; private set; } = "";

    public static string DataDir { get; } = ResolveDataDir();

    static string ResolveDataDir()
    {
        if (Environment.GetEnvironmentVariable("AVIEBOTER_DATA") is { Length: > 0 } d) return Ensure(d);
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string now = Path.Combine(local, "AvieBoter"), before = Path.Combine(local, "SLBotManager");
        if (!Directory.Exists(now) && Directory.Exists(before))
        {
            // the former app's page engine can still hold files for a few seconds after it quit: try for up to 20 s
            for (int i = 0; ; i++)
            {
                try { Directory.Move(before, now); Migration = "moved"; break; }
                catch (Exception e) when (i < 20) { Migration = e.Message; Thread.Sleep(1000); }
                catch (Exception e) { Migration = e.Message; return before; }   // nothing lost: keep using the old folder
            }
        }
        return Ensure(now);
    }
    public static string BotsDir => Ensure(Path.Combine(DataDir, "bots"));
    public static string LogsDir => Ensure(Path.Combine(DataDir, "logs"));
    public static string WebViewDir => Ensure(Path.Combine(DataDir, "webview"));
    public static string PromptsDir => Ensure(Path.Combine(DataDir, "prompts"));
    public static string BotExe => Path.Combine(AppDir, "bot", "SecondBotEvents.exe");
    public static string WwwRoot => Path.Combine(AppDir, "wwwroot");
    public static string Ensure(string d) { Directory.CreateDirectory(d); return d; }
}
