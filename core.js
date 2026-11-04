// Pure parsing and history replay. No prompt injection, network or DOM access.
export const FIELDS = ['outfit', 'inventory', 'cycle', 'state', 'location', 'date', 'time', 'weather'];
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

export function parseMessage(raw, knownNames = []) {
    // Reasoning is never a source of established scene facts.
    const text = String(raw ?? '').replace(/<(think|thinking|analysis)>[\s\S]*?<\/\1>/gi, '');
    const user = block(text, 'user_stats');
    const general = block(text, 'general_stats');
    const chars = block(text, 'char_stats');
    const result = { user: {}, scene: {}, characters: [], presence: null, name: null };
    if (user !== null) {
        for (const field of ['outfit', 'inventory', 'cycle']) {
            const value = block(user, field);
            if (value !== null) result.user[field] = value;
        }
        const info = block(user, 'basic_info');
        const name = info?.match(/^(.+?)(?:['’]s\s+appearance|\s*:\s*(?:appearance|внешность))\s*:/i);
        if (name) result.name = clean(name[1]);
    }
    if (general !== null) {
        for (const field of ['location', 'date', 'time', 'weather']) {
            const value = block(general, field);
            if (value !== null) result.scene[field] = value;
        }
        const around = block(general, 'char_around');
        if (around !== null) result.presence = around.replace(/^Characters\s+around\s*:\s*/i, '');
    }
    if (chars !== null) {
        const people = new Map();
        const infoNames = namedSegments(block(chars, 'char_info'), 'Info').map(entry => entry.name);
        const hints = infoNames.length ? [...knownNames, ...infoNames] : [];
        for (const [tag, field, prefix] of [
            ['char_info', 'info', 'Info'], ['char_outfit', 'outfit', 'Outfit'],
            ['char_notes', 'state', 'State'], ['char_mood', 'mood', 'Mood'],
        ]) {
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

export function presenceFor(name, raw, settings = {}, profile = {}) {
    if (raw === null) return 'unknown';
    const owner = resolveOwner(name, settings, profile);
    // Parentheses may describe absent people; do not count their names as present.
    const list = clean(raw).replace(/\([^)]*\)/g, '').replace(/[.。]\s*$/, '');
    const names = list.split(/[,;\n]+/).map(clean).filter(Boolean);
    return names.some(value => nameKey(resolveOwner(value, settings, profile)) === nameKey(owner)) ? 'present' : 'absent';
}

export function replay(messages, settings = {}, profile = {}, userName = 'User') {
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
        const parsed = parseMessage(message.mes, knownNames);
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
    const match = text.match(/^(Day|Week)\s*:\s*(\d+)(?:\+(\d+))?\s*\/\s*(\d+)\s*,\s*([\s\S]*?);\s*Pregnancy\s*:\s*([^;]*);\s*Risk\s*:\s*([\s\S]*)$/i);
    if (!match) return null; // Preserve unfamiliar formats as plain text.
    const current = Number(match[2]), days = Number(match[3] || 0), total = Number(match[4]);
    const week = match[1].toLowerCase() === 'week';
    if (!total || current > total || (week && days > 6)) return null;
    return { week, count: `${current}${week ? `+${days}` : ''} / ${total}`, phase: match[5], pregnancy: match[6], risk: match[7], progress: Math.min(100, Math.max(0, (current + (week ? days / 7 : 0)) / total * 100)) };
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
        const hasAssignment = configured?.image || configured?.displayName || configured?.aliases?.length
            || profile.uploads?.[other] || profile.avatars?.[other] || profile.displayNames?.[other] || profile.aliases?.[other]?.length;
        // A bare observed duplicate may be merged; configured identities cannot.
        if (hasAssignment && names.some(name => claimed.has(nameKey(name)))) return other;
    }
    return null;
}
