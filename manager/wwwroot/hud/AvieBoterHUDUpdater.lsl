// AvieBoter HUD updater 2 (script name "SL Bot HUD updater") - lets the paired bot update this HUD by itself. Keep this script in this prim (the ring).
// How it works: when the bot has a newer HUD, the HUD's core script tells this prim to accept scripts for a minute.
// The bot's courier hands them over; this script checks that the paired bot created them, then loads each into the
// main prim. Anything else dropped in is removed. Your pairings stay (they live in the HUD's linkset data).
// The HUD's menu script shapes this prim (the ring); this script never changes its look.
integer CH = -7710421;
integer PIN = 7710422;
key bot = NULL_KEY;
list queue = [];
list done = [];
integer asking = FALSE;

close()
{
    llAllowInventoryDrop(FALSE);
    llSetTimerEvent(0.0);
    bot = NULL_KEY;
}

next()
{
    if (asking || queue == []) return;
    asking = TRUE;
    llMessageLinked(LINK_ROOT, 0, "slbm-pin?", NULL_KEY);
}

default
{
    state_entry()
    {
        close();
        llSetObjectDesc("slbm-updater-2");     // the core script sends this prim's key only to bots when it sees this
    }

    on_rez(integer p) { close(); }

    changed(integer c)
    {
        if (c & CHANGED_OWNER) { close(); return; }
        if (!(c & CHANGED_ALLOWED_DROP)) return;
        integer n = llGetInventoryNumber(INVENTORY_ALL);
        while (n--)
        {
            string s = llGetInventoryName(INVENTORY_ALL, n);
            if (s != llGetScriptName() && llListFindList(queue, [s]) == -1)
            {
                if (bot != NULL_KEY && llGetInventoryType(s) == INVENTORY_SCRIPT && llGetInventoryCreator(s) == bot
                    && (s == "SL Bot HUD" || s == "SL Bot HUD menu"))
                {
                    queue += [s];
                    llSetTimerEvent(60.0);
                }
                else llRemoveInventory(s);
            }
        }
        next();
    }

    link_message(integer from, integer num, string str, key id)
    {
        if (str == "slbm-update-open" && id != NULL_KEY)
        {
            bot = id;
            queue = [];
            done = [];
            asking = FALSE;
            llAllowInventoryDrop(TRUE);
            llSetTimerEvent(60.0);
            llRegionSayTo(bot, CH, "SLBMUPD");
        }
        else if (str == "slbm-pin!" && asking)
        {
            asking = FALSE;
            if (queue == []) return;
            string s = llList2String(queue, 0);
            queue = llDeleteSubList(queue, 0, 0);
            llRemoteLoadScriptPin(llGetLinkKey(LINK_ROOT), s, PIN, TRUE, 0);
            llRemoveInventory(s);
            done += [s];
            if (llListFindList(done, ["SL Bot HUD"]) != -1 && llListFindList(done, ["SL Bot HUD menu"]) != -1) close();
            else next();
        }
    }

    timer()
    {
        if (bot != NULL_KEY && done == []) llOwnerSay("The HUD update did not arrive (is the bot in this region?). It will be tried again next time.");
        close();
        queue = [];
        asking = FALSE;
    }
}
