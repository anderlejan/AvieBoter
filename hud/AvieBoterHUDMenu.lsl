// AvieBoter HUD - menu script (name "SL Bot HUD menu": menus, look, settings). It works together with the core script "SL Bot HUD",
// which talks to the bot. Both are updated together by the bot when the app has a newer HUD.
// The look: a shiny dark sphere (this prim) with a glowing ring (the updater prim of a HUD made by the bot).
// Every size is proportional, so the HUD scales freely: Settings ▸ Smaller/Bigger, or stretch it in Edit.
// The ring shows the state: your colour = ready, amber = the bot is working, red = something failed.

key     owner;
integer dialogChannel;
integer dialogListen = 0;
string  menu = "main";
string  lastStatus = "not asked yet";
integer pose = 0;      // the bot as last seen: 2 seated, 1 flying, 0 standing
string  line2 = "";
string  pendingAction = "";
integer following = FALSE;
float   adjustStep = 0.05;           // metres per Adjust press
float   hoverStep = 0.02;            // metres per Hover press
string  hoverNow = "";               // the last height the bot reported
list    ACCENTS = ["Cyan", <0.25, 0.85, 1.0>, "Violet", <0.65, 0.45, 1.0>, "Green", <0.35, 1.0, 0.55>, "Amber", <1.0, 0.75, 0.25>,
                   "Pink", <1.0, 0.45, 0.75>, "White", <0.92, 0.95, 1.0>, "Red", <1.0, 0.35, 0.3>, "Blue", <0.3, 0.5, 1.0>];

// ---------- bots (read from the linkset data the core script keeps) ----------
list bots()
{
    string raw = llLinksetDataRead("bots");
    if (raw == "") return [];
    return llParseStringKeepNulls(raw, ["\n"], []);
}
integer botCount() { return llGetListLength(bots()) / 3; }
integer activeIndex()
{
    integer i = (integer)llLinksetDataRead("active");
    if (i < 0 || i >= botCount()) i = 0;
    return i;
}
string botLabel() { if (botCount() == 0) return "no bot"; return llList2String(bots(), activeIndex() * 3 + 2); }

act(string action, list args) { llMessageLinked(LINK_THIS, 0, "slbm-do|" + action, llDumpList2String(args, "|")); }

// ---------- look ----------
integer ringLink()
{
    integer i;
    for (i = 2; i <= llGetNumberOfPrims(); ++i)
        if (llGetLinkName(i) == "SL Bot HUD updater") return i;
    return 0;
}

vector accent()
{
    integer i = (integer)llLinksetDataRead("accent");
    if (i < 0 || i * 2 >= llGetListLength(ACCENTS)) i = 0;
    return llList2Vector(ACCENTS, i * 2 + 1);
}

ringState(string st)
{
    integer r = ringLink();
    if (!r) return;
    vector c = accent();
    if (st == "busy") c = <1.0, 0.75, 0.25>;
    else if (st == "error") c = <1.0, 0.3, 0.3>;
    else if (botCount() == 0) c = <0.55, 0.6, 0.65>;
    llSetLinkPrimitiveParamsFast(r, [PRIM_COLOR, ALL_SIDES, c, 1.0, PRIM_GLOW, ALL_SIDES, 0.12]);
}

applyLook(integer resetSize)
{
    float d = 0.12;
    if (!resetSize && llLinksetDataRead("look") == "2")
    {
        vector s = llList2Vector(llGetLinkPrimitiveParams(LINK_ROOT, [PRIM_SIZE]), 0);
        d = s.x;
    }
    // the root: a sphere turned to face the screen, dark and shiny (the HUD light shades it like a button)
    llSetLinkPrimitiveParamsFast(LINK_ROOT, [
        PRIM_TYPE, PRIM_TYPE_SPHERE, PRIM_HOLE_DEFAULT, <0.0, 1.0, 0.0>, 0.0, ZERO_VECTOR, <0.0, 1.0, 0.0>,
        PRIM_SIZE, <d, d, d>,
        PRIM_ROT_LOCAL, llEuler2Rot(<0.0, PI_BY_TWO, 0.0>),
        PRIM_TEXTURE, ALL_SIDES, TEXTURE_BLANK, <1.0, 1.0, 0.0>, ZERO_VECTOR, 0.0,
        PRIM_COLOR, ALL_SIDES, <0.07, 0.13, 0.24>, 1.0,
        PRIM_FULLBRIGHT, ALL_SIDES, FALSE,
        PRIM_BUMP_SHINY, ALL_SIDES, PRIM_SHINY_HIGH, PRIM_BUMP_NONE,
        PRIM_GLOW, ALL_SIDES, 0.0]);
    integer r = ringLink();
    if (r)
    {
        float o = d * 1.25;
        llSetLinkPrimitiveParamsFast(r, [
            PRIM_TYPE, PRIM_TYPE_TORUS, PRIM_HOLE_CIRCLE, <0.0, 1.0, 0.0>, 0.0, ZERO_VECTOR, <1.0, 0.09, 0.0>, ZERO_VECTOR,
                <0.0, 1.0, 0.0>, ZERO_VECTOR, 1.0, 0.0, 0.0,
            PRIM_SIZE, <o, o, o>,
            PRIM_POS_LOCAL, ZERO_VECTOR,
            PRIM_ROT_LOCAL, ZERO_ROTATION,
            PRIM_TEXTURE, ALL_SIDES, TEXTURE_BLANK, <1.0, 1.0, 0.0>, ZERO_VECTOR, 0.0,
            PRIM_FULLBRIGHT, ALL_SIDES, TRUE]);
    }
    llSetObjectName("AvieBoter HUD");
    llLinksetDataWrite("look", "2");
    ringState("");
}

// TRUE when the HUD still has its designed shape (a sphere, plus the ring when it has one)
integer lookOk()
{
    if (llLinksetDataRead("look") != "2") return FALSE;
    if (llList2Integer(llGetLinkPrimitiveParams(LINK_ROOT, [PRIM_TYPE]), 0) != PRIM_TYPE_SPHERE) return FALSE;
    integer r = ringLink();
    if (r && llList2Integer(llGetLinkPrimitiveParams(r, [PRIM_TYPE]), 0) != PRIM_TYPE_TORUS) return FALSE;
    return TRUE;
}

resize(float f)
{
    if (f < llGetMinScaleFactor() || f > llGetMaxScaleFactor())
    {
        llOwnerSay("The HUD cannot get any " + llList2String(["bigger", "smaller"], f < 1.0) + ".");
        return;
    }
    llScaleByFactor(f);
}

integer textOn() { return llLinksetDataRead("text") != "0"; }

showText()
{
    if (!textOn()) { llSetText("", ZERO_VECTOR, 0.0); return; }
    string t = "controls: " + botLabel();
    if (line2 != "") t += "\n" + line2;
    llSetText(t, <0.85, 0.93, 1.0>, 1.0);
}

// ---------- menus ----------
openListen()
{
    if (dialogListen) llListenRemove(dialogListen);
    dialogChannel = -1000000 - (integer)llFrand(900000000.0);
    dialogListen = llListen(dialogChannel, "", owner, "");
    llSetTimerEvent(90.0);
}

dialog(string m, string text, list buttons)
{
    menu = m;
    openListen();
    llDialog(owner, text, buttons, dialogChannel);
}

textBox(string m, string text)
{
    menu = m;
    openListen();
    llTextBox(owner, text, dialogChannel);
}

string poseButton()
{
    if (pose == 2) return "Stand";
    if (pose == 1) return "Fly OFF";
    return "Fly ON";
}

mainMenu()
{
    if (botCount() == 0)
    {
        dialog("main", "\nAvieBoter HUD\n\nNo bot is paired yet.\nIn AvieBoter open your bot, tab HUD: press \"Send me a new HUD\" (it comes paired), or copy the pairing line and paste it into local chat.", ["Help", "Settings ▸", "Close"]);
        return;
    }
    dialog("main", "\nBot: " + botLabel() + "\nLast status: " + lastStatus + "\n\nWhat should the bot do?",
        ["Bot ▸", "More ▸", "Settings ▸",
         "Teleport me", poseButton(), "Adjust ▸",
         "Sit on…", "Outfit…", "Go home",
         "Sit with me", "Come to me", "Follow ▸"]);
}

botMenu()
{
    list names = [];
    list b = bots();
    integer i;
    for (i = 0; i < botCount() && i < 10; ++i)
    {
        string label = llList2String(b, i * 3 + 2);
        if (i == activeIndex()) label = "● " + label;
        names += [llGetSubString(label, 0, 16)];
    }
    dialog("bots", "\nChoose the bot this HUD controls:", names + ["◀ Back"]);
}

adjustMenu()
{
    string cm = (string)llRound(adjustStep * 100.0);
    dialog("adjust", "\nAdjust " + botLabel() + " on its seat – step " + cm + " cm.\n\nUp / Down always work. Forward, Backward, Left and Right make the bot sit down again a bit moved – only on seats without a fixed sit spot, best while the vehicle stands still.",
        ["◀ Menu", "Reset", "Step " + cm + " cm",
         "Left", "Backward", "Right",
         "Up ▲", "Forward", "Down ▼"]);
}

string fwhere()
{
    integer a = (integer)llLinksetDataRead("fang");
    if (llLinksetDataRead("fang") == "") a = 180;
    if (a == 90) return "on your left";
    if (a == 270) return "on your right";
    if (a == 0) return "in front of you";
    return "behind you";
}

float fdist()
{
    float d = (float)llLinksetDataRead("fdist");
    if (d <= 0.0) d = 2.0;
    return d;
}

string fang()
{
    string a = llLinksetDataRead("fang");
    if (a == "") a = "180";
    return a;
}

followMenu()
{
    string st = "not following";
    if (following) st = "following you";
    integer t = llRound(fdist() * 10.0);
    dialog("follow", "\nFollow – " + botLabel() + " is " + st + ".\nPlace: " + (string)(t / 10) + "." + (string)(t % 10) + " m " + fwhere() + " (remembered).\n\nIt walks after you, flies when you fly, and teleports when you get far away or change region. Changes apply at once while it follows.",
        ["◀ Menu", "Stop", "Follow me",
         "Left side", "Behind", "Right side",
         "Closer", "In front", "Farther"]);
}

moreMenu()
{
    dialog("more", "\nMore for " + botLabel() + ":\n\nHover ▸: lift or lower the bot.   Status: what the bot is doing and where.", ["◀ Menu", "Set home…", "Log off…", "Hover ▸", "Status"]);
}

hoverMenu()
{
    string cm = (string)llRound(hoverStep * 100.0);
    string now = hoverNow;
    if (now == "") now = "not reported yet – press Up or Down";
    dialog("hover", "\nHover height of " + botLabel() + " – step " + cm + " cm.\nNow: " + now + "\n\nUp / Down lift or lower the bot, standing or sitting. Reset goes back to the height set in AvieBoter, which is also where the bot starts after logging in again.",
        ["◀ More", "Reset", "Step " + cm + " cm",
         "Down ▼", "Up ▲"]);
}

settingsMenu()
{
    string t = "Hide text";
    if (!textOn()) t = "Show text";
    dialog("settings", "\nHUD settings\n\nSize: Smaller / Bigger (or stretch the HUD in Edit).\nColour: the ring's colour when the bot is ready.\nText: the floating text above the HUD.",
        ["◀ Menu", "Help", "Unpair…",
         "Reset look", "Colour ▸", t,
         "Smaller", "Bigger"]);
}

confirm(string action, string question)
{
    pendingAction = action;
    dialog("confirm", "\n" + question, ["Yes", "No"]);
}

help()
{
    llOwnerSay("AvieBoter HUD help:\n"
        + "• Sit with me – sit on a vehicle first; the bot teleports beside you and takes a free seat.\n"
        + "• Come to me – the bot teleports next to you.   • Stand – the bot stands up.\n"
        + "• Sit on… – paste an object's key (Edit → General → Copy Keys); the bot sits on it.\n"
        + "• Adjust ▸ – while the bot sits: Up/Down; Forward/Backward/Left/Right re-seat it a bit moved (seats without a fixed sit spot). Step changes the distance.\n"
        + "• Follow ▸ – the bot follows you; Closer/Farther and Behind/Left/Right/In front set its place (remembered).\n"
        + "• Outfit… – type a folder name; the bot wears it instead of its outfit.   • More ▸ – Set home, Log off, Status.\n"
        + "• Teleport me – the bot sends you a teleport offer to where it is.   • Go home – the bot teleports home.\n"
        + "• More ▸ Hover ▸ – lift or lower the bot in steps (Reset = the height set in AvieBoter).\n"
        + "• Stand / Fly ON / Fly OFF – one button that follows the bot: Stand while it sits, else it takes off or lands.\n"
        + "• Settings ▸ – Smaller/Bigger (or stretch the HUD in Edit), ring colour, floating text on/off, Unpair.\n"
        + "• The ring: your colour = ready, amber = working, red = failed.\n"
        + "• Another bot: in AvieBoter press Update HUD (or paste its pairing line, /7 pair SLB1|…). Bot ▸ switches between bots.");
}

default
{
    state_entry()
    {
        owner = llGetOwner();
        if (!lookOk()) applyLook(TRUE); else ringState("");     // self-healing: any reset brings the design back
        showText();
        llMessageLinked(LINK_THIS, 0, "slbm-ui|ask", NULL_KEY);
    }

    on_rez(integer p) { if (llGetOwner() != owner) llResetScript(); }

    attach(key id) { if (id) { if (!lookOk()) applyLook(TRUE); } }     // LSL: a key is tested on its own

    changed(integer c)
    {
        if (c & CHANGED_OWNER) llResetScript();
        if (c & CHANGED_LINK) applyLook(FALSE);
    }

    link_message(integer from, integer num, string str, key id)
    {
        if (str == "slbm-ui|ring") ringState((string)id);
        else if (str == "slbm-ui|text") { line2 = (string)id; showText(); }
        else if (str == "slbm-ui|status") lastStatus = (string)id;
        else if (str == "slbm-ui|pose") pose = (integer)((string)id);
        else if (str == "slbm-ui|hover") { hoverNow = (string)id; if (menu == "hover") hoverMenu(); }   // show the new height
    }

    touch_start(integer n)
    {
        if (llDetectedKey(0) != owner) return;
        act("quietstatus", []);     // keeps Stand / Fly ON / Fly OFF up to date
        mainMenu();
    }

    listen(integer ch, string name, key id, string msg)
    {
        if (ch != dialogChannel) return;
        llSetTimerEvent(90.0);
        if (menu == "sitkey") { menu = "main"; act("siton", [msg]); return; }
        if (menu == "outfit") { menu = "main"; act("outfit", [msg]); return; }
        if (menu == "confirm")
        {
            string a = pendingAction;
            pendingAction = "";
            if (msg == "Yes") act(a, []);
            else mainMenu();
            return;
        }
        if (menu == "bots")
        {
            if (msg == "◀ Back") { mainMenu(); return; }
            list b = bots();
            integer i;
            for (i = 0; i < botCount(); ++i)
            {
                string label = llList2String(b, i * 3 + 2);
                if (msg == llGetSubString(label, 0, 16) || msg == llGetSubString("● " + label, 0, 16))
                {
                    act("select", [(string)i]);
                    lastStatus = "not asked yet";
                    line2 = "";
                    showText();
                    mainMenu();
                    return;
                }
            }
            return;
        }
        if (menu == "hover")
        {
            if (msg == "◀ More") { moreMenu(); return; }
            if (llGetSubString(msg, 0, 4) == "Step ")
            {
                list steps = [0.01, 0.02, 0.05, 0.10];
                integer i = llListFindList(steps, [hoverStep]) + 1;
                if (i >= llGetListLength(steps)) i = 0;
                hoverStep = llList2Float(steps, i);
            }
            else if (msg == "Up ▲") act("adjust", ["up", (string)hoverStep]);
            else if (msg == "Down ▼") act("adjust", ["down", (string)hoverStep]);
            else if (msg == "Reset") act("adjust", ["reset", (string)hoverStep]);
            hoverMenu();
            return;
        }
        if (menu == "adjust")
        {
            if (msg == "◀ Menu") { mainMenu(); return; }
            if (llGetSubString(msg, 0, 4) == "Step ")
            {
                list steps = [0.02, 0.05, 0.10, 0.25];
                integer i = llListFindList(steps, [adjustStep]) + 1;
                if (i >= llGetListLength(steps)) i = 0;
                adjustStep = llList2Float(steps, i);
            }
            else
            {
                integer k = llListFindList(["Up ▲", "Down ▼", "Forward", "Backward", "Left", "Right", "Reset"], [msg]);
                if (k != -1) act("adjust", [llList2String(["up", "down", "forward", "back", "left", "right", "reset"], k), (string)adjustStep]);
            }
            adjustMenu();
            return;
        }
        if (menu == "follow")
        {
            if (msg == "◀ Menu") { mainMenu(); return; }
            if (msg == "Stop") { following = FALSE; act("unfollow", []); followMenu(); return; }
            if (msg == "Follow me") following = TRUE;
            else if (msg == "Closer" || msg == "Farther")
            {
                float d = fdist() + llList2Float([-0.5, 0.5], msg == "Farther");
                if (d < 0.5) d = 0.5;
                if (d > 10.0) d = 10.0;
                llLinksetDataWrite("fdist", (string)d);
            }
            else
            {
                integer k = llListFindList(["Behind", "Left side", "Right side", "In front"], [msg]);
                if (k != -1) llLinksetDataWrite("fang", llList2String(["180", "90", "270", "0"], k));
            }
            if (following) act("follow", [(string)fdist(), fang()]);
            followMenu();
            return;
        }
        if (menu == "more")
        {
            if (msg == "◀ Menu") { mainMenu(); return; }
            if (msg == "Hover ▸") { hoverMenu(); return; }
            if (msg == "Status") { act("status", []); return; }
            if (msg == "Log off…") confirm("logoff", "Log " + botLabel() + " out of Second Life?");
            else if (msg == "Set home…") confirm("sethome", "Make the place where " + botLabel() + " stands now its home?\n(Second Life allows this only on land where the bot may set home.)");
            return;
        }
        if (menu == "settings")
        {
            if (msg == "◀ Menu") { mainMenu(); return; }
            if (msg == "Smaller") resize(0.85);
            else if (msg == "Bigger") resize(1.0 / 0.85);
            else if (msg == "Hide text") { llLinksetDataWrite("text", "0"); showText(); }
            else if (msg == "Show text") { llLinksetDataWrite("text", "1"); showText(); }
            else if (msg == "Reset look") applyLook(TRUE);
            else if (msg == "Colour ▸")
            {
                dialog("colour", "\nRing colour:", ["◀ Back"] + llList2ListStrided(ACCENTS, 0, -1, 2));
                return;
            }
            else if (msg == "Help") { help(); return; }
            else if (msg == "Unpair…") { confirm("unpair", "Remove " + botLabel() + " from this HUD?\n(The bot itself is not changed.)"); return; }
            settingsMenu();
            return;
        }
        if (menu == "colour")
        {
            integer i = llListFindList(ACCENTS, [msg]);
            if (i != -1) { llLinksetDataWrite("accent", (string)(i / 2)); ringState(""); }
            settingsMenu();
            return;
        }
        // main menu
        if (msg == "Sit with me") { following = FALSE; act("sitwithme", []); }
        else if (msg == "Come to me") { following = FALSE; act("come", []); }
        else if (msg == "Stand") act("stand", []);
        else if (msg == "Fly ON") act("fly", ["on"]);
        else if (msg == "Fly OFF") act("fly", ["off"]);
        else if (msg == "Status") act("status", []);
        else if (msg == "Teleport me") act("lure", []);
        else if (msg == "Go home") act("gohome", []);
        else if (msg == "Log off…") confirm("logoff", "Log " + botLabel() + " out of Second Life?");
        else if (msg == "Set home…") confirm("sethome", "Make the place where " + botLabel() + " stands now its home?\n(Second Life allows this only on land where the bot may set home.)");
        else if (msg == "Bot ▸") botMenu();
        else if (msg == "Sit on…") textBox("sitkey", "\nSit " + botLabel() + " on which object?\n\nPaste the object's key (UUID).\nIn your viewer: Edit the object → General → Copy Keys.");
        else if (msg == "Outfit…") textBox("outfit", "\nWhich outfit should " + botLabel() + " wear?\n\nType the folder name (a folder in the bot's My Outfits, or any folder in its inventory). The current outfit is replaced.");
        else if (msg == "Adjust ▸") adjustMenu();
        else if (msg == "Follow ▸") followMenu();
        else if (msg == "More ▸") moreMenu();
        else if (msg == "Settings ▸") settingsMenu();
        else if (msg == "Help") help();
    }

    timer()
    {
        llSetTimerEvent(0.0);
        if (dialogListen) llListenRemove(dialogListen);
        dialogListen = 0;
    }
}
