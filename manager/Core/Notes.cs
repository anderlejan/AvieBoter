using System.Text.Json.Nodes;

namespace AvieBoter.Core;

/// <summary>Storage for the User notes module: data\user-notes.json (+ backups), texts in data\prompts.</summary>
public static class Notes
{
    static string FilePath => Path.Combine(AppPaths.DataDir, "user-notes.json");
    static string DeletedPath => Path.Combine(AppPaths.DataDir, "user-notes-deleted.json");

    public static JsonNode Get()
    {
        try { if (File.Exists(FilePath)) return JsonNode.Parse(File.ReadAllText(FilePath)) ?? new JsonObject(); }
        catch (Exception e)
        {
            Log.Error("Notes load", e);
            try { File.Copy(FilePath, FilePath + ".corrupt-" + DateTimeOffset.Now.ToUnixTimeMilliseconds()); } catch { }
        }
        return new JsonObject { ["version"] = 2, ["notes"] = new JsonArray() };
    }

    public static void Save(JsonNode list)
    {
        var doc = list is JsonArray ? new JsonObject { ["version"] = 2, ["notes"] = list.DeepClone() } : list.DeepClone();
        JsonStore.Save(FilePath, doc, 15);
    }

    public static JsonNode GetDeleted()
    {
        try { if (File.Exists(DeletedPath)) return JsonNode.Parse(File.ReadAllText(DeletedPath)) ?? new JsonArray(); } catch { }
        return new JsonArray();
    }

    public static void SaveDeleted(JsonNode stack) => JsonStore.Save(DeletedPath, stack.DeepClone(), 0);

    public static string SaveText(string text, string kind)
    {
        string k = new string((kind.Length > 0 ? kind : "text").Where(char.IsLetterOrDigit).ToArray());
        string baseName = $"{DateTime.Now:yyyy-MM-dd-HHmm}-{k}";
        string path = Path.Combine(AppPaths.PromptsDir, baseName + ".md");
        for (int i = 2; File.Exists(path); i++) path = Path.Combine(AppPaths.PromptsDir, $"{baseName}-{i}.md");
        File.WriteAllText(path, text, new System.Text.UTF8Encoding(false));
        return path;
    }
}
