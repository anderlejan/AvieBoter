# Makes the README screenshots from the page with the fake host (tests/mock.js) - fictional names only.
#   python tests/make_screenshots.py manager/wwwroot tests/mock.js docs/screenshots
import sys, os, http.server, threading, functools, shutil
from playwright.sync_api import sync_playwright
root, mock, out = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)
H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
here = os.path.dirname(os.path.abspath(__file__))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def translate_path(self, path):
        if path.startswith('/__hud/'): return os.path.join(here, os.path.basename(path.split('?')[0]))
        return super().translate_path(path)
H = functools.partial(Q, directory=root)
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), H); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
errors = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=shutil.which(os.environ.get('CHROME', 'google-chrome')), args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1280, 'height': 760})
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.add_init_script(path=mock)
    pg.goto(f'http://127.0.0.1:{port}/index.html'); pg.wait_for_timeout(600)
    shot = lambda n: pg.screenshot(path=os.path.join(out, n + '.png'))
    shot('welcome')
    pg.click('#btnAdd'); pg.fill('#fLabel', 'Passenger'); pg.fill('#fUser', 'examplebot'); pg.fill('#fPass', 'x')
    pg.fill('#fMasterIn', 'exampleowner'); pg.click('#fMasterAdd'); pg.wait_for_timeout(200); shot('add-bot')
    pg.click('.dlg .df .btn.pri'); pg.wait_for_timeout(400)
    pg.click('#bStart'); pg.wait_for_timeout(900)
    pg.fill('#seatName', 'Sofa'); pg.fill('#seatUuid', '11111111-2222-3333-4444-555555555555'); pg.click('#seatAdd'); pg.wait_for_timeout(300)
    pg.fill('#seatName', 'Jeep, passenger seat'); pg.fill('#seatUuid', 'a5af0b84-db98-a727-438f-272cac90dc21'); pg.click('#seatAdd'); pg.wait_for_timeout(300)
    pg.wait_for_timeout(3200); shot('overview')
    pg.click('[data-sec="chat"]'); pg.wait_for_timeout(500); shot('chat')
    pg.click('[data-sec="radar"]'); pg.wait_for_timeout(600); shot('radar')
    pg.click('[data-sec="hud"]'); pg.wait_for_timeout(400); shot('hud')
    pg.click('[data-sec="commands"]'); pg.wait_for_timeout(400); pg.fill('#cmdSearch', 'sit'); pg.wait_for_timeout(100)
    pg.click('[data-c="CompanionJoin"]'); pg.wait_for_timeout(200); shot('commands')
    pg.click('[data-sec="groups"]'); pg.wait_for_timeout(600); pg.click('#grpBody tr:nth-child(1) [data-gopen]'); pg.wait_for_timeout(700); shot('groups')
    pg.click('[data-sec="log"]'); pg.wait_for_timeout(600); shot('log')
    pg.click('[data-sec="bot"]'); pg.wait_for_timeout(400); shot('bot-settings')
    # Nearby, object menus, editing, inventory and outfits
    pg.click('[data-sec="world"]'); pg.wait_for_timeout(900); shot('nearby')
    pg.evaluate('window.__menusOn = true'); pg.wait_for_timeout(2600); shot('object-menus')
    pg.evaluate('window.__menusOn = false'); pg.wait_for_timeout(2600)
    pg.click('#wBody button[data-om="12"]'); pg.wait_for_timeout(200); pg.click('.menu div:has-text("Contents")'); pg.wait_for_timeout(500); shot('contents')
    pg.click('[data-ti="t1"] [data-ta="open"]'); pg.wait_for_timeout(500); shot('script-editor')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pg.click('[data-sec="inventory"]'); pg.wait_for_timeout(700); shot('inventory')
    pg.click('[data-m="it2"]'); pg.wait_for_timeout(200); shot('inventory-menu'); pg.keyboard.press('Escape'); pg.mouse.click(5, 740); pg.wait_for_timeout(200)
    # outfit pictures: simple drawn placeholders (no real photos)
    pg.evaluate("""(() => { window.__pics = {}; const c = [['#f7b267','#f4845f','🏖'],['#a06cd5','#6247aa','🎉'],['#a8dadc','#457b9d','🧤'],['#3d405b','#81b29a','🎩'],['#b5838d','#6d6875','🧭']];
      c.forEach((x, i) => { const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d');
        const gr = g.createLinearGradient(0, 0, 256, 256); gr.addColorStop(0, x[0]); gr.addColorStop(1, x[1]); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
        g.font = '120px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(x[2], 128, 136);
        window.__pics['11111111-0000-0000-0000-00000000000' + (i + 1)] = cv.toDataURL('image/jpeg', 0.9); }); })()""")
    pg.click('#invVO'); pg.wait_for_timeout(900); pg.click('[data-oc="11111111-0000-0000-0000-000000000002"] .oname'); pg.wait_for_timeout(200); shot('outfits')
    pg.click('[data-sec="overview"]'); pg.wait_for_timeout(400)
    pg.click('[data-sec="radar"]'); pg.wait_for_timeout(500); pg.click('[data-avm="aaaa-1"]'); pg.wait_for_timeout(200); shot('radar-menu'); pg.mouse.click(5, 740)
    pg.click('[data-sec="overview"]'); pg.wait_for_timeout(300)
    pg.click('#navList'); pg.wait_for_timeout(200); shot('history'); pg.mouse.click(5, 740)
    pg.click('#btnHelp'); pg.wait_for_timeout(300); shot('help'); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pg.evaluate("""(async () => { const n = [
        { id: 'n1', title: 'Seat list: sort by most used', details: 'Put the seats I use most on top.', area: 'Overview', type: 'improvement', priority: 'normal', status: 'open' },
        { id: 'n2', title: 'Radar: show distance in feet too', details: '', area: 'Radar', type: 'improvement', priority: 'low', status: 'queued' },
        { id: 'n3', title: 'Follow stops after a region crossing', details: 'Happens when I fly fast over the border.', area: 'HUD', type: 'fix', priority: 'high', status: 'sent' }];
      const t = new Date().toISOString(); n.forEach(x => { x.created = t; x.updated = t; });
      await new Promise(r => { window.chrome.webview.postMessage({ id: 99999, m: 'notes.save', a: [n] }); setTimeout(r, 50); }); })()""")
    pg.wait_for_timeout(200); pg.click('#btnNotes'); pg.wait_for_timeout(600); shot('user-notes'); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pg.click('#btnSettings'); pg.wait_for_timeout(300); shot('settings-top'); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pg.click('#btnSettings'); pg.wait_for_timeout(300)
    pg.evaluate("document.querySelector('#uState').scrollIntoView({block:'center'})"); pg.wait_for_timeout(100); shot('settings')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pg.evaluate("window.__pushUpdate(Object.assign({}, window.__upd, {available:{version:'1.13.0',page:''}, botsOnline:true}))"); pg.wait_for_timeout(200)
    shot('update')
    # the HUD (an illustration drawn from the HUD's script)
    hp = b.new_page(viewport={'width': 1280, 'height': 1440})
    hp.goto(f'http://127.0.0.1:{port}/__hud/hud-illustration.html'); hp.wait_for_timeout(300)
    hp.locator('#main').screenshot(path=os.path.join(out, 'hud-ingame.png'))
    hp.locator('#menus').screenshot(path=os.path.join(out, 'hud-menus.png'))
    b.close()
from PIL import Image
for f in os.listdir(out):
    Image.open(os.path.join(out, f)).convert('RGB').save(os.path.join(out, f), compress_level=9)
print('errors:', errors or 'none', '| files:', sorted(os.listdir(out)))
