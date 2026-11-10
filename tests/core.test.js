import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clean, nameKey, parseMessage, namedSegments, replay, presenceFor, cycleDetails, meterDetails, resolveOwner, validateAliases, ageFromInfo } from '../core.js';
import { chatKey, loadSettings, sharedProfile, backup, importBackup, defaults, createSettingsStore } from '../storage.js';

const assistant = mes => ({ mes });
const user = content => `<user_stats>${content}</user_stats>`;
const chars = content => `<char_stats>${content}</char_stats>`;
const general = content => `<general_stats>${content}</general_stats>`;
const memory = data => ({ getItem: key => data[key] || null });

test('reads only selected fields, scoped to their parent blocks', () => {
    const result = parseMessage(user(`<basic_info>Алиса's appearance: 25 лет; рыжая</basic_info><outfit>Кардиган; аксессуары: кольцо</outfit><inventory>Сумка, телефон</inventory><cycle>Day: 8/28, phase; Pregnancy: No; Risk: None</cycle><user_notes>ignored</user_notes>`) + general('<location>Сад</location><time>15:05</time>') + '<outfit>outside user block</outfit>');
    assert.equal(result.name, 'Алиса'); assert.equal(result.user.outfit, 'Кардиган; аксессуары: кольцо');
    assert.deepEqual(Object.keys(result.user), ['outfit', 'inventory', 'cycle', 'info']);
    assert.equal(result.user.info, '25 лет; рыжая');
    assert.equal(result.scene.time, '15:05'); assert.equal(result.scene.location, 'Сад');
});
test('normalizes Hangul filler spaces and supports multiple NPCs without losing description semicolons', () => {
    const data = chars('<char_info>ЛоㅤТрафальгар:ㅤ19ㅤлет;ㅤ191ㅤсм;ㅤстройный ; Росинант: 32 года; высокий</char_info><char_outfit>Outfitㅤ=ㅤЛоㅤТрафальгар: рубашка; аксессуары: кольцо ; Росинант: кардиган</char_outfit><char_notes>State = ЛоㅤТрафальгар: в метро ; Росинант: в магазине</char_notes>');
    const result = parseMessage(data);
    assert.equal(result.characters.length, 2); assert.equal(result.characters[0].name, 'Ло Трафальгар');
    assert.equal(result.characters[0].fields.outfit, 'рубашка; аксессуары: кольцо');
    assert.equal(result.characters[1].fields.state, 'в магазине');
    assert.equal(nameKey(' ЛОㅤТрафальгар '), 'ло трафальгар'); assert.equal(clean('a\r\n b'), 'a\n b');
});
test('new characters are discovered when char_info is missing', () => {
    const result = replay([assistant(chars('<char_outfit>Outfit = A: coat ; B: hat</char_outfit>')), assistant(chars('<char_outfit>Outfit = A: coat ; C: scarf</char_outfit>'))]);
    assert.deepEqual(Object.keys(result.characters), ['a', 'b', 'c']);
});
test('history replay carries omitted fields but respects empty and explicit None', () => {
    const result = replay([assistant(user('<outfit>coat</outfit><inventory>bag</inventory>')), assistant(user('<inventory></inventory>')), assistant(general('<weather>None</weather>'))]);
    assert.deepEqual(result.user.fields.outfit, { value: 'coat', source: 1 });
    assert.deepEqual(result.user.fields.inventory, { value: '', source: 2 });
    assert.equal(result.scene.weather.value, 'None');
});
test('swipes, edits and deletions remove superseded future facts', () => {
    const messages = [assistant(user('<outfit>coat</outfit>')), assistant(user('<outfit>shirt</outfit>') + general('<location>Future city</location>'))];
    assert.equal(replay(messages).user.fields.outfit.value, 'shirt');
    messages[1].mes = user('<outfit>dress</outfit>');
    assert.equal(replay(messages).user.fields.outfit.value, 'dress'); assert.equal(replay(messages).scene.location, undefined);
    messages.pop(); assert.equal(replay(messages).user.fields.outfit.value, 'coat');
});
test('user, system and reasoning text cannot introduce stats', () => {
    const result = replay([{ is_user: true, mes: user('<outfit>fake</outfit>') }, { is_system: true, mes: general('<time>01:00</time>') }, assistant('<think>' + user('<inventory>fake</inventory>') + '</think>')]);
    assert.deepEqual(result.user.fields, {}); assert.deepEqual(result.scene, {});
});
test('shared aliases merge NPCs; display labels do not change identity', () => {
    const profile = { aliases: { 'Ло Трафальгар': ['Ло', 'Law'] }, displayNames: { 'Ло Трафальгар': 'Капитан' } };
    const result = replay([assistant(chars('<char_outfit>Outfit = Ло: coat</char_outfit>')), assistant(chars('<char_notes>State = Law: in train</char_notes>'))], {}, profile);
    assert.equal(Object.keys(result.characters).length, 1);
    assert.equal(result.characters['ло трафальгар'].fields.outfit.value, 'coat');
    assert.equal(resolveOwner(' LAW ', {}, profile), 'Ло Трафальгар');
});
test('presence comes from char_around, not char_stats or parenthetical remote notes', () => {
    const result = replay([assistant(chars('<char_info>A: adult ; B: adult ; C: adult</char_info>') + general('<char_around>Characters around: A, C (B is in the train)</char_around>'))]);
    assert.equal(result.characters.a.presence, 'present'); assert.equal(result.characters.b.presence, 'absent'); assert.equal(result.characters.c.presence, 'present');
    assert.equal(replay([assistant(chars('<char_info>A: adult</char_info>'))]).characters.a.presence, 'unknown');
});
test('presence resolves aliases and handles empty lists', () => {
    const settings = { people: { Alpha: { aliases: ['A'] } } };
    let result = replay([assistant(chars('<char_info>Alpha: adult</char_info>') + general('<char_around>Characters around: A</char_around>'))], settings);
    assert.equal(result.characters.alpha.presence, 'present');
    result = replay([assistant(chars('<char_info>Alpha: adult</char_info>') + general('<char_around></char_around>'))], settings);
    assert.equal(result.characters.alpha.presence, 'absent');
});
test('alias collisions include saved roster, inherited aliases and custom labels', () => {
    assert.equal(validateAliases('A', ['Bee'], {}, { aliases: { B: ['Bee'] } }, ['A', 'B']), 'B');
    assert.equal(validateAliases('A', ['B'], {}, {}, ['A', 'B']), null);
    assert.equal(validateAliases('A', ['B'], { people: { B: { displayName: 'Bee' } } }, {}, ['A', 'B']), 'B');
    assert.equal(validateAliases('A', ['Alpha'], {}, {}, ['A', 'B']), null);
});
test('cycle supports menstrual and pregnancy formats without reinterpreting unknown text', () => {
    assert.equal(cycleDetails('Day: 8/28, phase (effects); Pregnancy: No; Risk: None').count, '8 / 28');
    const pregnancy = cycleDetails('Week: 12+3/40, trimester (effects); Pregnancy: Yes; Risk: None');
    assert.equal(pregnancy.week, true); assert.equal(pregnancy.count, '12+3 / 40');
    assert.equal(cycleDetails('Week: 12+8/40, phase; Pregnancy: Yes; Risk: None'), null);
    assert.equal(cycleDetails('Unknown'), null);
});
test('chat identity isolates cards, chats and groups; no unbound global state', () => {
    const make = (avatar, id) => ({ characters: [{ avatar }], characterId: 0, chatId: id });
    assert.notEqual(chatKey(make('one.png', 'same')), chatKey(make('two.png', 'same')));
    assert.notEqual(chatKey(make('one.png', 'one')), chatKey(make('one.png', 'two')));
    assert.notEqual(chatKey({ groupId: 'one', chatId: 'same' }), chatKey(make('one.png', 'same')));
    assert.equal(chatKey({}), null); assert.equal(chatKey(make('one.png', '')), null);
});
test('shared avatars follow card bindings or explicit chat set, without modifying Thoughts data', () => {
    const data = { ct_profiles_v1: JSON.stringify({ p: { uploads: { A: 'avatar' } }, q: { name: 'Second' } }), ct_cardmap_v2: JSON.stringify({ 'card:one.png': 'p' }) };
    const original = JSON.stringify(data), storage = memory(data);
    const ctx = { characters: [{ avatar: 'one.png' }], characterId: 0 };
    assert.equal(sharedProfile(storage, ctx, defaults()).uploads.A, 'avatar');
    assert.equal(sharedProfile(storage, ctx, { shareAvatars: true, profileId: 'q' }).name, 'Second');
    assert.deepEqual(sharedProfile(storage, ctx, { shareAvatars: false }), {}); assert.equal(JSON.stringify(data), original);
});
test('backup round trip preserves local images and settings, rejects other files', () => {
    const settings = defaults(); settings.people.A = { aliases: ['Alpha'], displayName: 'Captain', image: 'data:image/png;base64,YQ==' }; settings.visible.cycle = false;
    const restored = importBackup(JSON.parse(JSON.stringify(backup(settings))));
    assert.equal(restored.people.A.image, settings.people.A.image); assert.equal(restored.visible.cycle, false);
    assert.throws(() => importBackup({ hello: 'world' }));
    assert.equal(loadSettings(memory({}), 'missing').selected, '@user');
});
test('untrusted backup values do not introduce executable images or prototypes', () => {
    const result = importBackup({ format: 'wani-character-stats', version: 1, settings: JSON.parse('{"people":{"__proto__":{"bad":true},"A":{"image":"javascript:alert(1)","aliases":[null,"Alpha"]}},"visible":{"time":false}}') });
    assert.equal(result.people.A.image, ''); assert.deepEqual(result.people.A.aliases, ['Alpha']); assert.equal(Object.hasOwn(result.people, '__proto__'), false);
    assert.equal(result.visible.time, false);
});
test('literal hostile character names remain ordinary dictionary keys', () => {
    const result = replay([assistant(chars('<char_info>__proto__: adult ; constructor: adult</char_info>'))]);
    assert.equal(Object.keys(result.characters).length, 2); assert.equal(result.characters.__proto__.fields.info.value, 'adult');
});
test('a semicolon without a new name remains in the same description', () => {
    assert.deepEqual(namedSegments('Outfit = A: coat; hat ; B: boots'), [{ name: 'A', text: 'coat; hat' }, { name: 'B', text: 'boots' }]);
});

test('appearance is replayed from basic_info and removed with its source message', () => {
    const first = assistant(user("<basic_info>User's appearance: 21 years old; 175 cm; brown eyes</basic_info>"));
    const second = assistant(user('<basic_info>Age: 22 years; 175 cm</basic_info>'));
    assert.equal(replay([first]).user.fields.info.value, '21 years old; 175 cm; brown eyes');
    assert.equal(ageFromInfo(replay([first, second]).user.fields.info.value), '22 years');
    assert.equal(ageFromInfo(replay([first]).user.fields.info.value), '21 years old');
    assert.equal(replay([]).user.fields.info, undefined);
    assert.equal(replay([first, assistant(user('<basic_info></basic_info>'))]).user.fields.info.value, '');
});

test('age requires an explicit age unit and does not mistake height or dates for age', () => {
    for (const [info, age] of [['19 лет; 191 см', '19 лет'], ['32 года; высокий', '32 года'], ['Age: 25 years old; hair', '25 years old'], ['age = 19 yo; eyes', '19 yo']]) assert.equal(ageFromInfo(info), age);
    for (const info of ['172 см; 48 кг', 'Birthday: 20.06.2000', 'tall; 19 tattoos', 'unknown']) assert.equal(ageFromInfo(info), '');
});

test('birth dates, legacy ages and multiline notes survive backups and remain chat-local', () => {
    const settings = defaults();
    settings.people.A = { birthday: '20 июня', age: '22 года', notes: 'Знаком с B.\nДругая запись.' };
    const restored = importBackup(JSON.parse(JSON.stringify(backup(settings))));
    assert.equal(restored.people.A.age, '22 года'); assert.equal(restored.people.A.notes, settings.people.A.notes);
    assert.equal(restored.people.A.birthday, '20 июня');
    assert.equal(defaults().visible.birthday, true);
    assert.equal(validateAliases('B', ['A'], restored, {}, ['A', 'B']), 'A');
    assert.equal(loadSettings(memory({}), 'another-chat').people.A, undefined);
    const invalid = importBackup({ format: 'wani-character-stats', version: 1, settings: { people: { A: { age: 24, birthday: 2000, notes: { text: 'ignored' } } } } });
    assert.equal(invalid.people.A.age, ''); assert.equal(invalid.people.A.notes, '');
    assert.equal(invalid.people.A.birthday, '');
});

test('settings store reads legacy data and serializes immutable snapshots per chat', async () => {
    const records = new Map([['first', JSON.stringify({ people: { A: { birthday: '20 июня' } } })], ['other', JSON.stringify({ people: { A: { notes: 'Other chat' } } })]]);
    const localStorage = { getItem: key => records.get(key) || null, setItem: (key, value) => records.set(key, value) };
    const store = createSettingsStore({ localStorage });
    assert.equal((await store.load('first')).people.A.birthday, '20 июня');
    const draft = defaults(); draft.people.A = { notes: 'Snapshot' };
    const saving = store.save('first', draft); draft.people.A.notes = 'Later mutation';
    await saving; assert.equal((await store.load('first')).people.A.notes, 'Snapshot');
    const newer = defaults(); newer.people.A = { notes: 'Newest' };
    await Promise.all([store.save('first', draft), store.save('first', newer)]);
    assert.equal((await store.load('first')).people.A.notes, 'Newest');
    assert.equal((await store.load('other')).people.A.notes, 'Other chat');
});

test('settings store rejects failed writes instead of reporting success', async () => {
    const blocked = () => { const error = new Error('Blocked'); error.name = 'SecurityError'; throw error; };
    const store = createSettingsStore({ localStorage: { getItem: blocked, setItem: blocked } });
    await assert.rejects(store.save('chat', defaults()), AggregateError);
    await assert.rejects(store.load('chat'), AggregateError);
});

test('user and NPC meters stay scoped to their owners and accept the supplied Hangul-spaced format', () => {
    const data = user('<arousal>5/100 (calm)</arousal><fatigue>18/100 (rested)</fatigue><pain>0/100 (no pain)</pain>')
        + chars('<char_info>Ло Трафальгар: adult ; Камилла: adult</char_info><char_arousal>Arousalㅤ=ㅤЛоㅤТрафальгар:ㅤ42%/100%ㅤ(ощутимоеㅤвозбуждение;ㅤпричина:ㅤблизость) ; Камилла: 0%/100% (calm)</char_arousal><char_fatigue>Fatigue = Ло Трафальгар: 18%/100% (освежился под душем)</char_fatigue><char_pain>Pain = Ло Трафальгар: 0%/100% (боли нет)</char_pain>')
        + '<arousal>99/100 (outside user_stats)</arousal><char_pain>Pain = Fake: 100/100</char_pain>';
    const parsed = parseMessage(data);
    assert.equal(parsed.user.arousal, '5/100 (calm)'); assert.equal(parsed.user.pain, '0/100 (no pain)');
    assert.equal(parsed.characters.length, 2);
    assert.equal(parsed.characters[0].fields.arousal, '42%/100% (ощутимое возбуждение; причина: близость)');
    assert.equal(parsed.characters[0].fields.fatigue, '18%/100% (освежился под душем)');
    assert.equal(parsed.characters[0].fields.pain, '0%/100% (боли нет)');
    assert.equal(parsed.characters[1].fields.arousal, '0%/100% (calm)');
    assert.equal(parsed.characters[1].fields.pain, undefined);
    assert.equal(parseMessage(chars('<char_arousal>Arousal = New NPC: 22/100</char_arousal>')).characters[0].name, 'New NPC');
});

test('meters carry omitted data, clear explicitly empty fields, resolve aliases, and roll back edits and deletions', () => {
    const settings = defaults(); settings.people['Ло Трафальгар'] = { aliases: ['Law'] };
    const first = assistant(user('<arousal>0/100</arousal><fatigue>14/100 (fresh)</fatigue><pain>0/100</pain>')
        + chars('<char_arousal>Arousal = Ло Трафальгар: 42%/100% (close)</char_arousal><char_fatigue>Fatigue = Ло Трафальгар: 18/100</char_fatigue>'));
    const second = assistant(user('<fatigue></fatigue>') + chars('<char_arousal>Arousal = Law: 12/100 (calmed down)</char_arousal><char_pain>Pain = Law: 0%/100% (no pain)</char_pain>'));
    let state = replay([first, second], settings);
    assert.deepEqual(state.user.fields.fatigue, { value: '', source: 2 });
    assert.deepEqual(state.user.fields.arousal, { value: '0/100', source: 1 });
    assert.equal(Object.keys(state.characters).length, 1);
    assert.deepEqual(state.characters['ло трафальгар'].fields.arousal, { value: '12/100 (calmed down)', source: 2 });
    assert.equal(state.characters['ло трафальгар'].fields.fatigue.value, '18/100');
    second.mes = chars('<char_pain>Pain = Law:</char_pain>');
    state = replay([first, second], settings);
    assert.equal(state.characters['ло трафальгар'].fields.arousal.value, '42%/100% (close)');
    assert.equal(state.characters['ло трафальгар'].fields.pain.value, '');
    assert.equal(state.user.fields.fatigue.value, '14/100 (fresh)');
    assert.equal(replay([first], settings).characters['ло трафальгар'].fields.pain, undefined);
    assert.equal(replay([{ is_user: true, mes: first.mes }, { is_system: true, mes: first.mes }, assistant(`<think>${first.mes}</think>`)]).user.fields.arousal, undefined);
});

test('meter parsing preserves real zeroes and comments without manufacturing values for unknown formats', () => {
    assert.deepEqual(meterDetails('42%/100%ㅤ(ощутимоеㅤвозбуждение)'), { level: 42, comment: 'ощутимое возбуждение' });
    assert.deepEqual(meterDetails('0 / 100 (боли нет)'), { level: 0, comment: 'боли нет' });
    assert.deepEqual(meterDetails('100% / 100%'), { level: 100, comment: '' });
    assert.deepEqual(meterDetails('12,5/100 (comment (with details))'), { level: 12.5, comment: 'comment (with details)' });
    for (const value of ['', 'Unknown', 'None', '42%', '42/10', '-1/100', '101/100', '5/100 <img src=x onerror=alert(1)>']) assert.equal(meterDetails(value), null, value);
});

test('outfit collapse and per-meter visibility are chat-local, portable settings with safe defaults', () => {
    const settings = defaults(); settings.people['@user'] = { outfitCollapsed: true }; settings.people.NPC = { outfitCollapsed: false };
    settings.visible.pain = false;
    const restored = importBackup(backup(settings));
    assert.equal(restored.people['@user'].outfitCollapsed, true); assert.equal(restored.people.NPC.outfitCollapsed, false);
    assert.equal(restored.visible.pain, false); assert.equal(restored.visible.arousal, true); assert.equal(restored.visible.fatigue, true);
    assert.equal(importBackup({ format: 'wani-character-stats', version: 1, settings: { people: { A: { outfitCollapsed: 'true' } } } }).people.A.outfitCollapsed, false);
    assert.equal(defaults().people['@user'], undefined); assert.equal(defaults().visible.pain, true);
});

test('a new NPC missing from char_info is kept when another field or char_around confirms the name', () => {
    const info = '<char_info>Law: tall ; Kid: red hair</char_info>';
    const byFields = parseMessage(chars(`${info}<char_outfit>Outfit = Law: coat ; Kid: goggles ; Bepo: orange jumpsuit</char_outfit><char_mood>Mood = Law: calm ; Kid: loud ; Bepo: sleepy</char_mood>`));
    assert.deepEqual(byFields.characters.map(item => item.name), ['Law', 'Kid', 'Bepo']);
    assert.equal(byFields.characters[1].fields.outfit, 'goggles');
    assert.equal(byFields.characters[2].fields.outfit, 'orange jumpsuit');
    const byPresence = parseMessage(chars(`${info}<char_outfit>Outfit = Law: coat ; Kid: goggles ; Bepo: orange jumpsuit</char_outfit>`) + general('<char_around>Characters around: Law, Kid and Bepo</char_around>'));
    assert.equal(byPresence.characters.find(item => item.name === 'Bepo').fields.outfit, 'orange jumpsuit');
    // An uncorroborated "; label:" stays inside the description.
    const label = parseMessage(chars(`${info}<char_outfit>Outfit = Law: coat ; Kid: goggles ; left hand: bandaged</char_outfit><char_mood>Mood = Law: calm ; Kid: loud</char_mood>`));
    assert.deepEqual(label.characters.map(item => item.name), ['Law', 'Kid']);
    assert.equal(label.characters[1].fields.outfit, 'goggles ; left hand: bandaged');
});

test('char_around accepts any-language prefixes and "and" / "и" / "&" between names', () => {
    for (const raw of ['Characters around: Law, Kid', 'Персонажи рядом: Law, Kid', 'Рядом: Law и Kid', 'Law and Kid', 'Law & Kid', 'Law, Kid (Bepo is on the ship).']) {
        const presence = parseMessage(general(`<char_around>${raw}</char_around>`)).presence;
        assert.equal(presenceFor('Law', presence), 'present', raw);
        assert.equal(presenceFor('Kid', presence), 'present', raw);
        assert.equal(presenceFor('Bepo', presence), 'absent', raw);
    }
    assert.equal(presenceFor('Salt and Pepper', 'Salt and Pepper, Law'), 'present');
    assert.equal(presenceFor('Law', null), 'unknown');
});

test('the replay cache reuses unchanged messages and re-parses edits and swipes', () => {
    const first = assistant(user('<outfit>coat</outfit>')), second = assistant(chars('<char_info>Law: tall</char_info><char_outfit>Outfit = Law: hat</char_outfit>'));
    const cache = new WeakMap(), messages = [first, second];
    const plain = replay(messages), cached = replay(messages, {}, {}, 'User', cache);
    assert.deepEqual(cached, plain);
    const entry = cache.get(second);
    assert.deepEqual(replay(messages, {}, {}, 'User', cache), plain);
    assert.equal(cache.get(second), entry);
    first.mes = user('<outfit>cloak</outfit>');
    assert.equal(replay(messages, {}, {}, 'User', cache).user.fields.outfit.value, 'cloak');
    assert.equal(cache.get(second), entry);
    second.mes = chars('<char_info>Law: tall</char_info><char_outfit>Outfit = Law: cap</char_outfit>');
    assert.equal(replay(messages, {}, {}, 'User', cache).characters.law.fields.outfit.value, 'cap');
});

test('the inventory label is removed and real contents are kept', () => {
    const inventory = text => parseMessage(user(`<inventory>${text}</inventory>`)).user.inventory;
    assert.equal(inventory("Alice's inventory: телефон на тумбочке."), 'телефон на тумбочке.');
    assert.equal(inventory('Инвентарь Алисы: телефон'), 'телефон');
    assert.equal(inventory('Inventory: phone; note: cracked'), 'phone; note: cracked');
    assert.equal(inventory('phone: cracked; keys'), 'phone: cracked; keys');
    assert.equal(inventory('None'), 'None');
});
