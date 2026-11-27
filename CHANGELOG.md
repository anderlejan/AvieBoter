# Changelog

## 1.12.4
- Object menus: buttons whose label holds "|||" (dance machines use them, e.g. "• Dance All • |||120") could not be
  answered – the command was refused, nothing reached the object and its menu ran out. The app and HUD 1.7.6 now answer
  with the button's place in the menu; labels sent by older HUDs are matched even when spaces, bullets or "|||" got lost.
  A wrong answer no longer throws the menu away, and every choice is written to the bot's log.

## 1.12.3
- HUD 1.7.5: Touch… starts with Key… – paste the key of any object (or of one part of a linked object) the bot can
  see, also one that is not listed; the list below shows eight things at a time.

## 1.12.2
- HUD 1.7.4: the menu script of HUD 1.7.3 ran out of memory (Stack-Heap Collision) – the Touch… and Hover menus now
  live in the camera script, which has room, and the menu script is smaller than in 1.7.2.

## 1.12.1
- Animation sequences: objects that ask only to animate the bot are allowed at once (dance balls and sequences ask
  again for every animation, and the bot stopped after the first one); an object you allowed once is not asked again
  for two hours. "Animations without asking" in Nearby switches it.
- HUD 1.7.3: Touch… in the main menu – the touchable things near the bot, nine at a time; the bot touches the one you
  choose and its menu comes to your HUD. Outfit… moved to More ▸.
- HUD 1.7.3: after you touch the HUD or choose another bot, the menu shows that bot's real Stand / Fly ON / Fly OFF
  (it came again once the status arrived; before, it showed the last bot's state).
- Puppeteer: Fly and Run start from the bot's real state (changed from the HUD, say), and the buttons no longer flip
  back for a moment after a press.

## 1.12.0
- README and pictures for everything new since 1.4.3: Nearby, object menus, Inventory, Outfits, the script editor, the
  camera and the HUD's menus (HUD 1.7.2).

## 1.11.2
- The bot list was saved every few seconds while a bot was online and doing nothing, so its backups covered only the last minute; now it is saved only when something changes.

## 1.11.1
- A new empty notecard no longer reports a failed first save; saving a script inside an object starts it and says whether it runs.

## 1.11.0
- Inventory: new folders are made again (the bot failed before it sent the request); ＋ New ▾ makes a folder, notecard
  or script; notecards and scripts open in an editor and save (scripts compile and show their errors); rez in front of
  the bot, on the ground, in front of you or at a place in the region; put things into an object nearby.
- Nearby: Enter in the name box searches every object in the range (also the whole region); Contents of the objects the
  bot may change – open, edit and save notecards and scripts inside, take out, delete, new script or notecard; rename
  and describe objects; ＋ Box.
- Following: the bot flies while you fly and keeps your pace (it aims where you are going), lands when you land, and
  runs when you run or when it falls behind.
- Esc closes only the topmost window.

## 1.10.3
- Nearby: "the whole region" lists everything the region sent the bot, also far above or below it.

## 1.10.2
- 👗 Outfits in the Inventory: My Outfits as a gallery – wear, add, take off, rename, delete, save what the bot wears as
  a new outfit, and a picture for each (paste with Ctrl+V, drop or choose a file; kept on this PC).
- Object menus also pop up on the HUD of the person who uses the bot (HUD 1.7.2; "Menus on my HUD" in Nearby).
- Nearby: ranges up to the whole region – the bot looks further than 64 m for a few minutes when asked; the bot's own
  objects in range are always listed.
- Inventory: making a new folder failed ("Unable to cast … InventoryFolder"); fixed.

## 1.10.1
- Inventory: pictures show (1.10.0 could not turn them into an image); "About it" leaves out a wrong date.

## 1.10.0
- 🌍 Nearby: the objects around the bot – touch, sit, go to it, about it, look inside; the bot's own things: take, wear,
  delete (to its Trash), return; take a copy where allowed; filters for seats, touchable things and things for sale.
- Menus objects send the bot (llDialog), text boxes, permission questions and links appear in the app like a viewer's
  blue menus and are answered there.
- Inventory: listen to sounds or play them in-world, play and stop animations and gestures, show pictures, teleport to a
  landmark, read full-permission scripts. Renaming a folder uses the current inventory service.

## 1.9.2
- Inventory: the Worn view and the "worn" marks also work right after the bot logs in.

## 1.9.1
- Inventory: the Trash folder in the list opens the Trash view.

## 1.9.0
- 🎒 Inventory: the bot's inventory in the app – browse folders, search the whole inventory, see what it wears, and on
  items: add (keeps what is worn), wear, take off, rez in front of the bot, give, rename, move, delete to the Trash, read
  notecards, copy the key; on folders: open, add all, wear (replaces the outfit), take off all, give, rename, move,
  delete, new folder; the Trash: bring things back, empty it.

## 1.8.1
- HUD 1.7.1: the camera script of HUD 1.7.0 did not compile (a reserved word); fixed.

## 1.8.0
- The bot looks through its whole inventory once per login for anchor copies from earlier versions (Trash and outfit
  links tidied too).

## 1.7.9
- Camera anchor without care: every bot makes its one invisible "Anchor" soon after it logs in for the first time
  (where it may build; else in the next region it comes to) and keeps it in its inventory. It wears it only while a
  📷 Cam is on – also on land where nobody may build – and takes it off afterwards. Copies from earlier versions go to
  the Trash; an anchor deleted by accident is taken back out of the Trash, or made again if the Trash was emptied.
- HUD 1.7.0: the camera asks the bot for its anchor itself (also when switched on in the HUD menu, and again if the bot
  logged in anew), and sends it away when the camera goes off.

## 1.7.8
- 📷 Cam (HUD 1.6.9): only the bot's own anchor is used (a mesh body at Avatar Center sits off the centre and made the
  view stall while turning). The anchor is made in the bot's inventory, worn from there and kept in its outfit, and it
  sits 0.7 m above the centre, so the view frames the bot as before.

## 1.7.6
- 📷 Cam (HUD 1.6.7): turns in finer steps (as often as the region runs scripts) and frames the bot as before (the
  anchor sits at his hips). The bot wears its camera anchor again by itself after it logs in.

## 1.7.2
- HUD 1.6.6 keeps working on land where scripts are switched off (sandboxes and the like): it holds a control, which
  lets its scripts run there. Update it once where scripts run.
- 📷 Cam turns smoothly: the bot wears a tiny invisible "AvieBoter anchor" at its centre (made once when you switch the
  camera on where the bot may build). The viewer follows that point – the bot's real position, without the bobbing
  of the walk – and takes each new direction at once, so turning is one even circle instead of steps.

## 1.7.1
- 📷 Cam (HUD 1.6.5): no more lagging start when the bot sets off. Every new viewing direction makes the viewer glide
  its camera for half a second, and in that time it does not keep up with a walking bot; the HUD sent small
  corrections many times a second, so the camera stayed behind until he walked straight for a while. Now it re-aims
  only after a clear turn, and only when the previous glide has ended.

## 1.7.0
- 📷 Cam glides with the bot: with RLV switched on in the viewer, the viewer itself keeps your camera
  on the bot as it draws him, frame by frame – as when you Alt-click someone – so he no longer seems to jerk forward
  and back while he walks. The HUD only swings the view round behind him when he turns. Without RLV the camera is
  set by the HUD as before. Needs HUD 1.6.4.

## 1.6.9
- Puppeteer: after the bot comes to a stop it looks straight ahead again (it slides on a little after the keys).

## 1.6.8
- HUD 1.6.3: 📷 Cam follows the bot the way you see it face – when it turns, the camera swings round behind it
  smoothly; while it walks, the camera follows the way it walks. The bot no longer sends its heading to the HUD.

## 1.6.7
- HUD 1.6.2: the camera aims where your viewer shows a walking bot (it shows it a moment late), so the bot stays in
  view while it walks; the camera's settings can also be set from the app.

## 1.6.6
- A bot that was restarted (update, lost connection) still reaches the HUDs it knew, so 📷 Cam and the camera's
  heading work at once instead of only after the HUD has talked to the bot again.

## 1.6.5
- Puppeteer with 📷 Cam: the camera now turns exactly with your turn keys and stays straight behind the bot while it
  walks. Before, it followed the rotation the region reports, which trails a turn by about 20° and swings past the
  goal, so the view wobbled and pulled against the keys. Needs HUD 1.6.1 (it updates itself).
- HUD 1.6.1: the camera leads a walking bot a little instead of trailing it.

## 1.6.3
- Puppeteer: the bot's head turns at once the way you steer it, and the body follows, as with a person at a
  viewer. Before, others saw the head stay straight with a body that turns only in big steps, so it looked as if
  the bot ignored the turn keys.

## 1.6.2
- Puppeteer: the bot keeps the direction you turned it to. Before, it could snap back to an older facing when you
  started moving again after a pause, so it fought the arrow keys until it was turned by hand.

## 1.6.1
- Puppeteer drawn by Windows itself instead of a web page, so the see-through slider works; drag it by its title.
- Chat: the sound bell sits in each chat filter (🔔 on, 🔕 off) – no extra buttons.
- Overview: 🙋 Come to me (no HUD needed: the bot walks or teleports when it can see you, else it sends you a teleport
  request), Go to a place with 🚶 Walk to and Teleport, saved places, and 📋 buttons to copy the bot's name and key –
  selecting them is no longer undone by the refresh.
- Bot settings: where the bot logs in – the last place, its home or a place you choose.

## 1.6.0
- 🕹 Puppeteer made small, so the bot stays in view: compact buttons, the map only when 🗺 is switched on, and 📷 Cam:
  your HUD's camera stays behind the bot and looks the way it faces while you steer it. HUD 1.6.0 brings the camera
  (More ▸ Cam ▸: on/off, distance, height, tilt, side); a HUD older than 1.6 gets it with "Send me a new HUD" once.
- Notifications: IMs, group chats and local chat each have their own switches and their own sound (busy groups ring at
  most every 8 s, local chat every 15 s); quick 🔔 sound switches in the Chat section.

## 1.5.0
- Bots come back by themselves after a lost connection, a crash of the bot program or of AvieBoter itself, and do
  again what they did: sit down on the same seat or follow the same person ("Reconnecting" shows the next try; Stop
  ends it). Bots you stopped, logged off from the HUD, refused at login or logged in elsewhere stay off.
- Chat: new messages are counted per kind – ✉ IMs, 👥 groups, 💬 local chat, ⚙ objects – on the bot, on the Chat
  button and on each chat filter (now with a Groups filter of its own).
- 🕹 Puppeteer (Overview): a small window above all others, also above the viewer, to walk, turn, step aside, jump,
  fly and run the bot by hand (buttons or W A S D / arrows), with a map around the bot (the region's map picture on
  Second Life, avatars, chat range) and a see-through setting.
- HUD 1.5.0: Smaller / Bigger no longer save the look by themselves; Save look also keeps the ring colour; Reset look
  goes back to the saved or the original look and says what changed.

## 1.4.3
- Release of everything since 1.1.3 (1.2.0 – 1.4.1 below had no release of their own); README pictures of the app and
  the HUD updated, with the new Groups section.

## 1.4.1
- Answers to HUDs are plain UTF-8 text (no \u escapes); switching on "Alert me about new avatars" also checks the
  avatars already in the region.

## 1.4.0
- HUD 1.4.0 (needs AvieBoter 1.4.0) uses much less memory: the bots answer it in plain text with a short status instead
  of a web form three times as long, and word the HUD-update messages themselves.
- 👥 Groups: invitations to the bot wait under "Invitations" with a Windows notice until you accept or decline them
  (before, they were declined at once).
- Radar: "New only" lists avatars younger than the age you choose; "Alert me about new avatars" (off by default) pops up
  a Windows notice when one is in the bot's region, also with the Radar closed.

## 1.3.1
- Undeform keeps a seated bot's seat animations; Groups explains an empty member list.

## 1.3.0
- 👥 Groups: the bot's groups like a viewer's Groups window – active group, title, notices and profile switches, join an
  open group by key, leave; per group: invite with a role, group chat, group notice, members (online first, filter) with
  IM, profile, give or take roles and eject, as far as the bot's role allows.
- Overview → Undeform: stops every animation the bot plays and sends its appearance again after an outfit change left it
  deformed (a seated bot keeps its seat's animations).
- Radar: sortable columns, the avatars' age (from their profiles, new ones marked), 💬 for avatars in chat range (20 m)
  and an "In chat range" switch.
- Search and filter fields have a ✕ to clear them (Esc does the same).
- People who use the bot: ＋ Add no longer sends a HUD; ＋ Add and send a HUD is a button of its own.
- HUD 1.3.0: Reset look puts back exactly the saved look (shape, size, colours, rotation); Save look keeps the HUD as it
  is now, Smaller/Bigger keep their new size. Update HUD pressed in the HUD works even with automatic HUD updates off.

## 1.2.0
- Following across teleports: HUD 1.2.0 tells the following bot where you arrived and the bot teleports after you.
  With an older HUD (or none) the bot asks you for a teleport offer when it loses you (twice at most) and stops
  following only after 10 minutes out of sight (was 2).
- Update HUD in the HUD's Settings is enough on its own: the app first looks on GitHub for a newer HUD, then the bot
  brings it to the worn HUD.
- HUD 1.2.0 (needs AvieBoter 1.2.0), with the HUD changes published since 1.1.3: More ▸ Hover ▸ with 1/2/5/10 cm
  steps, Settings shows the HUD's version and whether it is the newest and has an Update HUD button that uses any
  paired bot in the region, and More ▸ Status works again.

## 1.1.2
- Following: when two teleports did not bring the bot to you (e.g. a parcel landing point), it sends you a teleport
  request once, like Come to me, and waits 90 s for your offer (at most one request every 2 minutes).

## 1.1.1
- New HUD versions can come from GitHub between app releases: the daily check also looks for a newer HUD that works
  with the installed app (hud/hud.json: version, oldest app it needs, SHA-256 of each script); the bots hand it out
  at once. Update HUD takes the newest HUD first and makes the worn HUD check its version.
- HUD 1.1.1: one Stand / Fly ON / Fly OFF button that follows the bot (Stand while it sits, else take off or land).
- Following no longer gives up behind walls: when the bot has not moved for 8 s and is more than 3 m away it teleports
  next to you, and it walks again when the server's autopilot stops. Following again after that starts afresh.

## 1.1.0
- Update HUD: puts every bot a person may use into the HUD they already wear – silently through a bot that HUD already
  uses, otherwise by an IM with a one-click link carrying a one-time code that works only for their own HUD.
- HUD: Teleport me – the bot sends you a teleport offer (Status moved to More ▸). HUD 1.1.0 uses a secure (https) address.
- New bots leave conference chats by default (switch them on in the bot's settings if wanted) and hover at 0.
- Changing the hover height applies at once to a running bot; the restart note shows only for changes that need one.

## 1.0.3
- Passwords saved before the rename to AvieBoter can be read again (1.0.1 asked for them again).

## 1.0.2
- Updates keep "Start AvieBoter when I sign in to Windows" switched on (an update used to remove it).

## 1.0.1
First public release (experimental).
- Runs Second Life bot avatars from the Windows tray with a patched SecondBot: start/stop, status, seats, outfits,
  home, chat and IMs with popups and sounds, radar with arrivals and departures, all SecondBot commands.
- A HUD the bot builds, pairs and keeps up to date: come to me, sit with me, follow, seats, adjustments when seated,
  resizable look, sharing a bot with friends.
- Automatic updates from GitHub releases (SHA-256 checked, installed while no bot is online; settings and bots kept).
