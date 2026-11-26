# hud/hud.json: what the app reads from GitHub to take a newer HUD between app releases (see manager/Core/HudScripts.cs).
#   python build/hud-manifest.py [--min-app X.Y.Z]   writes it (keeps minApp unless given)
#   python build/hud-manifest.py --check             exits 1 when it does not match the scripts (the build runs this)
# minApp = the oldest AvieBoter whose bot has every command this HUD uses - raise it when the HUD needs new bot commands.
import hashlib, json, os, re, sys

here = os.path.dirname(os.path.abspath(__file__))
hud = os.path.join(here, '..', 'hud')
files = ['AvieBoterHUD.lsl', 'AvieBoterHUDMenu.lsl', 'AvieBoterHUDUpdater.lsl', 'AvieBoterHUDCam.lsl']
path = os.path.join(hud, 'hud.json')


def sha_lf(name):
    data = open(os.path.join(hud, name), 'rb').read().replace(b'\r\n', b'\n')
    return hashlib.sha256(data).hexdigest()


core = open(os.path.join(hud, files[0]), encoding='utf-8').read()
version = re.search(r'string\s+VERSION\s*=\s*"([^"]+)"', core).group(1)
old = json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {}
min_app = sys.argv[sys.argv.index('--min-app') + 1] if '--min-app' in sys.argv else old.get('minApp', version)
want = {'version': version, 'minApp': min_app, 'files': {f: sha_lf(f) for f in files}}

if '--check' in sys.argv:
    if old != want:
        print('hud/hud.json does not match the HUD scripts: run python build/hud-manifest.py')
        sys.exit(1)
    print('hud.json ok: HUD ' + version + ', needs app ' + min_app)
else:
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(want, f, indent=1)
        f.write('\n')
    print('wrote hud.json: HUD ' + version + ', needs app ' + min_app)
