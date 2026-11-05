import { FIELDS, clean } from './core.js';
export const PREFIX = 'wani_character_stats_v1';
export const defaults = () => ({ people: Object.create(null), roster: [], selected: '@user', filter: 'scene', visible: Object.fromEntries(FIELDS.map(field => [field, true])), shareAvatars: true, profileId: '', language: 'ru' });
export function chatKey(context) {
    let id;
    try { id = context?.getCurrentChatId?.() ?? context?.chatId; } catch { return null; }
    if (id === null || id === undefined || id === '') return null;
    const card = context?.groupId != null ? `group:${context.groupId}` : context?.characters?.[context.characterId]?.avatar;
    return card ? `${PREFIX}::${encodeURIComponent(card)}::${encodeURIComponent(id)}` : null;
}
export function readJSON(storage, key, fallback = {}) {
    try { const value = JSON.parse(storage.getItem(key)); return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback; }
    catch { return fallback; }
}
export function sanitizeSettings(raw = {}) {
    const result = defaults();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
    result.language = raw.language === 'en' ? 'en' : 'ru';
    result.filter = raw.filter === 'all' ? 'all' : 'scene';
    result.selected = typeof raw.selected === 'string' ? raw.selected : '@user';
    result.shareAvatars = raw.shareAvatars !== false;
    result.profileId = typeof raw.profileId === 'string' ? raw.profileId : '';
    for (const field of FIELDS) result.visible[field] = raw.visible?.[field] !== false;
    result.roster = Array.isArray(raw.roster) ? [...new Set(raw.roster.filter(name => typeof name === 'string').map(clean).filter(Boolean))] : [];
    for (const [name, item] of Object.entries(raw.people || {})) {
        if (!name || ['__proto__', 'constructor', 'prototype'].includes(name) || !item || typeof item !== 'object') continue;
        result.people[name] = {
            displayName: typeof item.displayName === 'string' ? item.displayName : '',
            aliases: Array.isArray(item.aliases) ? item.aliases.filter(alias => typeof alias === 'string').map(clean).filter(Boolean) : [],
            image: safeImage(item.image) ? item.image : '',
            age: typeof item.age === 'string' ? item.age.trim().slice(0, 30) : '',
            birthday: typeof item.birthday === 'string' ? item.birthday.trim().slice(0, 60) : '',
            notes: typeof item.notes === 'string' ? item.notes.slice(0, 2000) : '',
        };
    }
    return result;
}
export function safeImage(value) {
    // Uploaded raster images only; no SVG, remote URLs, or executable URLs in backups.
    return typeof value === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(value);
}
export function loadSettings(storage, key) { return sanitizeSettings(key ? readJSON(storage, key) : {}); }

// Keep legacy localStorage records readable. If its small shared quota is full,
// save only this extension's settings to IndexedDB; never clear other site data.
export function createSettingsStore(environment) {
    let opening, pending = Promise.resolve(), revision = 0;
    function database() {
        if (!opening) opening = new Promise((resolve, reject) => {
            if (!environment.indexedDB) { reject(new Error('IndexedDB is unavailable')); return; }
            const request = environment.indexedDB.open(PREFIX, 1);
            let finished = false;
            const fail = error => { if (!finished) { finished = true; clearTimeout(timer); reject(error); } };
            const timer = setTimeout(() => fail(new Error('IndexedDB open timed out')), 5000);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains('chats')) request.result.createObjectStore('chats');
            };
            request.onerror = () => fail(request.error || new Error('IndexedDB open failed'));
            request.onblocked = () => fail(new Error('IndexedDB is blocked'));
            request.onsuccess = () => {
                const db = request.result;
                if (finished) { db.close(); return; }
                finished = true; clearTimeout(timer);
                db.onversionchange = () => { db.close(); opening = null; };
                resolve(db);
            };
        }).catch(error => { opening = null; throw error; });
        return opening;
    }
    async function readDatabase(key) {
        const db = await database();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction('chats', 'readonly');
            const request = transaction.objectStore('chats').get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            transaction.onabort = () => reject(transaction.error || new Error('IndexedDB read aborted'));
        });
    }
    async function writeDatabase(key, snapshot) {
        const db = await database();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction('chats', 'readwrite');
            transaction.objectStore('chats').put(snapshot, key);
            // A successful request alone does not mean its transaction committed.
            transaction.oncomplete = () => resolve();
            transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('IndexedDB write aborted'));
        });
    }
    const stamp = value => Number.isFinite(value?._savedAt) ? value._savedAt : 0;
    return {
        async load(key) {
            if (!key) return defaults();
            await pending.catch(() => {});
            let local, stored, localError, databaseError;
            try {
                const raw = environment.localStorage.getItem(key);
                local = raw ? readJSON({ getItem: () => raw }, key, null) : null;
            } catch (error) { localError = error; }
            try { stored = await readDatabase(key); } catch (error) { databaseError = error; }
            if (!local && !stored && localError && databaseError) throw new AggregateError([localError, databaseError], 'Settings storage is unavailable');
            const latest = stored && (!local || stamp(stored) >= stamp(local)) ? stored : local;
            revision = Math.max(revision, stamp(latest));
            return sanitizeSettings(latest);
        },
        save(key, settings) {
            if (!key) return Promise.reject(new Error('No active chat'));
            const snapshot = sanitizeSettings(settings);
            pending = pending.catch(() => {}).then(async () => {
                revision = Math.max(Date.now(), revision + 1); snapshot._savedAt = revision;
                try { environment.localStorage.setItem(key, JSON.stringify(snapshot)); return; }
                catch (localError) {
                    try { await writeDatabase(key, snapshot); }
                    catch (databaseError) { throw new AggregateError([localError, databaseError], 'Could not save Character Stats'); }
                }
            });
            return pending;
        },
    };
}

export function sharedProfile(storage, context, settings) {
    if (!settings.shareAvatars) return {};
    const profiles = readJSON(storage, 'ct_profiles_v1');
    const card = context?.groupId != null ? `group:${context.groupId}` : context?.characters?.[context.characterId]?.avatar ? `card:${context.characters[context.characterId].avatar}` : '';
    const id = settings.profileId || readJSON(storage, 'ct_cardmap_v2')[card];
    return profiles[id] || {};
}
export function backup(settings) {
    return { format: 'wani-character-stats', version: 1, settings: sanitizeSettings(settings) };
}
export function importBackup(value) {
    if (value?.format !== 'wani-character-stats' || value.version !== 1 || !value.settings || typeof value.settings !== 'object') throw new Error('Invalid Character Stats backup');
    return sanitizeSettings(value.settings);
}
