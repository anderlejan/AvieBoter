using System.Text.Json;
using AvieBoter.Core;

int fails = 0;
void Check(string name, bool ok) { Console.WriteLine((ok ? "PASS " : "FAIL ") + name); if (!ok) fails++; }
string dir = Path.Combine(Path.GetTempPath(), "slbm-coretest-" + Guid.NewGuid().ToString("N")[..8]);
Directory.CreateDirectory(dir);
try
{
    var s = new AppSettings();
    Check("settings serialize for the page (init)", JsonSerializer.SerializeToNode(s, JsonStore.Options) != null);
    string sp = Path.Combine(dir, "settings.json");
    JsonStore.Save(sp, s, 0);
    var s2 = JsonStore.Load<AppSettings>(sp);
    Check("settings round trip keeps NaN window position", double.IsNaN(s2.WinX) && s2.Theme == s.Theme);
    var list = new BotList();
    list.Bots.Add(new BotProfile { Label = "Passenger", Username = "alt", Masters = { "main" }, Port = 47810 });
    string bp = Path.Combine(dir, "bots.json");
    JsonStore.Save(bp, list, 3);
    JsonStore.Save(bp, list, 3);
    var l2 = JsonStore.Load<BotList>(bp);
    Check("bot list round trip", l2.Bots.Count == 1 && l2.Bots[0].Masters[0] == "main" && l2.Bots[0].Port == 47810);
    Check("backup made on second save", Directory.GetFiles(Path.Combine(dir, "backups")).Length == 1);
    File.WriteAllText(bp, "{ broken");
    var l3 = JsonStore.Load<BotList>(bp);
    Check("broken file kept as .corrupt and loading goes on", l3.Bots.Count == 0 && Directory.GetFiles(dir, "bots.json.corrupt-*").Length == 1);
    // Exact HTTP answers from the live bot (2026-11-21, SecondBot ce1274f + patch), format kept byte for byte, names anonymised
    string samples = Path.Combine(AppContext.BaseDirectory, "samples");
    var st = BotReply.Parse(File.ReadAllText(Path.Combine(samples, "companionstatus.txt")));
    var stNode = st.Reply == null ? null : System.Text.Json.Nodes.JsonNode.Parse(st.Reply);
    Check("live CompanionStatus answer decodes (quoted JSON layer)", st.Ok && stNode?["online"]?.GetValue<bool>() == true
        && stNode?["uuid"]?.ToString() == "0b6f1c2e-5a4d-4c3b-9e8f-7a6b5c4d3e2f" && stNode?["region"]?.ToString() == "Sandbox Bellisseria");
    var tp = BotReply.Parse(File.ReadAllText(Path.Combine(samples, "teleport.txt")));
    Check("live TeleportSLURL answer decodes", tp.Ok && tp.Reply == "True");
    var fail = BotReply.Parse("\"{\\\"Key\\\":false,\\\"Value\\\":\\\"Unknown command\\\"}\"");
    Check("refusal decodes as failure with its message", !fail.Ok && fail.Reply == "Unknown command");
    var rej = BotReply.Parse("\"Command request rejected\"");
    Check("rejected signing decodes as failure", !rej.Ok && rej.Reply == "Command request rejected");
    Check("status poll lines are filtered", BotReply.IsPollNoise("Log - Command log:{\"command\":\"CompanionStatus\",\"args\":\"\",\"source\":\"HTTP\",\"accepted\":true}")
        && BotReply.IsPollNoise("Log - Command log:{\"command\":\"CompanionChatSince\",\"args\":\"0\",\"source\":\"HTTP\",\"accepted\":true}")
        && !BotReply.IsPollNoise("Log - Command log:{\"command\":\"CompanionChatSince\",\"source\":\"command interface\"}")
        && !BotReply.IsPollNoise("Log - Command log:{\"command\":\"Stand\",\"source\":\"HTTP\"}"));
}
finally { try { Directory.Delete(dir, true); } catch { } }
Console.WriteLine(fails == 0 ? "ALL PASSED" : fails + " FAILED");
return fails;
