import { PREFIX, defaults, sanitizeSettings, safeImage, safeImageFile } from './storage.js';

const FORMAT = 'wani-character-stats-files';
export const fileUrl = name => `/user/files/${name}`;

// Uses SillyTavern's authenticated, atomic file-upload endpoint. No server plugin.
export function createFileSettingsStore({ fetch, getRequestHeaders, hash, legacy }) {
    let pending = Promise.resolve();
    const suffix = value => `${hash(value).toString(36)}-${hash(value, 1).toString(36)}`;
    const filename = key => `wani-character-stats-chat-${suffix(key)}.json`;
    const queue = action => { const result = pending.catch(() => {}).then(action); pending = result; return result; };
    const options = () => ({ headers: getRequestHeaders(), cache: 'no-store' });
    const request = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
    function validateKey(key) { if (!key?.startsWith(`${PREFIX}::`)) throw new Error('Invalid chat key'); }
    function base64(bytes) {
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return btoa(binary);
    }
    async function read(key) {
        const response = await request(fileUrl(filename(key)), options());
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`Could not read settings: HTTP ${response.status}`);
        const data = await response.json();
        if (data?.format !== FORMAT || data.version !== 1 || data.chatKey !== key || !Number.isFinite(data.savedAt) || !data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings) || !data.settings.people || typeof data.settings.people !== 'object' || Array.isArray(data.settings.people) || !Array.isArray(data.settings.roster)) throw new Error('Invalid settings file or chat identity mismatch');
        return data;
    }
    async function upload(name, data) {
        const response = await request('/api/files/upload', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ name, data }) });
        if (!response.ok) throw new Error(`Could not save file: HTTP ${response.status}`);
        const result = await response.json();
        if (result?.path?.replace(/^\//, '') !== `user/files/${name}`) throw new Error('Unexpected uploaded file path');
    }
    async function imageFile(data) {
        if (!safeImage(data)) throw new Error('Invalid portrait');
        const name = `wani-character-stats-avatar-${suffix(data)}.${data.match(/^data:image\/([^;]+);/i)[1].toLowerCase()}`;
        const expected = data.slice(data.indexOf(',') + 1).replace(/\s/g, '');
        let response = await request(fileUrl(name), options());
        if (response.status === 404) {
            await upload(name, expected);
            response = await request(fileUrl(name), options());
        }
        if (!response.ok || base64(new Uint8Array(await response.arrayBuffer())) !== expected) throw new Error('Portrait verification failed');
        return name;
    }
    async function write(key, settings, captured, previous) {
        const snapshot = sanitizeSettings(settings);
        for (const person of Object.values(snapshot.people)) {
            if (person.image) { person.imageFile = await imageFile(person.image); person.image = ''; }
            else if (person.imageFile && !safeImageFile(person.imageFile)) throw new Error('Invalid portrait filename');
        }
        const data = { format: FORMAT, version: 1, chatKey: key, savedAt: Math.max(Date.now(), (previous?.savedAt || 0) + 1, (captured?.savedAt || 0) + 1), settings: snapshot };
        await upload(filename(key), base64(new TextEncoder().encode(JSON.stringify(data))));
        const verified = await read(key);
        if (JSON.stringify(verified) !== JSON.stringify(data)) throw new Error('Settings verification failed');
        await legacy.retire(key, captured);
        return snapshot;
    }
    async function load(key) {
        if (!key) return defaults();
        validateKey(key);
        let captured, previous, diskError, browserError;
        try { captured = await legacy.capture(key); } catch (error) { browserError = error; }
        try { previous = await read(key); } catch (error) { diskError = error; }
        // Show recoverable browser data on an outage, while keeping writes guarded by read().
        if (diskError) { if (captured?.settings) diskError.settings = captured.settings; throw diskError; }
        if (!previous && browserError) throw browserError;
        if (captured?.settings && (!previous || captured.savedAt > (previous.savedAt || 0))) {
            try { return await write(key, captured.settings, captured, previous); }
            catch (error) { error.settings = captured.settings; throw error; }
        }
        if (previous) {
            const settings = sanitizeSettings(previous.settings);
            if (captured?.settings) {
                // An existing JSON file alone is insufficient if its portraits have disappeared.
                try {
                    for (const name of new Set(Object.values(settings.people).map(person => person.imageFile).filter(Boolean))) {
                        const response = await request(fileUrl(name), options());
                        if (!response.ok || !(await response.arrayBuffer()).byteLength) throw new Error('Stored portrait is unavailable; browser copy preserved');
                    }
                } catch (error) { error.settings = captured.settings; throw error; }
            }
            await legacy.retire(key, captured); return settings;
        }
        return defaults();
    }
    return {
        load: key => queue(() => load(key)),
        save(key, settings) {
            const snapshot = sanitizeSettings(settings);
            return queue(async () => {
                validateKey(key);
                // Never overwrite an unreadable file, a hash collision, or another chat.
                const previous = await read(key);
                let captured;
                try { captured = await legacy.capture(key); } catch { /* Disk saves do not depend on browser policy. */ }
                return write(key, snapshot, captured, previous);
            });
        },
        async migrateAll(excludeKey) {
            const keys = (await legacy.keys()).filter(key => key !== excludeKey);
            const result = { total: keys.length, migrated: 0, failed: 0 };
            for (const key of keys) {
                try { await queue(() => load(key)); result.migrated++; }
                catch (error) { result.failed++; console.error('[Character Stats] Migration failed', error); }
            }
            return result;
        },
    };
}
