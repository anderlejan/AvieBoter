using System.Text.Json;
using System.Text.Json.Serialization;

namespace AvieBoter.Core;

/// <summary>Atomic JSON files with rotating backups; a broken file is kept as .corrupt-* and never lost.</summary>
public static class JsonStore
{
    public static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
        // window position starts as NaN ("not placed yet")
        NumberHandling = JsonNumberHandling.AllowNamedFloatingPointLiterals,
    };

    public static T Load<T>(string path) where T : new()
    {
        try
        {
            if (!File.Exists(path)) return new T();
            return JsonSerializer.Deserialize<T>(File.ReadAllText(path), Options) ?? new T();
        }
        catch (Exception e)
        {
            Log.Error("Load " + path, e);
            try { File.Copy(path, path + ".corrupt-" + DateTimeOffset.Now.ToUnixTimeMilliseconds()); } catch { }
            return new T();
        }
    }

    public static void Save<T>(string path, T value, int backups = 10)
    {
        string tmp = path + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(value, Options), new System.Text.UTF8Encoding(false));
        if (File.Exists(path) && backups > 0)
        {
            string dir = AppPaths.Ensure(Path.Combine(Path.GetDirectoryName(path)!, "backups"));
            string name = Path.GetFileNameWithoutExtension(path);
            try
            {
                File.Copy(path, Path.Combine(dir, $"{name}-{DateTime.Now:yyyyMMdd-HHmmss-fff}.json"), true);
                foreach (var old in Directory.GetFiles(dir, name + "-*.json").OrderByDescending(f => f).Skip(backups)) File.Delete(old);
            }
            catch { }
        }
        File.Move(tmp, path, true);
    }
}
