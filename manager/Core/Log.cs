namespace AvieBoter.Core;

/// <summary>The app's own log (not the bots' logs): data\logs\app-YYYY-MM-DD.log.</summary>
public static class Log
{
    static readonly object gate = new();
    public static void Info(string m) => Write("INFO", m);
    public static void Error(string where, Exception? e) => Write("ERROR", where + ": " + e);
    static void Write(string level, string m)
    {
        try
        {
            lock (gate)
                File.AppendAllText(Path.Combine(AppPaths.LogsDir, $"app-{DateTime.Now:yyyy-MM-dd}.log"),
                    $"{DateTime.Now:HH:mm:ss} {level} {m}{Environment.NewLine}");
        }
        catch { }
    }
}
