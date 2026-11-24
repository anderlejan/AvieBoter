# Changelog

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
