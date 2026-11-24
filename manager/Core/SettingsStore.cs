namespace AvieBoter.Core;

public class SettingsStore
{
    static string FilePath => Path.Combine(AppPaths.DataDir, "settings.json");
    public AppSettings Data { get; }
    public SettingsStore() { Data = JsonStore.Load<AppSettings>(FilePath); }
    public void Save() { try { JsonStore.Save(FilePath, Data, 5); } catch (Exception e) { Log.Error("Settings save", e); } }

    public static void ApplyAutostart(bool on)
    {
        using var k = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run");
        if (on) k.SetValue("AvieBoter", "\"" + Path.Combine(AppPaths.AppDir, "AvieBoter.exe") + "\" --tray");
        else k.DeleteValue("AvieBoter", false);
    }

    public static bool AutostartIsOn()
    {
        using var k = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run");
        return k?.GetValue("AvieBoter") != null;
    }
}
