import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createFileSettingsStore } from '../file-storage.js';
import { defaults, PREFIX, backup, importBackup, sanitizeSettings } from '../storage.js';

const key = `${PREFIX}::card.png::chat-one`;
const other = `${PREFIX}::card.png::chat-two`;
const image = 'data:image/webp;base64,YXZhdGFy';
const hash = (value, seed = 0) => parseInt(createHash('sha256').update(`${seed}:${value}`).digest('hex').slice(0, 12), 16);
function fixture() {
    const files = new Map(), browser = new Map(), retired = [];
    const f = { files, browser, retired, posts: [], fail: false, corrupt: false };
    f.legacy = {
        async capture(k) { const raw = browser.get(k); return { settings: raw ? sanitizeSettings(raw) : null, savedAt: raw?._savedAt || 0, local: JSON.stringify(raw) }; },
        async retire(k, captured) { if (captured?.settings && JSON.stringify(browser.get(k)) === captured.local) { retired.push(k); browser.delete(k); } },
        async keys() { return [...browser.keys()]; },
    };
    f.fetch = async (url, options) => {
        assert.equal(options.headers['X-CSRF-Token'], 'fixture');
        if (f.fail) return new Response('', { status: 503 });
        if (url === '/api/files/upload') {
            assert.equal(options.method, 'POST');
            const { name, data } = JSON.parse(options.body); f.posts.push(name);
            const bytes = f.corrupt ? Buffer.from('{}') : Buffer.from(data, 'base64'); files.set(name, bytes);
            return Response.json({ path: `/user/files/${name}` });
        }
        assert.equal(options.cache, 'no-store');
        const bytes = files.get(url.replace('/user/files/', ''));
        return bytes ? new Response(bytes) : new Response('', { status: 404 });
    };
    f.store = () => createFileSettingsStore({ fetch: f.fetch, getRequestHeaders: () => ({ 'Content-Type': 'application/json', 'X-CSRF-Token': 'fixture' }), hash, legacy: f.legacy });
    return f;
}
function settings(notes = 'Заметка\n第二行') {
    const data = defaults(); data.people['@user'] = { birthday: '20 июня', notes, image }; return data;
}

test('disk saves separate raster files, preserve Unicode, and isolate chats across new store instances', async () => {
    const f = fixture();
    const saved = await f.store().save(key, settings());
    assert.equal(saved.people['@user'].image, '');
    assert.match(saved.people['@user'].imageFile, /^wani-character-stats-avatar-.*\.webp$/);
    assert.equal(f.files.size, 2);
    const data = await f.store().load(key);
    assert.equal(data.people['@user'].birthday, '20 июня');
    assert.equal(data.people['@user'].notes, 'Заметка\n第二行');
    assert.equal((await f.store().load(other)).people['@user'], undefined);
    await f.store().save(other, settings('Другой чат'));
    assert.equal(f.files.size, 3, 'identical images share one verified file');
    assert.equal((await f.store().load(key)).people['@user'].notes, 'Заметка\n第二行');
});
test('legacy migration deletes only after both image and JSON have been read back successfully', async () => {
    const f = fixture(); f.browser.set(key, settings());
    const fetch = f.fetch;
    f.fetch = async (...args) => {
        assert.equal(f.browser.has(key), true, 'legacy copy exists during every upload and verification read');
        return fetch(...args);
    };
    const migrated = await f.store().load(key);
    assert.equal(migrated.people['@user'].notes, 'Заметка\n第二行');
    assert.deepEqual(f.retired, [key]); assert.equal(f.browser.has(key), false);
});
test('failed/corrupted uploads preserve legacy settings and provide recoverable UI data', async () => {
    for (const mode of ['fail', 'corrupt']) {
        const f = fixture(); f.browser.set(key, settings()); f[mode] = true;
        await assert.rejects(f.store().load(key), error => error.settings.people['@user'].birthday === '20 июня');
        assert.equal(f.browser.has(key), true); assert.deepEqual(f.retired, []);
    }
});
test('an unreadable settings file or colliding chat identity is never overwritten', async () => {
    const f = fixture(); const store = f.store(); await store.save(key, settings());
    const name = [...f.files.keys()].find(name => name.endsWith('.json'));
    const original = JSON.parse(f.files.get(name)); original.chatKey = other;
    f.files.set(name, Buffer.from(JSON.stringify(original)));
    const before = f.posts.length;
    await assert.rejects(store.save(key, settings('New')), /identity mismatch/);
    assert.equal(f.posts.length, before);
    f.files.set(name, Buffer.from('broken json'));
    await assert.rejects(store.load(key)); assert.equal(f.posts.length, before);
});
test('an existing JSON file does not retire a browser portrait when the image file is missing', async () => {
    const f = fixture(); const saved = await f.store().save(key, settings());
    f.browser.set(key, settings()); f.files.delete(saved.people['@user'].imageFile);
    await assert.rejects(f.store().load(key), /portrait is unavailable/);
    assert.equal(f.browser.has(key), true); assert.deepEqual(f.retired, []);
});
test('save snapshots are immutable, queued, and do not rely on browser storage being allowed', async () => {
    const f = fixture(); const store = f.store(); const data = settings('First');
    const first = store.save(key, data); data.people['@user'].notes = 'Second';
    const second = store.save(key, data); await first; await second;
    f.legacy.capture = async () => { throw new DOMException('Blocked', 'SecurityError'); };
    assert.equal((await f.store().load(key)).people['@user'].notes, 'Second');
    await f.store().save(key, settings('Third'));
    assert.equal((await f.store().load(key)).people['@user'].notes, 'Third');
    await assert.rejects(f.store().load(other), /Blocked/, 'unreadable legacy data is not silently replaced with defaults');
});
test('newer fallback data migrates over older disk data; cleanup preserves intervening browser edits', async () => {
    const f = fixture(); await f.store().save(key, settings('Disk'));
    f.browser.set(key, { ...settings('Newer browser'), _savedAt: Date.now() + 10000 });
    const capture = f.legacy.capture;
    f.legacy.capture = async k => { const result = await capture(k); f.browser.set(k, settings('Changed while uploading')); return result; };
    const data = await f.store().load(key);
    assert.equal(data.people['@user'].notes, 'Newer browser');
    assert.equal(f.browser.get(key).people['@user'].notes, 'Changed while uploading');
});
test('bulk migration moves other saved chats without modifying the excluded active chat', async () => {
    const f = fixture(); f.browser.set(key, settings('Active')); f.browser.set(other, settings('Other'));
    const result = await f.store().migrateAll(key);
    assert.deepEqual(result, { total: 1, migrated: 1, failed: 0 });
    assert.equal(f.browser.get(key).people['@user'].notes, 'Active');
    assert.equal(f.browser.has(other), false);
    assert.equal((await f.store().load(other)).people['@user'].notes, 'Other');
});
test('untrusted backup file paths cannot escape the avatar directory or carry installation-specific references', () => {
    const raw = settings(); raw.people['@user'].imageFile = '../../private.txt';
    assert.equal(sanitizeSettings(raw).people['@user'].imageFile, '');
    raw.people['@user'].imageFile = 'wani-character-stats-avatar-abc-def.webp';
    const restored = importBackup(backup(raw));
    assert.equal(restored.people['@user'].image, image); assert.equal(restored.people['@user'].imageFile, '');
});
