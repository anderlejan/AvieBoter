# Changelog

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
