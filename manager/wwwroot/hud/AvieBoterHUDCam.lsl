// AvieBoter HUD camera (script name "SL Bot HUD cam") - your camera watches the way the selected bot faces, from
// behind it at the distance, height and tilt you choose. Handy while you walk the bot with the app's Puppeteer.
// More ▸ Cam ▸ in the HUD menu; the settings stay in the HUD.
string  VERSION = "1.7.6";
integer chan;
integer lh;
key     bot = NULL_KEY;
integer camOn;
integer away;           // the bot is not in this region: the camera is back with you until it returns
float   camYaw;         // where the camera looks (radians); it swings after the way the bot is seen to face
integer camInit;
// With RLV switched on in the viewer, the viewer itself keeps the camera on the bot as it draws it, frame by frame,
// like when you Alt-click someone: no steps, no catching up. The script then only turns the view round behind it.
integer rlv;
integer rlvChan;
integer rlvL;
float   sentYaw;
float   sentDist;
float   sentAt = -100.0;
float   tick = 0.1;
key     anchor = NULL_KEY;  // "AvieBoter anchor": an invisible prim the bot wears at Avatar Center (AvieBoter 1.7.2+)
float   anchorAt = -100.0;
integer wantCam;            // the camera should run once its permission is there
float   anchorAsked = -100.0;
// Menus that objects send the bot (llDialog, llTextBox, permission questions, links) come here from the bot and are
// shown to you as a blue menu; your answer goes back to the bot (AvieBoter 1.10.2+).
integer omChan;
integer omL;
// Touch… (main menu): the touchable things near the bot – lines "local id|metres|name" – nine at a time. It lives
// here because the menu script has no room left.
list    touchL;
integer touchPg;
integer tChan;
integer tL;
string  xMenu;               // which of these menus is open: touch or hover
// More ▸ Hover ▸ lives here too (same reason)
float   hoverStep = 0.02;    // metres per Hover press
string  hoverNow = "";       // the last height the bot reported
string  omId;
key     omBot;
string  omKind;
list    omBtn;           // the menu's buttons: the answer goes back as "!!b<n>" (labels may hold "|||")

float getNum(string k, float d) { string v = llLinksetDataRead(k); if (v == "") return d; return (float)v; }
setNum(string k, float v) { llLinksetDataWrite(k, (string)v); }

findAnchor()
{
    anchor = NULL_KEY;
    anchorAt = llGetTime();
    // only the bot's own anchor: other things at Avatar Center (a rigged mesh body) sit off the centre, and the viewer
    // glides again whenever they swing round with the bot
    list a = llGetAttachedList(bot);
    integer i;
    for (i = 0; i < llGetListLength(a); ++i)
    {
        list o = llGetObjectDetails(llList2Key(a, i), [OBJECT_NAME, OBJECT_ATTACHED_POINT]);
        if (llList2Integer(o, 1) == ATTACH_AVATAR_CENTER && llListFindList(["Anchor", "AvieBoter anchor"], [llList2String(o, 0)]) != -1)
            anchor = llList2Key(a, i);
    }
}

// asks the bot to put its anchor on or take it off (signed like the HUD's other commands; no answer needed)
anchorCmd(string onOff)        // ("state" is a reserved word in LSL)
{
    list b = llParseStringKeepNulls(llLinksetDataRead("bots"), ["\n"], []);
    integer i = (integer)llLinksetDataRead("active");
    if (i < 0 || i * 3 >= llGetListLength(b)) i = 0;
    if (llList2String(b, i * 3) == "") return;
    string unix = (string)llGetUnixTime();
    anchorAsked = llGetTime();
    llInstantMessage((key)llList2String(b, i * 3), "CompanionAnchor|||" + onOff + "#|#none@@@"
        + llSHA1String("CompanionAnchor" + onOff + unix + llList2String(b, i * 3 + 1)) + ";|;" + unix);    // pauses this script 2 s
}

string botName()
{
    string w = llList2String(llParseStringKeepNulls(llLinksetDataRead("bots"), ["\n"], []), (integer)llLinksetDataRead("active") * 3 + 2);
    if (w == "") w = "the bot";
    return w;
}

xListen(string which)
{
    xMenu = which;
    if (tL) llListenRemove(tL);
    tChan = -1 - (integer)llFrand(900000000.0);
    tL = llListen(tChan, "", llGetOwner(), "");
}

hoverMenu()
{
    xListen("hover");
    string cm = (string)llRound(hoverStep * 100.0);
    string now = hoverNow;
    if (now == "") now = "not reported yet – press Up or Down";
    llDialog(llGetOwner(), "\nHover height of " + botName() + " – step " + cm + " cm.\nNow: " + now + "\n\nUp / Down lift or lower the bot, standing or sitting. Reset goes back to the height set in AvieBoter, which is also where the bot starts after logging in again.",
        ["◀ More", "Reset", "Step " + cm + " cm", "Down ▼", "Up ▲"], tChan);
}

touchMenu()
{
    string who = botName();
    xListen("touch");
    integer n = llGetListLength(touchL);
    if (n == 0 || llSubStringIndex(llList2String(touchL, 0), "|") == -1)
    {
        llDialog(llGetOwner(), "\nTouch – " + who + ":\n" + llList2String(touchL, 0) + "\n\nKey…: paste an object's key.", ["◀ Menu", "Again", "Key…"], tChan);
        return;
    }
    integer last = (n - 1) / 8;
    if (touchPg > last) touchPg = 0;
    string t = "\nWhat should " + who + " touch? Key…: paste an object's key. Within 20 m of the bot:\n";
    list o = ["Key…"];
    integer i;
    for (i = touchPg * 8; i < n && i < touchPg * 8 + 8; ++i)
    {
        list f = llParseStringKeepNulls(llList2String(touchL, i), ["|"], []);
        string lb = (string)(i + 1) + ". " + llList2String(f, 2);
        t += "\n" + lb + " – " + llList2String(f, 1) + " m";
        o += [llGetSubString(lb, 0, 23)];
    }
    // a dialog fills its rows from the bottom: the first objects go on top (only the top row may be short)
    integer m = llGetListLength(o);
    integer r = m % 3;
    list b;
    if (r) b = llList2List(o, 0, r - 1);
    for (i = r; i < m; i += 3) b = llList2List(o, i, i + 2) + b;
    string third = "Close";
    if (last > 0) third = "Next ▶";
    llDialog(llGetOwner(), llGetSubString(t, 0, 500), ["◀ Menu", "Again", third] + b, tChan);
}

// shows a menu an object sent the bot; j = {bot, id, k: menu|text|perm|url, o: object, m: message, b: buttons, u: url}
objMenu(string j)
{
    omBot = (key)llJsonGetValue(j, ["bot"]);
    omId = llJsonGetValue(j, ["id"]);
    omKind = llJsonGetValue(j, ["k"]);
    string o = llJsonGetValue(j, ["o"]);
    string m = llJsonGetValue(j, ["m"]);
    list b = llParseStringKeepNulls(llLinksetDataRead("bots"), ["\n"], []);
    integer i = llListFindList(b, [(string)omBot]);
    string who = "the bot";
    if (i != -1 && i % 3 == 0 && llList2String(b, i + 2) != "") who = llList2String(b, i + 2);
    if (omL) llListenRemove(omL);
    omL = 0;
    if (omKind == "url") { llLoadURL(llGetOwner(), llGetSubString(o + " (for " + who + "): " + m, 0, 250), llJsonGetValue(j, ["u"])); return; }
    omChan = -1 - (integer)llFrand(900000000.0);
    omL = llListen(omChan, "", llGetOwner(), "");
    string t = llGetSubString(o + " → " + who + ":\n" + m, 0, 420);
    if (omKind == "text") { llTextBox(llGetOwner(), t, omChan); return; }
    list btn = llJson2List(llJsonGetValue(j, ["b"]));
    omBtn = btn;
    if (omKind == "perm") { btn = ["Allow", "Refuse"]; t = llGetSubString(o + " asks " + who + " for: " + m, 0, 420); }
    llDialog(llGetOwner(), t, btn, omChan);
}

// sends the answer back to the bot (signed like the HUD's other commands)
objAnswer(string a)
{
    list b = llParseStringKeepNulls(llLinksetDataRead("bots"), ["\n"], []);
    integer i = llListFindList(b, [(string)omBot]);
    if (i == -1 || i % 3) return;
    a = llDumpList2String(llParseStringKeepNulls(a, ["@@@", "#|#", "~#~", ";|;", "|||"], []), " ");
    string args = omId + "~#~" + a;
    string unix = (string)llGetUnixTime();
    llInstantMessage(omBot, "CompanionMenuAnswer|||" + args + "#|#none@@@"
        + llSHA1String("CompanionMenuAnswer" + args + unix + llList2String(b, i + 1)) + ";|;" + unix);    // pauses this script 2 s
}

// Keeps this HUD's scripts running on land where scripts are off: a script that holds controls (and the other scripts
// in its prim - core, menu and cam are all in the main prim) is not stopped there.
perms()
{
    if (llGetAttached()) llRequestPermissions(llGetOwner(), PERMISSION_TAKE_CONTROLS | PERMISSION_CONTROL_CAMERA);
}

findBot()
{
    list b = llParseStringKeepNulls(llLinksetDataRead("bots"), ["\n"], []);
    integer i = (integer)llLinksetDataRead("active");
    if (i < 0 || i * 3 >= llGetListLength(b)) i = 0;
    bot = (key)llList2String(b, i * 3);
}

follow()
{
    list d = llGetObjectDetails(bot, [OBJECT_POS, OBJECT_ROT, OBJECT_VELOCITY]);
    if (d == [])
    {
        if (!away)
        {
            away = TRUE;
            if (rlv) { llOwnerSay("@setcam_mode:reset=force"); sentAt = -100.0; } else llClearCameraParams();
            llOwnerSay("Cam: the bot is not in this region – your camera is free until it comes back.");
        }
        return;
    }
    away = FALSE;
    vector v = llList2Vector(d, 2);
    v.z = 0.0;
    vector p = llList2Vector(d, 0) + v * getNum("caml", -0.2);  // your viewer shows a walking bot a moment late: aim there
    // the way the bot is seen to face: where it walks (viewers turn a walking body that way), else its rotation
    vector r = llRot2Fwd(llList2Rot(d, 1));
    float want = llAtan2(r.y, r.x);
    if (llVecMag(v) > 0.5)
    {
        float w = llAtan2(v.y, v.x);
        float a = w - want;
        while (a > PI) a -= TWO_PI;
        while (a < -PI) a += TWO_PI;
        if (llFabs(a) < 1.75) want = w;          // not when it walks backwards
    }
    if (!camInit) { camYaw = want; camInit = TRUE; }
    float dy = want - camYaw;
    while (dy > PI) dy -= TWO_PI;
    while (dy < -PI) dy += TWO_PI;
    camYaw += dy * getNum("camr", 0.25) * tick / 0.1;     // swings after the bot smoothly, without the region's jitter
    vector f = <llCos(camYaw), llSin(camYaw), 0.0> * llEuler2Rot(<0.0, 0.0, getNum("cams", 0.0) * DEG_TO_RAD>);    // seen from behind, or turned around it
    if (rlv)
    {
        // The viewer follows the bot itself, exactly where it draws him. We only say from where to look: behind him at
        // the distance, above at the height. Each new direction starts a short glide of the viewer's camera (~0.5 s)
        // during which it does not keep up with a walking bot, so it is sent seldom: while he walks only when he has
        // turned clearly away (12°), and never sooner than the glide before has ended.
        if (llGetTime() - anchorAt > 3.0 && (anchor == NULL_KEY || llGetObjectDetails(anchor, [OBJECT_POS]) == [])) findAnchor();
        if (anchor == NULL_KEY && llGetTime() - anchorAsked > 60.0) anchorCmd("on");     // e.g. after the bot logged in again
        if (anchor != NULL_KEY)
        {
            // Focus on the anchor: the viewer follows the bot's real position (no walk bobbing) and takes a new direction
            // at once, without gliding - so the view turns with the bot in small, even steps every 0.04 s.
            float tn = camYaw - sentYaw;
            while (tn > PI) tn -= TWO_PI;
            while (tn < -PI) tn += TWO_PI;
            float dA = getNum("camd", 4.0);
            if (llFabs(tn) > 0.0015 || llFabs(dA - sentDist) > 0.01 || llGetTime() - sentAt > 6.0)
            {
                vector ca = -f * dA + <0.0, 0.0, getNum("camh", 1.5) - 0.7>;     // the anchor sits 0.7 m above his centre, about his head
                float distA = llVecMag(ca);
                ca = ca / distA;
                llOwnerSay("@setcam_focus:" + (string)anchor + ";" + (string)distA + ";" + (string)ca.x + "/" + (string)ca.y + "/" + (string)ca.z + "=force");
                sentYaw = camYaw; sentDist = dA; sentAt = llGetTime();
            }
            return;
        }
        integer walking = llVecMag(v) > 0.3;
        float turned = want - sentYaw;
        while (turned > PI) turned -= TWO_PI;
        while (turned < -PI) turned += TWO_PI;
        float gap = llGetTime() - sentAt;
        float dist0 = getNum("camd", 4.0);
        integer send = gap > 30.0 || llFabs(dist0 - sentDist) > 0.01;
        if (walking) send = send || (llFabs(turned) > 0.21 && gap > 0.8);
        else send = send || (llFabs(turned) > 0.05 && gap > 0.5) || (gap > 6.0 && !walking);   // standing: also now and then, if you looked away
        if (send)
        {
            vector g = <llCos(want), llSin(want), 0.0> * llEuler2Rot(<0.0, 0.0, getNum("cams", 0.0) * DEG_TO_RAD>);
            vector c = -g * dist0 + <0.0, 0.0, getNum("camh", 1.5) - 0.7>;
            float dist = llVecMag(c);
            c = c / dist;
            llOwnerSay("@setcam_focus:" + (string)bot + ";" + (string)dist + ";" + (string)c.x + "/" + (string)c.y + "/" + (string)c.z + "=force");
            sentYaw = want; sentDist = dist0; sentAt = llGetTime();
        }
        return;
    }
    llSetCameraParams([
        CAMERA_ACTIVE, TRUE,
        CAMERA_POSITION, p - f * getNum("camd", 4.0) + <0.0, 0.0, getNum("camh", 1.5)>,
        CAMERA_POSITION_LOCKED, TRUE,
        CAMERA_FOCUS, p + f * 3.0 + <0.0, 0.0, getNum("camt", 0.5)>,
        CAMERA_FOCUS_LOCKED, TRUE,
        CAMERA_POSITION_LAG, getNum("camp", 0.15),
        CAMERA_FOCUS_LAG, getNum("camf", 0.08)]);
}

on()
{
    findBot();
    camInit = FALSE;
    if (bot == NULL_KEY) { llOwnerSay("Cam: pair a bot first."); return; }
    rlv = FALSE;
    tick = 0.1;
    sentAt = -100.0;
    if (rlvL) llListenRemove(rlvL);
    rlvL = 0;
    if (getNum("camx", 1.0) != 0.0)        // ask the viewer whether it has RLV; without it the camera is set by script
    {
        rlvChan = 100000 + (integer)llFrand(800000000.0);
        rlvL = llListen(rlvChan, "", llGetOwner(), "");
        llOwnerSay("@versionnew=" + (string)rlvChan);
    }
    anchor = NULL_KEY;
    anchorAt = -100.0;
    wantCam = TRUE;
    perms();
}

off()
{
    camOn = FALSE;
    wantCam = FALSE;
    llSetTimerEvent(0.0);
    if (llGetPermissions() & PERMISSION_CONTROL_CAMERA) llClearCameraParams();
    if (rlv) llOwnerSay("@setcam_mode:reset=force");
    rlv = FALSE;
    if (rlvL) { llListenRemove(rlvL); rlvL = 0; }
    llOwnerSay("Cam off – your camera is yours again.");
    anchorCmd("off");
    llLinksetDataWrite("cam", "0");
}

menu()
{
    string t = "\nCam – your camera watches the way the bot faces.\n\nNow: " + llList2String(["off", "on"], camOn)
        + "\nDistance " + llGetSubString((string)getNum("camd", 4.0), 0, 3) + " m, height " + llGetSubString((string)getNum("camh", 1.5), 0, 3)
        + " m, tilt " + llGetSubString((string)getNum("camt", 0.5), 0, 3) + " m, turned " + (string)((integer)getNum("cams", 0.0)) + "°";
    if (lh) llListenRemove(lh);
    lh = llListen(chan, "", llGetOwner(), "");
    if (!camOn) llSetTimerEvent(60.0);       // closes the listener if the dialog is left open
    llDialog(llGetOwner(), t, ["Turn ◀", "Reset", "Turn ▶", "Tilt down", "Tilt up", "◀ More", "Closer", "Farther", llList2String(["Cam ON", "Cam OFF"], camOn), "Lower", "Higher"], chan);
}

default
{
    state_entry()
    {
        chan = -1 - (integer)llFrand(900000000.0);
        camOn = FALSE;
        if (llLinksetDataRead("cam") == "1" && llGetAttached()) on();
        else perms();
    }

    attach(key id) { if (id) { if (llLinksetDataRead("cam") == "1") on(); else perms(); } else camOn = FALSE; }

    changed(integer c) { if (c & CHANGED_OWNER) { llLinksetDataWrite("cam", "0"); llResetScript(); } }

    run_time_permissions(integer p)
    {
        if (p & PERMISSION_TAKE_CONTROLS) llTakeControls(CONTROL_ML_LBUTTON, TRUE, TRUE);   // keeps the HUD alive on no-script land
        if (!wantCam) return;
        if (!(p & PERMISSION_CONTROL_CAMERA)) { llOwnerSay("Cam: the camera was not allowed."); return; }
        camOn = TRUE;
        away = FALSE;
        llLinksetDataWrite("cam", "1");
        llOwnerSay("Cam on: your camera watches the way the bot faces (More ▸ Cam ▸ to change or end it).");
        follow();
        llSetTimerEvent(tick);
        if (anchor == NULL_KEY) anchorCmd("on");
    }

    linkset_data(integer action, string name, string value)
    {
        if (name == "bots" || name == "active") { findBot(); camInit = FALSE; }
    }

    link_message(integer from, integer num, string str, key id)
    {
        if (str == "slbm-objmenu") { objMenu((string)id); return; }
        if (str == "slbm-hover") { hoverMenu(); return; }
        if (str == "slbm-ui|hover") { hoverNow = (string)id; if (xMenu == "hover" && tL) hoverMenu(); return; }   // the new height
        if (str == "slbm-touchlist") { touchL = llParseString2List((string)id, ["\n"], []); touchPg = 0; touchMenu(); return; }
        if (str == "slbm-cam|menu") menu();
        else if (str == "slbm-cam|toggle") { if (camOn) off(); else on(); }
        else if (str == "slbm-cam|on") { if (!camOn) on(); }          // from the app's Puppeteer
        else if (str == "slbm-cam|off") { if (camOn) off(); }
        else if (llGetSubString(str, 0, 12) == "slbm-cam|set:")     // a setting from the app: name=value
        {
            list kv = llParseString2List(llGetSubString(str, 13, -1), ["="], []);
            string k = llList2String(kv, 0);
            if (llListFindList(["camd", "camh", "camt", "cams", "caml", "camp", "camf", "camr", "camx"], [k]) != -1)
            {
                if (llList2String(kv, 1) == "") llLinksetDataDelete(k); else setNum(k, (float)llList2String(kv, 1));
            }
            if (camOn && !away) follow();
        }
    }

    listen(integer ch, string name, key id, string m)
    {
        if (ch == tChan && xMenu == "hover")
        {
            llListenRemove(tL); tL = 0;
            if (m == "◀ More") { llMessageLinked(LINK_THIS, 0, "slbm-ui|more", ""); return; }
            if (llGetSubString(m, 0, 4) == "Step ")
            {
                list steps = [0.01, 0.02, 0.05, 0.10];
                integer i = llListFindList(steps, [hoverStep]) + 1;
                if (i >= llGetListLength(steps)) i = 0;
                hoverStep = llList2Float(steps, i);
            }
            else if (m == "Up ▲") llMessageLinked(LINK_THIS, 0, "slbm-do|adjust", "up|" + (string)hoverStep);
            else if (m == "Down ▼") llMessageLinked(LINK_THIS, 0, "slbm-do|adjust", "down|" + (string)hoverStep);
            else if (m == "Reset") llMessageLinked(LINK_THIS, 0, "slbm-do|adjust", "reset|" + (string)hoverStep);
            hoverMenu();
            return;
        }
        if (ch == tChan && xMenu == "key")     // Touch… ▸ Key…: an object's key (UUID)
        {
            llListenRemove(tL); tL = 0;
            m = llStringTrim(m, STRING_TRIM);
            if ((key)m) llMessageLinked(LINK_THIS, 0, "slbm-do|touch", m);
            else if (m != "") llOwnerSay("That is not an object's key: " + m);
            return;
        }
        if (ch == tChan)        // the Touch… menu
        {
            llListenRemove(tL); tL = 0;
            if (m == "Key…")
            {
                xListen("key");
                llTextBox(llGetOwner(), "\nTouch which object?\n\nPaste its key (UUID). In your viewer: Edit the object (or one part of it) → General → Copy Keys.", tChan);
                return;
            }
            if (m == "◀ Menu") llMessageLinked(LINK_THIS, 0, "slbm-ui|main", "");
            else if (m == "Again") llMessageLinked(LINK_THIS, 0, "slbm-do|touchlist", "");
            else if (m == "Next ▶") { ++touchPg; touchMenu(); }
            else
            {
                integer k = (integer)m - 1;      // "3. Name" -> 2
                if (k >= 0 && k < llGetListLength(touchL)) llMessageLinked(LINK_THIS, 0, "slbm-do|touch", llList2String(llParseStringKeepNulls(llList2String(touchL, k), ["|"], []), 0));
            }
            return;
        }
        if (ch == rlvChan)      // the viewer has RLV: it follows the bot itself
        {
            llListenRemove(rlvL); rlvL = 0;
            rlv = TRUE;
            tick = 0.022;       // as often as the region runs scripts: small, even steps
            sentAt = -100.0;
            if (!camOn) return;         // the camera starts when it is allowed (run_time_permissions)
            if (llGetPermissions() & PERMISSION_CONTROL_CAMERA) llClearCameraParams();
            llSetTimerEvent(tick);
            return;
        }
        if (ch == omChan)       // an answer to an object's menu
        {
            llListenRemove(omL); omL = 0;
            if (omKind == "perm") m = llList2String(["no", "yes"], m == "Allow");
            else if (omKind == "menu" && llListFindList(omBtn, [m]) != -1) m = "!!b" + (string)llListFindList(omBtn, [m]);
            objAnswer(m);
            return;
        }
        if (m == "◀ More") { llListenRemove(lh); lh = 0; llMessageLinked(LINK_THIS, 0, "slbm-ui|more", ""); return; }
        if (m == "Cam ON") { on(); return; }
        else if (m == "Cam OFF") off();
        else if (m == "Closer") setNum("camd", llListStatistics(LIST_STAT_MAX, [1.0, getNum("camd", 4.0) - 1.0]));
        else if (m == "Farther") setNum("camd", llListStatistics(LIST_STAT_MIN, [30.0, getNum("camd", 4.0) + 1.0]));
        else if (m == "Higher") setNum("camh", llListStatistics(LIST_STAT_MIN, [20.0, getNum("camh", 1.5) + 0.5]));
        else if (m == "Lower") setNum("camh", llListStatistics(LIST_STAT_MAX, [-2.0, getNum("camh", 1.5) - 0.5]));
        else if (m == "Tilt up") setNum("camt", getNum("camt", 0.5) + 0.5);
        else if (m == "Tilt down") setNum("camt", getNum("camt", 0.5) - 0.5);
        else if (m == "Turn ◀") setNum("cams", getNum("cams", 0.0) + 45.0);
        else if (m == "Turn ▶") setNum("cams", getNum("cams", 0.0) - 45.0);
        else if (m == "Reset") { llLinksetDataDelete("camd"); llLinksetDataDelete("camh"); llLinksetDataDelete("camt"); llLinksetDataDelete("cams"); llLinksetDataDelete("caml"); llLinksetDataDelete("camp"); llLinksetDataDelete("camf"); llLinksetDataDelete("camr"); }
        menu();
    }

    timer()
    {
        if (camOn) follow();
        else if (lh) { llListenRemove(lh); lh = 0; llSetTimerEvent(0.0); }   // the dialog was left open without the cam
    }
}
