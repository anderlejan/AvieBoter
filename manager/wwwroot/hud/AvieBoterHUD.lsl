// AvieBoter HUD - core script (name "SL Bot HUD"), version 1.1.5 (talks to the bot). Its partner "SL Bot HUD menu" draws the menus and the look.
// YOU wear this HUD (on your own avatar, not on the bot). It controls the bot avatar that runs in AvieBoter.
// Easiest: in AvieBoter, tab "HUD", press "Send me a new HUD" - the bot builds it, paired, and gives it to you.
// A HUD made that way updates itself when the app has a newer one (its ring prim holds the updater).
// By hand: put this script AND the menu script into a plain box, wear it as a HUD (right-click > Attach to HUD > Center),
// then paste the pairing line from AvieBoter into local chat:  /7 pair SLB1|<bot key>|<secret>|<bot name>
// Commands go to the bot as signed instant messages; answers come back to this HUD's own web address.

string  VERSION = "1.1.5";
integer PAIR_CHANNEL = 7;
integer UPDATE_PIN = 7710422;     // must match the updater script
integer helloSent = FALSE;

key     owner;
string  myUrl = "";
key     urlRequest = NULL_KEY;
integer pairListen = 0;
string  lastStatus = "not asked yet";
key     inviteBot = NULL_KEY;     // a pairing invitation this HUD answered (pairwith): which bot, which code
string  inviteCode = "";
integer quietStatus = FALSE;     // a status asked for the menu only (no chat)
integer checkBot = -1;           // Update HUD: the bot asked (the menu chose one in this region); -1 = none

// ---------- stored bots (linkset data, shared with the menu script) ----------
list bots()              // strided: key, secret, label
{
    string raw = llLinksetDataRead("bots");
    if (raw == "") return [];
    return llParseStringKeepNulls(raw, ["\n"], []);
}
saveBots(list b) { llLinksetDataWrite("bots", llDumpList2String(b, "\n")); }
integer botCount() { return llGetListLength(bots()) / 3; }
integer activeIndex()
{
    integer i = (integer)llLinksetDataRead("active");
    if (i < 0 || i >= botCount()) i = 0;
    return i;
}
key    botKey()    { return (key)llList2String(bots(), activeIndex() * 3); }
key    keyAt(integer n)    { return (key)llList2String(bots(), n * 3); }
string labelAt(integer n)  { return llList2String(bots(), n * 3 + 2); }
string botLabel()  { if (botCount() == 0) return "no bot"; return llList2String(bots(), activeIndex() * 3 + 2); }

// ---------- to the menu script ----------
ui(string what, string data) { llMessageLinked(LINK_THIS, 0, "slbm-ui|" + what, data); }
showText(string line2) { ui("text", line2); }
setStatus(string s) { lastStatus = s; ui("status", s); }

// ---------- web address for replies ----------
requestUrl()
{
    if (myUrl != "") llReleaseURL(myUrl);
    myUrl = "";
    urlRequest = llRequestSecureURL();     // https: pairing lines travel to this address
}

string replyTarget()
{
    if (myUrl != "") return myUrl;
    return (string)owner;        // fallback: the bot answers by IM
}

// ---------- sending ----------
send(string cmd, list args) { sendTo(activeIndex(), cmd, args); }

sendTo(integer n, string cmd, list args)     // to the n-th paired bot
{
    if (botCount() == 0) { llOwnerSay("No bot paired yet. Paste the pairing line from AvieBoter into local chat."); return; }
    integer i;
    for (i = 0; i < llGetListLength(args); ++i)
    {
        string a = llList2String(args, i);
        if (llSubStringIndex(a, "~#~") != -1 || llSubStringIndex(a, "|||") != -1 || llSubStringIndex(a, "@@@") != -1)
        {
            llOwnerSay("That text contains characters the bot cannot accept.");
            return;
        }
    }
    string joined = llDumpList2String(args, "~#~");
    string unix = (string)llGetUnixTime();
    string sig = llSHA1String(cmd + joined + unix + llList2String(bots(), n * 3 + 1));
    if (cmd != "CompanionHudHello") ui("ring", "busy");
    string msg = cmd;
    if (llGetListLength(args) > 0) msg += "|||" + joined;
    msg += "#|#" + replyTarget() + "@@@" + sig + ";|;" + unix;
    llInstantMessage(keyAt(n), msg);      // note: this call pauses the script for 2 seconds
}

// ---------- version check / self update ----------
integer updaterLink()      // only updater 2 can take both HUD scripts
{
    integer i;
    for (i = 2; i <= llGetNumberOfPrims(); ++i)
        if (llGetLinkName(i) == "SL Bot HUD updater"
            && llList2String(llGetLinkPrimitiveParams(i, [PRIM_DESC]), 0) == "slbm-updater-2") return i;
    return 0;
}

helloTo(integer n)     // tells bot n this HUD's version; an older HUD gets updated by that bot
{
    string upd = "none";
    integer u = updaterLink();
    if (u) upd = (string)llGetLinkKey(u);
    sendTo(n, "CompanionHudHello", [VERSION, upd, myUrl]);
}

hello()
{
    if (helloSent || botCount() == 0 || myUrl == "") return;
    helloSent = TRUE;
    helloTo(activeIndex());
}

// ---------- actions ----------
string vec(float f) { return (string)((integer)(f * 10.0) / 10.0); }

list here()
{
    vector c = llGetRegionCorner();
    vector p = llGetPos();       // in a HUD this is the wearer's position
    return [(string)((integer)c.x), (string)((integer)c.y), vec(p.x), vec(p.y), vec(p.z)];
}

sitWithMe()
{
    integer info = llGetAgentInfo(owner);
    key root = llList2Key(llGetObjectDetails(owner, [OBJECT_ROOT]), 0);
    if (!(info & AGENT_SITTING) || root == owner || root == NULL_KEY)
    {
        llOwnerSay("Sit on the vehicle first, then choose Sit with me.");
        return;
    }
    llOwnerSay(botLabel() + " is coming to sit on '" + llKey2Name(root) + "'…");
    showText("coming to sit…");
    send("CompanionJoin", here() + [(string)root, replyTarget()]);
}

doAction(string a, list p)
{
    if (a == "sitwithme") sitWithMe();
    else if (a == "come") { llOwnerSay(botLabel() + " is coming to you…"); showText("coming…"); send("CompanionCome", here() + [replyTarget()]); }
    else if (a == "stand") { send("Stand", []); showText("standing"); ui("pose", "0"); }
    else if (a == "status") send("CompanionStatus", []);
    else if (a == "quietstatus") { quietStatus = TRUE; send("CompanionStatus", []); }
    else if (a == "checkupdate") { checkBot = (integer)llList2String(p, 0); helloTo(checkBot); }
    else if (a == "fly") send("CompanionFly", [llList2String(p, 0), replyTarget()]);
    else if (a == "lure") { llOwnerSay(botLabel() + " sends you a teleport offer…"); send("CompanionTeleportMe", []); }
    else if (a == "gohome") { llOwnerSay(botLabel() + " is teleporting to its home location."); send("GoHome", []); showText("going home"); }
    else if (a == "logoff") { llOwnerSay("Logging " + botLabel() + " out."); showText("logging out"); send("Logoff", []); }
    else if (a == "sethome") { llOwnerSay("Setting " + botLabel() + "'s home where it stands now…"); send("CompanionSetHome", []); }
    else if (a == "siton") { showText("sitting…"); send("CompanionSit", [llList2String(p, 0), replyTarget()]); }
    else if (a == "outfit")
    {
        string folder = llStringTrim(llList2String(p, 0), STRING_TRIM);
        if (folder == "") return;
        llOwnerSay(botLabel() + " is changing into '" + folder + "'…");
        showText("changing outfit…");
        send("CompanionWear", [folder, replyTarget()]);
    }
    else if (a == "adjust") send("CompanionAdjust", [llList2String(p, 0), llList2String(p, 1), replyTarget()]);
    else if (a == "follow") { showText("following you"); send("CompanionFollow", ["me", llList2String(p, 0), llList2String(p, 1), replyTarget()]); }
    else if (a == "unfollow") { showText(""); send("CompanionFollow", ["stop", "0", "0", replyTarget()]); }
    else if (a == "select")
    {
        llLinksetDataWrite("active", llList2String(p, 0));
        setStatus("not asked yet");
        showText("");
        helloSent = FALSE;
        hello();
    }
    else if (a == "unpair")
    {
        list b = bots();
        integer i = activeIndex() * 3;
        string gone = botLabel();
        saveBots(llDeleteSubList(b, i, i + 2));
        llLinksetDataWrite("active", "0");
        llOwnerSay("Removed " + gone + " from this HUD.");
        setStatus("not asked yet");
        showText("");
    }
}

// ---------- pairing ----------
integer addPairing(list p)     // p = SLB1, key, secret, label...; returns the bot's place in bots()
{
    key k = (key)llList2String(p, 1);
    string secret = llList2String(p, 2);
    string label = llDumpList2String(llList2List(p, 3, -1), "/");
    list b = bots();
    integer at = llListFindList(b, [(string)k]);
    if (at != -1 && at % 3 == 0) b = llListReplaceList(b, [(string)k, secret, label], at, at + 2);
    else { b += [(string)k, secret, label]; at = llGetListLength(b) - 3; }
    saveBots(b);
    return at;
}

// the app adds bots to this worn HUD through a bot already paired with it:
// first line "<bot key> <unix> <sha1(lines + unix + that bot's secret)>", then one pairing line per bot
string addBots(string body)
{
    list lines = llParseString2List(body, ["\n"], []);
    list h = llParseString2List(llList2String(lines, 0), [" "], []);
    list b = bots();
    integer at = llListFindList(b, [llList2String(h, 0)]);
    if (at == -1 || at % 3 != 0) return "refused: unknown sender";
    integer unix = (integer)llList2String(h, 1);
    if (llAbs(llGetUnixTime() - unix) > 300) return "refused: too old";
    lines = llDeleteSubList(lines, 0, 0);
    if (llSHA1String(llDumpList2String(lines, "\n") + (string)unix + llList2String(b, at + 1)) != llList2String(h, 2)) return "refused: bad signature";
    integer n = 0;
    list names = [];
    integer i;
    for (i = 0; i < llGetListLength(lines); ++i)
    {
        list p = llParseStringKeepNulls(llList2String(lines, i), ["|"], []);
        if (llList2String(p, 0) == "SLB1" && llGetListLength(p) >= 4)
        {
            if (llListFindList(bots(), [llList2String(p, 1)]) == -1) { ++n; names += llDumpList2String(llList2List(p, 3, -1), "/"); }
            addPairing(p);
        }
    }
    if (n) llOwnerSay("Added to this HUD: " + llDumpList2String(names, ", ") + ". Choose the bot under Bot ▸.");
    helloSent = FALSE;      // say hello again: the bot checks this HUD's version and brings a newer one
    hello();
    return "added " + (string)n;
}

// the answer to a pairing invitation: "<pairing line>\n<code>"
string pairByCode(string body)
{
    list lines = llParseString2List(body, ["\n"], []);
    list p = llParseStringKeepNulls(llList2String(lines, 0), ["|"], []);
    if (inviteCode == "" || llList2String(lines, 1) != inviteCode || (key)llList2String(p, 1) != inviteBot) return "refused";
    inviteCode = "";
    pair(llList2String(lines, 0));
    return "paired";
}

pair(string code)
{
    list p = llParseStringKeepNulls(code, ["|"], []);
    if (llList2String(p, 0) != "SLB1" || llGetListLength(p) < 4 || (key)llList2String(p, 1) == NULL_KEY)
    {
        llOwnerSay("That pairing line is not valid. Copy it again from AvieBoter (tab HUD).");
        return;
    }
    integer at = addPairing(p);
    llLinksetDataWrite("active", (string)(at / 3));
    string label = llList2String(bots(), at + 2);
    setStatus("paired");
    showText("paired");
    llOwnerSay("Paired with " + label + ". Touch the HUD for the menu.");
    send("CompanionStatus", []);
    helloSent = FALSE;
    hello();
}

// ---------- replies ----------
string formValue(string body, string name)
{
    list parts = llParseString2List(body, ["&"], []);
    integer i;
    for (i = 0; i < llGetListLength(parts); ++i)
    {
        string kv = llList2String(parts, i);
        integer eq = llSubStringIndex(kv, "=");
        if (eq > 0 && llGetSubString(kv, 0, eq - 1) == name)
        {
            string v = llGetSubString(kv, eq + 1, -1);
            v = llDumpList2String(llParseStringKeepNulls(v, ["+"], []), " ");
            return llUnescapeURL(v);
        }
    }
    return "";
}

string describeStatus(string st)
{
    // st = CompanionStatus json object
    if (llJsonGetValue(st, ["online"]) != JSON_TRUE) return "offline";
    string hl = llJsonGetValue(st, ["hudLatest"]);
    if (hl != JSON_INVALID && hl != "") llLinksetDataWrite("newest", hl);      // shown in HUD settings
    // the menu's Stand / Fly ON / Fly OFF button follows the bot: 2 seated, 1 flying, 0 standing
    if (llJsonGetValue(st, ["sitting"]) == JSON_TRUE) ui("pose", "2");
    else if (llJsonGetValue(st, ["flying"]) == JSON_TRUE) ui("pose", "1");
    else ui("pose", "0");
    string s = "online in " + llJsonGetValue(st, ["region"]) + " <" + llJsonGetValue(st, ["x"]) + ", " + llJsonGetValue(st, ["y"]) + ", " + llJsonGetValue(st, ["z"]) + ">";
    if (llJsonGetValue(st, ["sitting"]) == JSON_TRUE)
    {
        string seat = llJsonGetValue(st, ["seatName"]);
        if (seat == "" || seat == JSON_INVALID) seat = "something";
        s += ", sitting on " + seat;
    }
    else if (llJsonGetValue(st, ["flying"]) == JSON_TRUE) s += ", flying";
    return s;
}

handleReply(string command, string reply)
{
    string cmd = llJsonGetValue(reply, ["command"]);
    if (cmd == JSON_INVALID) cmd = command;
    if (cmd == "CompanionHudUpdate")
    {
        string res = llJsonGetValue(reply, ["result"]);
        integer u = updaterLink();
        ui("ring", "");
        key from = botKey();
        if (checkBot != -1) from = keyAt(checkBot);
        checkBot = -1;
        if (res == "ready" && u) { llOwnerSay("Updating this HUD…"); llMessageLinked(u, 0, "slbm-update-open", from); }
        else llOwnerSay("The HUD could not be updated: " + res);
        return;
    }
    if (cmd == "CompanionHudHello")
    {
        string info = llJsonGetValue(reply, ["reply"]);
        string action = llJsonGetValue(info, ["action"]);
        string latest = llJsonGetValue(info, ["latest"]);
        if (latest != JSON_INVALID && latest != "") llLinksetDataWrite("newest", latest);
        string who = botLabel();
        if (checkBot != -1) who = labelAt(checkBot);
        if (action == "updating") llOwnerSay(who + " brings HUD " + latest + "…");
        else if (action == "manual") llOwnerSay("Newer HUD " + latest + ": this one cannot update itself – press \"Send me a new HUD\" in AvieBoter.");
        else if (action == "off") llOwnerSay(who + " has HUD " + latest + ", but HUD updates are off for it in AvieBoter.");
        else if (checkBot != -1) llOwnerSay("HUD " + VERSION + " is up to date.");
        if (action != "updating") checkBot = -1;
        return;
    }
    // background results (CompanionJoin, CompanionCome, CompanionSit, CompanionWear, CompanionAdjust)
    string result = llJsonGetValue(reply, ["result"]);
    if (result != JSON_INVALID)
    {
        setStatus(describeStatus(llJsonGetValue(reply, ["status"])));
        if (cmd == "CompanionAdjust" && llGetSubString(result, 0, 6) == "height ") ui("hover", llGetSubString(result, 7, -1));
        else if (cmd == "CompanionAdjust" && llSubStringIndex(result, "reset") != -1) ui("hover", "as set in AvieBoter");
        if (llSubStringIndex(result, "could not") == 0 || llSubStringIndex(result, "teleport failed") == 0
            || llSubStringIndex(result, "not ") == 0 || llSubStringIndex(result, "error") == 0) ui("ring", "error");
        else ui("ring", "");
        if (result == "seated" || result == "arrived" || result == "already here") result += " (" + lastStatus + ")";
        llOwnerSay(botLabel() + ": " + result);
        showText(llGetSubString(result, 0, 40));
        return;
    }
    string status = llJsonGetValue(reply, ["status"]);
    string r = llJsonGetValue(reply, ["reply"]);
    if (cmd == "CompanionStatus" && r != JSON_INVALID)
    {
        setStatus(describeStatus(r));
        if (llJsonGetValue(r, ["online"]) == JSON_TRUE) ui("ring", ""); else ui("ring", "error");
        if (quietStatus) { quietStatus = FALSE; return; }
        llOwnerSay(botLabel() + ": " + lastStatus);
        showText(llGetSubString(lastStatus, 0, 60));
        return;
    }
    if (status == JSON_FALSE)
    {
        ui("ring", "error");
        string why = r;
        if (why == JSON_INVALID) why = reply;
        llOwnerSay(botLabel() + " could not do " + cmd + ": " + why);
        return;
    }
    if (cmd == "CompanionJoin" || cmd == "CompanionCome" || cmd == "CompanionSit" || cmd == "CompanionWear" || cmd == "CompanionAdjust" || cmd == "CompanionFollow" || cmd == "CompanionFly") return;   // "started" - the real result follows
    ui("ring", "");
    if (r == JSON_INVALID) r = reply;
    llOwnerSay(botLabel() + " – " + cmd + ": " + r);
}

default
{
    state_entry()
    {
        owner = llGetOwner();
        llSetRemoteScriptAccessPin(0);
        if (llLinksetDataRead("version") != VERSION)
        {
            if (botCount() > 0) llOwnerSay("AvieBoter HUD now runs version " + VERSION + ". Your pairings are kept.");
            llLinksetDataWrite("version", VERSION);
        }
        if (pairListen) llListenRemove(pairListen);
        pairListen = llListen(PAIR_CHANNEL, "", owner, "");
        requestUrl();
        showText("");
    }

    on_rez(integer p) { if (llGetOwner() != owner) llResetScript(); requestUrl(); }

    attach(key id)
    {
        if (id) helloSent = FALSE;
        else if (botCount() > 0) send("CompanionHudBye", [VERSION]);     // taken off: logged as "going" by the bot
    }

    changed(integer c)
    {
        if (c & CHANGED_OWNER) { llLinksetDataReset(); llResetScript(); }
        if (c & (CHANGED_REGION | CHANGED_TELEPORT | CHANGED_REGION_START)) requestUrl();
    }

    link_message(integer from, integer num, string str, key id)
    {
        if (llGetSubString(str, 0, 7) == "slbm-do|")
        {
            doAction(llGetSubString(str, 8, -1), llParseStringKeepNulls((string)id, ["|"], []));
        }
        else if (str == "slbm-pin?")
        {
            llSetRemoteScriptAccessPin(UPDATE_PIN);
            llMessageLinked(from, 0, "slbm-pin!", NULL_KEY);
        }
        else if (str == "slbm-pair")
        {
            // a HUD made by the bot arrives with its pairing line (see "Send me a new HUD" in the app)
            list p = llParseStringKeepNulls((string)id, ["|"], []);
            if (llListFindList(bots(), [llList2String(p, 1)]) == -1) pair((string)id);
            llMessageLinked(from, 0, "slbm-paired", NULL_KEY);
        }
        else if (str == "slbm-ui|ask") { ui("status", lastStatus); llLinksetDataWrite("memcore", (string)(llGetFreeMemory() / 1024)); }
    }

    http_request(key id, string method, string body)
    {
        if (id == urlRequest)
        {
            urlRequest = NULL_KEY;
            if (method == URL_REQUEST_GRANTED) { myUrl = body; hello(); }
            else { myUrl = ""; llOwnerSay("No web address for replies here (answers will come as IMs)."); }
            return;
        }
        if (method == "POST")
        {
            string cmd = formValue(body, "command");
            if (cmd == "CompanionAddBots") { llHTTPResponse(id, 200, addBots(formValue(body, "reply"))); return; }
            if (cmd == "CompanionPairing") { llHTTPResponse(id, 200, pairByCode(formValue(body, "reply"))); return; }
            llHTTPResponse(id, 200, "ok");
            handleReply(cmd, formValue(body, "reply"));
            return;
        }
        llHTTPResponse(id, 405, "");
    }

    listen(integer ch, string name, key id, string msg)
    {
        if (ch != PAIR_CHANNEL) return;
        if (llGetSubString(msg, 0, 4) == "pair ") pair(llStringTrim(llGetSubString(msg, 5, -1), STRING_TRIM));
        else if (llGetSubString(msg, 0, 8) == "pairwith ")
        {
            // a pairing invitation from a bot's IM (one-time code): ask that bot for its pairing line
            list p = llParseString2List(msg, [" "], []);
            if (llGetSubString(myUrl, 0, 7) != "https://") { llOwnerSay("No secure web address here yet – try again in a moment."); return; }
            inviteBot = (key)llList2String(p, 1);
            inviteCode = llList2String(p, 2);
            llOwnerSay("Asking the bot to pair with this HUD…");
            llInstantMessage(inviteBot, "slbm-pairwith|" + inviteCode + "|" + myUrl);
        }
    }
}
