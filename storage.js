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
        };
    }
    return result;
}
export function safeImage(value) {
    // Uploaded raster images only; no SVG, remote URLs, or executable URLs in backups.
    return typeof value === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(value);
}
export function loadSettings(storage, key) { return sanitizeSettings(key ? readJSON(storage, key) : {}); }
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
