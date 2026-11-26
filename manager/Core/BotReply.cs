using System.Text.Json.Nodes;

namespace AvieBoter.Core;

/// <summary>Decodes SecondBot's HTTP answers. /json returns a JSON *string* that contains
/// {"Key":bool,"Value":"&lt;the command's own JSON reply&gt;"}; plain refusals come as a bare or quoted message.</summary>
public static class BotReply
{
    public record Result(bool Ok, string? Reply, string Raw);

    public static Result Parse(string raw)
    {
        string text = raw.Trim();
        // unwrap the outer JSON string layer (one or more)
        for (int i = 0; i < 3 && text.StartsWith("\""); i++)
        {
            try { text = JsonNode.Parse(text)!.GetValue<string>().Trim(); } catch { text = text.Trim('"'); break; }
        }
        if (!text.StartsWith("{")) return new(false, text, raw);
        var o = JsonNode.Parse(text)!.AsObject();
        bool key = o["Key"]?.GetValue<bool>() == true;
        string val = o["Value"]?.ToString() ?? "";
        if (val.StartsWith("{") && JsonNode.Parse(val) is JsonObject inner)
        {
            bool st = inner["status"]?.GetValue<bool>() ?? key;
            string? rep = inner["reply"] is JsonValue jv && jv.TryGetValue<string>(out var s) ? s : inner["reply"]?.ToJsonString();
            if (!st && inner["whyfailed"] is JsonNode why && rep != null) rep += " (" + why + ")";
            return new(key && st, rep, val);
        }
        return new(key, val, raw);
    }

    /// <summary>The app's regular polls (status, chat, comings and goings, the open Radar) are not worth a log line.</summary>
    static readonly string[] Polls = ["CompanionStatus", "CompanionChatSince", "CompanionEventsSince", "CompanionRadar", "CompanionMenus", "CompanionNearby"];

    public static bool IsPollNoise(string line) =>
        line.Contains("Command log:") && line.Contains("\"source\":\"HTTP\"")
        && Polls.Any(p => line.Contains("\"command\":\"" + p + "\""));
}
