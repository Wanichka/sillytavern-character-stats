// Pure parsing and history replay. No prompt injection, network or DOM access.
export const METER_FIELDS = ['arousal', 'fatigue', 'pain'];
export const FIELDS = ['birthday', 'appearance', 'outfit', 'inventory', 'cycle', ...METER_FIELDS, 'state', 'location', 'notes', 'date', 'time', 'weather'];
export const clean = value => String(value ?? '').replace(/[\u3164\uFFA0\u00a0]/g, ' ').replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
export const nameKey = value => clean(value).normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase();
const own = (object, key) => Object.hasOwn(object || {}, key);
export function block(text, tag) {
    const matches = [...String(text).matchAll(new RegExp(`<${tag}\\s*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'gi'))];
    return matches.length ? clean(matches.at(-1)[1]) : null;
}

// Semicolons inside a value are retained unless followed by another Name:.
export function namedSegments(value, prefixes = '', knownNames = []) {
    if (value === null) return [];
    const text = clean(value).replace(new RegExp(`^\\s*(?:${prefixes || 'Outfit|State|Mood'})\\s*=\\s*`, 'i'), '');
    let headers = [...text.matchAll(/(?:^|;)\s*([^:;\n!?…=<>]{1,80}?)\s*:\s*/g)];
    const known = new Set(knownNames.map(nameKey));
    if (known.size) headers = headers.filter((header, index) => index === 0 || known.has(nameKey(header[1])));
    return headers.map((entry, i) => ({
        name: clean(entry[1]),
        text: clean(text.slice(entry.index + entry[0].length, headers[i + 1]?.index ?? text.length)),
    }));
}

export function resolveOwner(name, settings = {}, profile = {}) {
    const wanted = nameKey(name);
    // Explicit chat aliases take precedence over inherited avatar-set aliases.
    for (const [owner, item] of Object.entries(settings.people || {})) {
        if (nameKey(owner) === wanted || (item.aliases || []).some(alias => nameKey(alias) === wanted)) return owner;
    }
    for (const [owner, aliases] of Object.entries(profile.aliases || {})) {
        if (nameKey(owner) === wanted || aliases.some(alias => nameKey(alias) === wanted)) return owner;
    }
    const owners = new Set([
        ...Object.keys(profile.avatars || {}), ...Object.keys(profile.uploads || {}),
        ...Object.keys(profile.displayNames || {}), ...(profile.characters || []),
    ]);
    return [...owners].find(owner => nameKey(owner) === wanted) || clean(name);
}

export function displayName(name, settings = {}, profile = {}) {
    return settings.people?.[name]?.displayName || profile.displayNames?.[resolveOwner(name, {}, profile)] || name;
}

const CHAR_TAGS = [
    ['char_info', 'info', 'Info'], ['char_outfit', 'outfit', 'Outfit'],
    ['char_notes', 'state', 'State'], ['char_mood', 'mood', 'Mood'],
    ['char_arousal', 'arousal', 'Arousal'], ['char_fatigue', 'fatigue', 'Fatigue'], ['char_pain', 'pain', 'Pain'],
];
const presenceNames = raw => clean(raw).replace(/\([^)]*\)/g, '').replace(/[.。]\s*$/, '').split(/[,;\n]+/).map(clean).filter(Boolean);
const presenceParts = value => value.split(/\s+(?:and|и|&)\s+|\s*&\s*/i).map(clean).filter(Boolean);

// A character the model forgot to add to char_info is still a real boundary when
// the same "Name:" header opens a segment in two or more fields, or the name is
// listed in char_around. A one-off "; label:" inside a description is neither.
function corroboratedNames(chars, presence) {
    const seen = new Map();
    for (const [tag, , prefix] of CHAR_TAGS) {
        if (tag === 'char_info') continue;
        for (const key of new Set(namedSegments(block(chars, tag), prefix).map(entry => nameKey(entry.name)))) {
            if (!seen.has(key)) seen.set(key, { count: 0 });
            seen.get(key).count++;
        }
    }
    const around = presence === null ? [] : presenceNames(presence).flatMap(value => [value, ...presenceParts(value)]).map(nameKey);
    const present = new Set(around);
    return [...seen].filter(([key, item]) => item.count >= 2 || present.has(key)).map(([key]) => key);
}

export function parseMessage(raw, knownNames = []) {
    // Reasoning is never a source of established scene facts.
    const text = String(raw ?? '').replace(/<(think|thinking|analysis)>[\s\S]*?<\/\1>/gi, '');
    const user = block(text, 'user_stats');
    const general = block(text, 'general_stats');
    const chars = block(text, 'char_stats');
    const result = { user: {}, scene: {}, characters: [], presence: null, name: null };
    if (user !== null) {
        for (const field of ['outfit', 'inventory', 'cycle', ...METER_FIELDS]) {
            const value = block(user, field);
            if (value !== null) result.user[field] = value;
        }
        // "Name's inventory:" / "Инвентарь Имени:" is a label, not a possession.
        if (result.user.inventory) result.user.inventory = clean(result.user.inventory.replace(/^(?:(?:[^:;\n]{1,80}?['’]s\s+)?inventory|инвентарь(?:\s+[^:;\n]{1,60})?)\s*:\s*/i, ''));
        const info = block(user, 'basic_info');
        const name = info?.match(/^(.+?)(?:['’]s\s+appearance|\s*:\s*(?:appearance|внешность))\s*:/i);
        if (name) result.name = clean(name[1]);
        if (info !== null) result.user.info = name ? clean(info.slice(name[0].length)) : info;
    }
    if (general !== null) {
        for (const field of ['location', 'date', 'time', 'weather']) {
            const value = block(general, field);
            if (value !== null) result.scene[field] = value;
        }
        const around = block(general, 'char_around');
        // Names never contain a colon, so any short leading "Label:" is a prefix in whatever language.
        if (around !== null) result.presence = around.replace(/^[^:,;\n()]{1,40}:\s*/, '');
    }
    if (chars !== null) {
        const people = new Map();
        const infoNames = namedSegments(block(chars, 'char_info'), 'Info').map(entry => entry.name);
        const hints = infoNames.length ? [...knownNames, ...infoNames, ...corroboratedNames(chars, result.presence)] : [];
        for (const [tag, field, prefix] of CHAR_TAGS) {
            for (const entry of namedSegments(block(chars, tag), prefix, tag === 'char_info' ? [] : hints)) {
                const key = nameKey(entry.name);
                if (!people.has(key)) people.set(key, { name: entry.name, fields: {} });
                people.get(key).fields[field] = entry.text;
            }
        }
        result.characters = [...people.values()];
    }
    return result;
}

// Only explicit age units count; height/weight and story dates are not ages.
export function ageFromInfo(value) {
    return clean(value).match(/(?:^|[;:,])\s*(?:age\s*[:=]?\s*)?(\d{1,4}(?:[.,]\d+)?\s*(?:лет|года?|years?(?:\s+old)?|y\.?o\.?))(?=\s|[;,.()]|$)/i)?.[1] || '';
}

export function presenceFor(name, raw, settings = {}, profile = {}) {
    if (raw === null) return 'unknown';
    const owner = resolveOwner(name, settings, profile);
    // Parentheses may describe absent people; do not count their names as present.
    const matches = value => nameKey(resolveOwner(value, settings, profile)) === nameKey(owner);
    // A whole entry wins first, so a name that itself contains "and" still matches.
    return presenceNames(raw).some(value => matches(value) || presenceParts(value).some(matches)) ? 'present' : 'absent';
}

// `cache` is an optional WeakMap keyed by message object. A message is parsed again
// only when its text (edit, swipe) or the set of known names has changed.
export function replay(messages, settings = {}, profile = {}, userName = 'User', cache = null) {
    const state = { user: { name: userName, fields: {} }, scene: {}, characters: Object.create(null), presence: null, source: null };
    const assign = (target, values, source) => {
        for (const [key, value] of Object.entries(values)) target[key] = { value, source };
    };
    messages.forEach((message, index) => {
        if (!message || message.is_user || message.is_system) return;
        const knownNames = [
            ...Object.values(state.characters).map(item => item.name),
            ...Object.keys(settings.people || {}), ...Object.values(settings.people || {}).flatMap(item => item.aliases || []),
            ...Object.keys(profile.aliases || {}), ...Object.values(profile.aliases || {}).flat(),
        ];
        const names = cache ? knownNames.join('\u0000') : '';
        let entry = cache?.get(message);
        if (!entry || entry.mes !== message.mes || entry.names !== names) {
            entry = { mes: message.mes, names, parsed: parseMessage(message.mes, knownNames) };
            cache?.set(message, entry);
        }
        const parsed = entry.parsed;
        const source = index + 1;
        if (parsed.name) state.user.name = parsed.name;
        assign(state.user.fields, parsed.user, source);
        assign(state.scene, parsed.scene, source);
        if (parsed.presence !== null) state.presence = parsed.presence;
        for (const character of parsed.characters) {
            const owner = resolveOwner(character.name, settings, profile);
            const key = nameKey(owner);
            if (!own(state.characters, key)) state.characters[key] = { name: owner, fields: {} };
            assign(state.characters[key].fields, character.fields, source);
        }
        state.source = source;
    });
    for (const person of Object.values(state.characters)) person.presence = presenceFor(person.name, state.presence, settings, profile);
    return state;
}

export function cycleDetails(value) {
    const text = clean(value);
    const match = text.match(/^(Day|Week)\s*:\s*([^,;\n]+?)(?:\s*,\s*([\s\S]*?))?\s*;\s*Pregnancy\s*:\s*([^;]*);\s*Risk\s*:\s*([\s\S]*)$/i);
    if (!match) return null; // Preserve unfamiliar formats as plain text.
    const fields = {
        week: match[1].toLowerCase() === 'week',
        phase: clean(match[3]),
        pregnancy: clean(match[4]),
        risk: clean(match[5]),
    };
    const count = clean(match[2]);
    if (/^(?:не\s*применимо|not applicable|n\/a)$/i.test(count)) return { ...fields, count, progress: null };
    const numbers = count.match(/^(\d+)(?:\+(\d+))?\s*\/\s*(\d+)$/);
    if (!numbers || match[3] === undefined) return null;
    const [, currentText, daysText = '0', totalText] = numbers;
    const current = Number(currentText), days = Number(daysText), total = Number(totalText);
    const { week } = fields;
    if (!total || current > total || (week && days > 6)) return null;
    return { ...fields, count: `${current}${week ? `+${days}` : ''} / ${total}`, progress: Math.min(100, Math.max(0, (current + (week ? days / 7 : 0)) / total * 100)) };
}

export function meterDetails(value) {
    const match = clean(value).match(/^(\d+(?:[.,]\d+)?)\s*%?\s*\/\s*100\s*%?(?:\s*\(([\s\S]*)\))?$/);
    if (!match) return null;
    const level = Number(match[1].replace(',', '.'));
    if (!Number.isFinite(level) || level > 100) return null;
    return { level, comment: clean(match[2]) };
}

export function validateAliases(owner, aliases, settings, profile, roster = []) {
    const claimed = new Set([owner, ...aliases].map(nameKey));
    const candidates = new Set([
        ...roster, ...Object.keys(settings.people || {}), ...Object.keys(profile.aliases || {}),
        ...Object.keys(profile.avatars || {}), ...Object.keys(profile.uploads || {}),
        ...Object.keys(profile.displayNames || {}), ...(profile.characters || []),
    ]);
    for (const other of candidates) {
        if (nameKey(resolveOwner(other, settings, profile)) === nameKey(owner)) continue;
        const names = [other, ...(settings.people?.[other]?.aliases || []), ...(profile.aliases?.[other] || [])];
        const configured = settings.people?.[other];
        const hasAssignment = configured?.image || configured?.displayName || configured?.aliases?.length || configured?.age || configured?.birthday || configured?.notes
            || profile.uploads?.[other] || profile.avatars?.[other] || profile.displayNames?.[other] || profile.aliases?.[other]?.length;
        // A bare observed duplicate may be merged; configured identities cannot.
        if (hasAssignment && names.some(name => claimed.has(nameKey(name)))) return other;
    }
    return null;
}
