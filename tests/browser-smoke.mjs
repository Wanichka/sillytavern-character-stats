// Optional dependency-free Chromium integration check. Uses an isolated profile.
// Run with CHROME_PATH if Chrome is installed elsewhere. Writes screenshots to .test-artifacts.
import http from 'node:http';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, '.test-artifacts');
await mkdir(out, { recursive: true });
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><style>
:root {--SmartThemeBlurTintColor:#211f17;--SmartThemeBodyColor:#e6dfce;--SmartThemeQuoteColor:#dfb57b;--mainFontFamily:Georgia,serif;--SmartThemeBlurStrength:10;}body{margin:0;background:radial-gradient(ellipse at top left,#3b4834,#141711);min-height:100vh;color:#e6dfce}button{cursor:pointer} [hidden]{display:none!important}
</style><link rel="stylesheet" href="/scripts/extensions/third-party/sillytavern-character-stats/style.css"></head><body>
<script>
window.handlers={};window.emit=(type)=>{for(const cb of handlers[type]||[])cb()};
window.ctx={chatId:'chat-one',name1:'Алиса',characters:[{avatar:'law.png',name:'Law'}],characterId:0,chat:[{mes:\`<user_stats><basic_info>Алиса's appearance: adult</basic_info><outfit>Чёрная водолазка; тёмно-зелёный кардиган; клетчатая юбка; ботинки на шнуровке; подвеска-полумесяц.</outfit><inventory>Сумка, телефон, ключи от квартиры, свитер.</inventory><cycle>Day: 8/28, фолликулярная фаза; Pregnancy: No; Risk: None</cycle></user_stats><general_stats><location>Нью-Йорк · Манхэттен\nДом Скандинавии, внутренний сад</location><date>Четверг, 05.11.26</date><time>15:05</time><weather>Ясный осенний день ☀</weather><char_around>Characters around: Камилла (Ло в метро)</char_around></general_stats><char_stats><char_info>Ло: adult ; Камилла: adult</char_info><char_outfit>Outfit = Ло: Тёмная рубашка и джинсы ; Камилла: Джинсовая рубашка</char_outfit><char_notes>State = Ло: В метро по пути на съёмку ; Камилла: Во внутреннем саду</char_notes><char_mood>Mood = Ло: собранный ; Камилла: сосредоточенная</char_mood></char_stats>\`}]};
window.SillyTavern={getContext:()=>window.ctx};
localStorage.clear();localStorage.setItem('ct_profiles_v1',JSON.stringify({p:{name:'Modern AU',aliases:{'Ло':['Law']},displayNames:{'Ло':'Ло Трафальгар'},avatars:{},uploads:{},characters:['Ло']}}));localStorage.setItem('ct_cardmap_v2',JSON.stringify({'card:law.png':'p'}));
</script><script type="module" src="/scripts/extensions/third-party/sillytavern-character-stats/index.js"></script></body></html>`;
const server = http.createServer(async (req, res) => {
    try {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return; }
        if (pathname === '/script.js') {
            res.setHeader('Content-Type', 'text/javascript');
            res.end(`export const event_types=Object.fromEntries(['CHAT_CHANGED','MESSAGE_RECEIVED','MESSAGE_EDITED','MESSAGE_UPDATED','MESSAGE_SWIPED','MESSAGE_DELETED','GENERATION_ENDED'].map(x=>[x,x]));export const eventSource={on:(name,cb)=>(window.handlers[name]||=[]).push(cb)};`); return;
        }
        let file;
        if (pathname === '/host.js' || pathname === '/host.css') file = path.join(out, pathname.slice(1));
        else if (pathname.startsWith('/scripts/extensions/third-party/sillytavern-character-stats/')) file = path.join(root, path.basename(pathname));
        else { res.writeHead(404); res.end(); return; }
        res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const profile = await import('node:fs/promises').then(fs => fs.mkdtemp(path.join(out, 'chrome-')));
const chrome = process.env.CHROME_PATH || (os.platform() === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'chromium');
const child = spawn(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let connection, browserSocket;
try {
    const browserURL = await new Promise((resolve, reject) => {
        let buffer = '';
        const timeout = setTimeout(() => reject(new Error('Chrome startup timed out')), 15000);
        child.once('error', reject);
        child.stderr.on('data', chunk => { buffer += chunk; const match = buffer.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
    });
    async function connect(socketURL) {
        const socket = new WebSocket(socketURL); await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
        let id = 0; const pending = new Map(); const errors = [];
        socket.onmessage = event => { const value = JSON.parse(event.data); if (value.id) { const item = pending.get(value.id); if (!item) return; clearTimeout(item.timeout); pending.delete(value.id); value.error ? item.reject(value.error) : item.resolve(value.result); } else if (value.method === 'Runtime.exceptionThrown') errors.push(value.params.exceptionDetails); };
        return { socket, errors, send(method, params = {}) { return new Promise((resolve, reject) => { const key = ++id; const timeout = setTimeout(() => { pending.delete(key); reject(new Error(`CDP timeout: ${method}`)); }, 15000); pending.set(key, { resolve, reject, timeout }); socket.send(JSON.stringify({ id: key, method, params })); }); } };
    }
    browserSocket = await connect(browserURL);
    const target = await browserSocket.send('Target.createTarget', { url: 'about:blank' });
    const targets = await fetch(browserURL.replace(/^ws:/, 'http:').replace(/\/devtools\/browser\/.+/, '/json/list')).then(response => response.json());
    connection = await connect(targets.find(item => item.id === target.targetId).webSocketDebuggerUrl);
    const send = connection.send;
    await send('Runtime.enable'); await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1050, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url });
    const evaluate = async expression => {
        const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
        return result.result.value;
    };
    const waitFor = async expression => {
        for (let i = 0; i < 50; i++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
        throw new Error(`Timed out: ${expression}`);
    };
    await waitFor(`!!document.querySelector('#cs-launcher')`);
    await evaluate(`document.querySelector('#cs-launcher').click()`);
    await waitFor(`document.querySelector('.cs-time .cs-value')?.textContent==='15:05'`);
    assert.equal(await evaluate(`document.querySelectorAll('.cs-choice').length`), 2); // user + Camilla
    assert.equal(await evaluate(`!!document.querySelector('.cs-layout .cs-state')`), false);
    assert.equal(await evaluate(`!!document.querySelector('.cs-ornament')||!!document.querySelector('.cs-scene-label')`), false);
    assert.ok((await evaluate(`getComputedStyle(document.querySelector('.cs-person-heading h2')).fontFamily`)).includes('Times New Roman'));
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.cs-person-heading')).borderBottomStyle`), 'solid');
    assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('.cs-cycle')).backgroundColor`), await evaluate(`getComputedStyle(document.querySelector('.cs-outfit')).backgroundColor`));
    // Block values are rendered as text, never as executable HTML.
    await evaluate(`ctx.chat[0].mes+='<user_stats><inventory>&lt;img src=x onerror=alert(1)&gt;</inventory></user_stats>';emit('MESSAGE_EDITED')`);
    await waitFor(`document.querySelector('.cs-inventory .cs-value')?.textContent.includes('onerror')`);
    assert.equal(await evaluate(`document.querySelectorAll('.cs-inventory img').length`), 0);
    await evaluate(`ctx.chat[0].mes=ctx.chat[0].mes.replace(/<user_stats><inventory>&lt;img[\\s\\S]*$/,'');emit('MESSAGE_EDITED')`);
    await waitFor(`!document.querySelector('.cs-inventory .cs-value')?.textContent.includes('onerror')`);
    const screenshot = async name => { const result = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(out, name), Buffer.from(result.data, 'base64')); };
    await screenshot('desktop.png');
    await evaluate(`document.querySelectorAll('.cs-filter button')[1].click(); [...document.querySelectorAll('.cs-choice')].find(b=>b.textContent.includes('Ло Трафальгар')).click()`);
    assert.equal(await evaluate(`document.querySelector('.cs-state .cs-value').textContent`), 'В метро по пути на съёмку');
    assert.equal(await evaluate(`!!document.querySelector('.cs-inventory')||!!document.querySelector('.cs-cycle')||!!document.querySelector('.cs-location')`), false);
    assert.equal(await evaluate(`document.querySelector('.cs-presence').textContent`), 'Вне сцены');
    await screenshot('npc.png');
    // Theme changes are live, including contrast on a light theme.
    await evaluate(`document.documentElement.style.setProperty('--SmartThemeBlurTintColor','#f4efe3');document.documentElement.style.setProperty('--SmartThemeBodyColor','#29251d');document.documentElement.style.setProperty('--SmartThemeQuoteColor','#80572a')`);
    await screenshot('light.png');
    await evaluate(`document.documentElement.removeAttribute('style');document.querySelector('.cs-choice').click()`);
    // Alias editor and local display names survive reopening settings.
    await evaluate(`document.querySelector('[aria-label="Настройки"]').click()`);
    await waitFor(`!!document.querySelector('.cs-settings')`);
    await evaluate(`var inputs=document.querySelectorAll('.cs-settings input[type=text]');inputs[0].value='Алиса ✦';document.querySelector('.cs-primary').click()`);
    assert.equal(await evaluate(`JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('wani_character_stats_v1::')))).people['@user'].displayName`), 'Алиса ✦');
    // Configure NPC aliases and custom display labels without touching Thoughts.
    await evaluate(`var selects=document.querySelectorAll('.cs-settings select');var who=selects[selects.length-1];who.value='Ло';who.dispatchEvent(new Event('change'))`);
    await evaluate(`var textInputs=document.querySelectorAll('.cs-settings input[type=text]');textInputs[0].value='Капитан';textInputs[1].value='Трафальгар, Captain';document.querySelector('.cs-primary').click()`);
    assert.equal(await evaluate(`JSON.parse(localStorage.getItem('ct_profiles_v1')).p.displayNames['Ло']`), 'Ло Трафальгар');
    assert.equal(await evaluate(`JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('wani_character_stats_v1::')))).people['Ло'].aliases.includes('Captain')`), true);
    // Exercise the actual portrait file picker and canvas upload path.
    const png = path.join(out, 'portrait.png');
    await writeFile(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=', 'base64'));
    await evaluate(`window.realClick=HTMLInputElement.prototype.click;HTMLInputElement.prototype.click=function(){if(this.type==='file')window.testFileInput=this;else window.realClick.call(this)};document.querySelector('.cs-setting-actions button:nth-child(2)').click()`);
    async function chooseFile(file) {
        const document = await send('DOM.getDocument');
        const { nodeId } = await send('DOM.querySelector', { nodeId: document.root.nodeId, selector: 'input[type=file]' });
        assert.ok(nodeId);
        await send('DOM.setFileInputFiles', { nodeId, files: [file] });
    }
    await chooseFile(png);
    await waitFor(`JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('wani_character_stats_v1::')))).people['Ло'].image?.startsWith('data:image/')`);
    // Backup download includes the uploaded image; importing restores edited labels.
    const downloads = path.join(out, `downloads-${Date.now()}`); await mkdir(downloads);
    await browserSocket.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    await evaluate(`[...document.querySelectorAll('.cs-settings button')].find(b=>b.textContent==='Экспорт').click()`);
    let exported;
    for (let i = 0; i < 50; i++) {
        const files = await readdir(downloads); const match = files.find(file => file.endsWith('.json'));
        if (match) { exported = path.join(downloads, match); break; } await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(exported, 'Backup file downloaded');
    const savedBackup = JSON.parse(await readFile(exported, 'utf8'));
    assert.ok(savedBackup.settings.people['Ло'].image.startsWith('data:image/'));
    assert.equal(savedBackup.settings.people['@user'].displayName, 'Алиса ✦');
    await evaluate(`document.querySelector('.cs-settings input[type=text]').value='Изменено';document.querySelector('.cs-primary').click();window.confirm=()=>true;[...document.querySelectorAll('.cs-settings button')].find(b=>b.textContent==='Импорт').click()`);
    await chooseFile(exported);
    await waitFor(`JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('wani_character_stats_v1::')))).people['Ло'].displayName==='Капитан'`);
    // Shared uploaded avatars are used directly, without a second live copy.
    await evaluate(`var shared=JSON.parse(localStorage.getItem('ct_profiles_v1'));shared.p.uploads['Ло']=JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('wani_character_stats_v1::')))).people['Ло'].image;localStorage.setItem('ct_profiles_v1',JSON.stringify(shared));document.querySelectorAll('.cs-setting-actions button')[2].click()`);
    await waitFor(`!JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('wani_character_stats_v1::')))).people['Ло'].image`);
    await evaluate(`document.querySelector('[aria-label="Назад"]').click()`);
    await evaluate(`[...document.querySelectorAll('.cs-choice')].find(b=>b.textContent.includes('Капитан')).click()`);
    await waitFor(`!!document.querySelector('.cs-portrait-image img')`);
    await waitFor(`document.querySelector('.cs-portrait-image').classList.contains('cs-has-image')`);
    assert.ok(await evaluate(`Math.abs(document.querySelector('.cs-portrait-image').clientHeight-document.querySelector('.cs-portrait-image').clientWidth)<2`), 'Square avatar has a square frame');
    assert.equal(await evaluate(`document.querySelector('.cs-portrait-image img').src===JSON.parse(localStorage.getItem('ct_profiles_v1')).p.uploads['Ло']`), true);
    await evaluate(`var tall=document.createElement('canvas');tall.width=10;tall.height=30;tall.getContext('2d').fillRect(0,0,10,30);var shared=JSON.parse(localStorage.getItem('ct_profiles_v1'));shared.p.uploads['Ло']=tall.toDataURL();localStorage.setItem('ct_profiles_v1',JSON.stringify(shared));document.querySelector('[aria-label="Обновить данные"]').click()`);
    await waitFor(`document.querySelector('.cs-portrait-image img')?.naturalHeight===30`);
    assert.ok(await evaluate(`Math.abs(document.querySelector('.cs-portrait-image').clientHeight/document.querySelector('.cs-portrait-image').clientWidth-3)<.03`), 'Tall portrait keeps its native aspect ratio');
    await evaluate(`document.querySelector('.cs-choice').click()`);
    // Changing a swipe removes old scene fields and updates the selected outfit.
    await evaluate(`ctx.chat[0].mes='<user_stats><outfit>Новое платье</outfit></user_stats>';emit('MESSAGE_SWIPED')`);
    await waitFor(`document.querySelector('.cs-outfit .cs-value')?.textContent==='Новое платье'`);
    assert.equal(await evaluate(`!!document.querySelector('.cs-time')`), false);
    await evaluate(`ctx.chat=[];emit('MESSAGE_DELETED')`);
    await waitFor(`document.querySelector('.cs-outfit .cs-value')?.textContent==='Нет данных'`);
    await evaluate(`ctx.chatId='chat-two';emit('CHAT_CHANGED')`);
    await waitFor(`document.querySelector('.cs-person-heading h2')?.textContent==='Алиса'`);
    assert.equal(await evaluate(`document.querySelectorAll('.cs-choice').length`), 1);
    await evaluate(`ctx.chat[0]={mes:'<user_stats><outfit>Кардиган и клетчатая юбка</outfit><inventory>Сумка, телефон, ключи</inventory><cycle>Day: 8/28, текущая фаза; Pregnancy: No; Risk: None</cycle></user_stats><general_stats><location>Внутренний сад</location><date>Чт, 05.11.26</date><time>15:05</time><weather>Ясно ☀</weather></general_stats>'};emit('MESSAGE_RECEIVED')`);
    await waitFor(`document.querySelector('.cs-time .cs-value')?.textContent==='15:05'`);
    // Mobile remains reachable without page-level horizontal scrolling.
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await screenshot('mobile.png');
    assert.equal(await evaluate(`document.querySelector('.cs-body').scrollWidth<=document.querySelector('.cs-body').clientWidth+1`), true);
    // Real optional host integration, when its fixtures were fetched locally.
    try {
        await readFile(path.join(out, 'host.js'));
        await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1050, deviceScaleFactor: 1, mobile: false });
        await evaluate(`var css=document.createElement('link');css.rel='stylesheet';css.href='/host.css';document.head.append(css);var host=document.createElement('script');host.type='module';host.src='/host.js';document.body.append(host)`);
        await waitFor(`!!window.WaniRoleplayTools`);
        await evaluate(`window.WaniRoleplayTools.open('character-stats')`);
        await waitFor(`document.querySelector('#cs-panel')?.dataset.rptDocked==='true'`);
        await screenshot('docked.png');
        assert.equal(await evaluate(`document.querySelector('#cs-panel').getBoundingClientRect().width>100`), true);
        assert.equal(await evaluate(`document.querySelector('.cs-body').scrollWidth<=document.querySelector('.cs-body').clientWidth+1`), true);
    } catch (error) { if (error.code !== 'ENOENT') throw error; console.log('Host fixtures not present; host integration skipped.'); }
    assert.deepEqual(connection.errors, []);
    console.log('Browser checks passed: user/NPC fields, aliases, themes, swipe/delete rollback, chat isolation, mobile and optional Roleplay Tools docking.');
} finally {
    if (browserSocket) { try { await browserSocket.send('Browser.close'); } catch {} browserSocket.socket.close(); }
    connection?.socket.close(); child.kill(); server.close();
}
