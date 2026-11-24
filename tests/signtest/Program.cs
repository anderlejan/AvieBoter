using System;
using System.Security.Cryptography;
using System.Text;
using SecondBotEvents.Services;

static string Sha1(string s) => Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(s))).ToLowerInvariant();
long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
string secret = "Abc23xyzQ";
int fails = 0;
void Check(string name, string input, bool expect, string expCmd = null, int expArgs = -1, string expReply = null)
{
    var c = new SignedCommand(null, "test", input, true, true, 120, secret);
    bool ok = c.accepted == expect && (expCmd == null || c.command == expCmd) && (expArgs < 0 || c.args.Length == expArgs) && (expReply == null || c.replyTarget == expReply);
    if (!ok) fails++;
    Console.WriteLine($"{(ok ? "PASS" : "FAIL")} {name}: accepted={c.accepted} cmd={c.command} args={c.args?.Length} reply={c.replyTarget}");
}
// manager format (Secrets.Sha1Hex + BotRunner.RunCommand body)
string Mgr(string cmd, string[] a, long t, string sec) => cmd + (a.Length > 0 ? "|||" + string.Join("~#~", a) : "") + "@@@" + Sha1(cmd + string.Join("~#~", a) + t + sec) + ";|;" + t;
// HUD format (AvieBoterHUD.lsl send())
string Hud(string cmd, string[] a, string reply, long t, string sec) => cmd + (a.Length > 0 ? "|||" + string.Join("~#~", a) : "") + "#|#" + reply + "@@@" + Sha1(cmd + string.Join("~#~", a) + t + sec) + ";|;" + t;
string url = "http://simhost-0a1b2c3d.agni.secondlife.io:12046/cap/4f1e2d3c-1111-2222-3333-444455556666";
Check("manager, no args", Mgr("CompanionStatus", [], now, secret), true, "CompanionStatus", 0);
Check("manager, args", Mgr("Say", ["0", "Hello world ěščř"], now, secret), true, "Say", 2);
Check("HUD join", Hud("CompanionJoin", ["256000", "256768", "120.5", "33.0", "22.1", "a822ff2b-ff02-461d-b45d-dcd10a2de0c2", url], url, now, secret), true, "CompanionJoin", 7, url);
Check("HUD no args", Hud("Stand", [], url, now, secret), true, "Stand", 0, url);
Check("wrong secret", Hud("Stand", [], url, now, "other"), false);
Check("too old (200 s)", Mgr("Stand", [], now - 200, secret), false);
Check("tampered arg", Mgr("Say", ["0", "hi"], now, secret).Replace("hi@@@", "bye@@@"), false);
Console.WriteLine(fails == 0 ? "ALL PASSED" : fails + " FAILED");
return fails;
