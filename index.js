import { eventSource, event_types } from '../../../../script.js';
import { getStringHash } from '../../../utils.js';
import { FIELDS, METER_FIELDS, clean, nameKey, resolveOwner, displayName, replay, cycleDetails, meterDetails, validateAliases } from './core.js';
import { defaults, chatKey, createSettingsStore, readJSON, sharedProfile, backup, importBackup, safeImage } from './storage.js';
import { registerRoleplayPanel, isRoleplayDocked } from './roleplay-tools-adapter.js';
import { ICON_FILES } from './icons.js';
import { createFileSettingsStore, fileUrl } from './file-storage.js';

const WORDS = {
    ru: {
        title: 'Профиль', appearance: 'Внешность', settings: 'Настройки', refresh: 'Обновить данные', close: 'Закрыть', back: 'Назад',
        user: 'Юзер', scene: 'В сцене', all: 'Все персонажи', outfit: 'Одежда', inventory: 'Инвентарь', cycle: 'Статус цикла',
        state: 'Текущее состояние', location: 'Локация', date: 'Дата', time: 'Время', weather: 'Погода',
        arousal: 'Возбуждение', fatigue: 'Усталость', pain: 'Боль', indicators: 'Показатели состояния', expandOutfit: 'Развернуть одежду', collapseOutfit: 'Свернуть одежду',
        currentScene: 'Текущая сцена', empty: 'Нет данных', noChat: 'Открой чат, чтобы посмотреть данные персонажей.',
        noStats: 'В сообщениях пока нет инфоблоков. Панель заполнится после ответа с нужными тегами.',
        present: 'В сцене', absent: 'Вне сцены', unknown: 'Присутствие неизвестно', userBadge: 'Персонаж пользователя',
        source: 'Данные из сообщения', day: 'День', week: 'Неделя', pregnancy: 'Беременность', risk: 'Риск',
        portrait: 'Заменить портрет', clearPortrait: 'Убрать свой портрет', portraitHint: 'Загрузи портрет через кнопку изображения.',
        language: 'Язык интерфейса', fields: 'Показывать разделы', sharing: 'Использовать аватарки и имена Character Thoughts',
        avatarSet: 'Набор Character Thoughts', automatic: 'Набор текущей карточки', person: 'Персонаж',
        display: 'Отображаемое имя', aliases: 'Другие имена через запятую', save: 'Сохранить',
        localHint: 'Имена и портреты, заданные здесь, действуют только в этом чате. Настройки Character Thoughts не изменяются.',
        sharedHint: 'Без своего портрета используется аватарка выбранного набора. Наборы создаются в Character Thoughts.',
        transfer: 'Резервная копия этого чата', export: 'Экспорт', import: 'Импорт', importConfirm: 'Заменить настройки и назначения портретов этого чата данными из копии? Сообщения не изменятся.',
        storageError: 'Не удалось подтвердить сохранение в файлы SillyTavern. Повтори сохранение или экспортируй резервную копию. Данные в браузере не удалены.',
        storageFull: 'Хранилище браузера заполнено, резервное сохранение тоже недоступно. Экспортируй резервную копию.',
        storageBlocked: 'Браузер запрещает сохранение данных для этого сайта. Разреши хранение или экспортируй резервную копию.', loading: 'Загрузка профиля…',
        invalidBackup: 'Не удалось прочитать резервную копию Character Stats.', invalidImage: 'Не удалось открыть изображение.',
        conflict: 'Это имя уже связано с другим персонажем:', saved: 'Сохранено', sharedUpdated: 'Данные Character Thoughts изменились. Закрой настройки, чтобы обновить панель.',
        exportPartial: 'Не все изображения доступны. Экспорт отменён: проверь аватарки или отключи общий набор.',
        inherited: 'Из Character Thoughts:', notes: 'Профиль хранится в файлах SillyTavern с привязкой к чату. Данные не отправляются модели.',
        migrate: 'Перенести остальные чаты из браузера', migrating: 'Перенос сохранённых профилей…', migrated: 'Перенесено профилей:', migrationFailed: 'Не удалось перенести (старые копии сохранены):',
        noName: 'Имя не может быть пустым', birthday: 'Дата рождения', setBirthday: 'Указать', editBirthday: 'Изменить дату рождения',
        birthdayHint: 'Например, 20 июня или 20.06.2000.', cancel: 'Отмена',
        personalNotes: 'Заметки', notesHint: 'Кто этот персонаж, важные связи, даты — всё, что нужно держать под рукой.',
        unsaved: 'Есть изменения', squareOnly: 'Для NPC нужна квадратная аватарка. Прежняя аватарка сохранена.',
    },
    en: {
        title: 'Profile', appearance: 'Appearance', settings: 'Settings', refresh: 'Refresh stats', close: 'Close', back: 'Back',
        user: 'User', scene: 'In scene', all: 'All characters', outfit: 'Outfit', inventory: 'Inventory', cycle: 'Cycle Status',
        state: 'Current state', location: 'Location', date: 'Date', time: 'Time', weather: 'Weather',
        arousal: 'Arousal', fatigue: 'Fatigue', pain: 'Pain', indicators: 'State indicators', expandOutfit: 'Expand outfit', collapseOutfit: 'Collapse outfit',
        currentScene: 'Current scene', empty: 'No data', noChat: 'Open a chat to view character stats.',
        noStats: 'No info blocks yet. The panel will fill after a reply containing the supported tags.',
        present: 'In scene', absent: 'Outside scene', unknown: 'Presence unknown', userBadge: 'User character',
        source: 'Data from message', day: 'Day', week: 'Week', pregnancy: 'Pregnancy', risk: 'Risk',
        portrait: 'Replace portrait', clearPortrait: 'Remove local portrait', portraitHint: 'Use the image button to upload a portrait.',
        language: 'Interface language', fields: 'Visible sections', sharing: 'Use Character Thoughts avatars and names',
        avatarSet: 'Character Thoughts set', automatic: 'Current card’s set', person: 'Character',
        display: 'Display name', aliases: 'Other names, separated by commas', save: 'Save',
        localHint: 'Names and portraits set here apply to this chat only. Character Thoughts settings are never changed.',
        sharedHint: 'Without a local portrait, the selected set’s avatar is used. Create sets in Character Thoughts.',
        transfer: 'This chat’s backup', export: 'Export', import: 'Import', importConfirm: 'Replace this chat’s settings and portrait assignments with this backup? Messages will not change.',
        storageError: 'Could not verify saving to SillyTavern files. Retry saving or export a backup. Browser copies have not been removed.',
        storageFull: 'Browser storage is full and fallback storage is unavailable. Export a backup.',
        storageBlocked: 'The browser blocks storage for this site. Allow storage or export a backup.', loading: 'Loading profile…',
        invalidBackup: 'Could not read this Character Stats backup.', invalidImage: 'Could not open this image.',
        conflict: 'This name already belongs to another character:', saved: 'Saved', sharedUpdated: 'Character Thoughts data changed. Close settings to refresh the panel.',
        exportPartial: 'Some images are unavailable. Export cancelled: check avatars or disable the shared set.',
        inherited: 'From Character Thoughts:', notes: 'Profiles are stored in SillyTavern files, separately for each chat. Nothing is sent to the model.', noName: 'A name is required',
        migrate: 'Move other chats out of browser storage', migrating: 'Moving saved profiles…', migrated: 'Profiles moved:', migrationFailed: 'Could not move (old copies preserved):',
        birthday: 'Birth date', setBirthday: 'Set date', editBirthday: 'Edit birth date', birthdayHint: 'For example, June 20 or 20.06.2000.', cancel: 'Cancel',
        personalNotes: 'Notes', notesHint: 'Who this character is, important connections, dates — anything to keep at hand.',
        unsaved: 'Unsaved changes', squareOnly: 'NPC portraits must be square. The previous portrait has been kept.',
    },
};
const ICONS = { appearance: 'clipboard-list', outfit: 'shirt', inventory: 'bag-shopping', cycle: 'sparkle', state: 'activity', location: 'location-dot', date: 'calendar-days', time: 'clock', weather: 'cloud-sun' };
let settings = defaults(), state, activeKey = null, profile = {}, settingsOpen = false, editingPerson = '@user';
let panel, body, title, launcher, notice, settingsButton, pickerHost, lastShared = [], pendingRefresh;
let refreshId = 0, storageWarning = '', storageLoadFailed = false, stale = false;
const parseCache = new WeakMap();
const settingsStore = createFileSettingsStore({ fetch: (...args) => window.fetch(...args), getRequestHeaders: () => context()?.getRequestHeaders?.() || { 'Content-Type': 'application/json' }, hash: getStringHash, legacy: createSettingsStore(window) });
const readableStorage = { getItem(key) { try { return window.localStorage.getItem(key); } catch { return null; } } };
const context = () => window.SillyTavern?.getContext?.() || null;
const t = key => WORDS[settings.language]?.[key] ?? WORDS.en[key] ?? key;
const element = (tag, className = '', text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
};
function icon(name) {
    const file = ICON_FILES[name] || ICON_FILES['book-open'];
    const node = element('span', 'cs-icon'); node.dataset.icon = name;
    node.style.maskImage = `url("${new URL(file, import.meta.url).href}")`;
    node.setAttribute('aria-hidden', 'true'); return node;
}
function button(label, iconName, action, className = '') {
    const node = element('button', `cs-button ${className}`);
    node.type = 'button'; node.title = label; node.setAttribute('aria-label', label);
    if (iconName) node.append(icon(iconName));
    else node.textContent = label;
    node.addEventListener('click', action);
    return node;
}
function notify(message) { notice.textContent = message; notice.hidden = !message; }
function storageMessage(error) {
    const errors = error?.errors || [error];
    if (errors.some(item => item?.name === 'QuotaExceededError')) return t('storageFull');
    if (errors.some(item => ['SecurityError', 'NotAllowedError'].includes(item?.name))) return t('storageBlocked');
    return t('storageError');
}
async function persist() {
    const key = activeKey;
    if (!key || key !== chatKey(context()) || storageLoadFailed) return false;
    const current = settings;
    const images = Object.fromEntries(Object.entries(current.people).map(([name, person]) => [name, person.image]));
    try {
        const stored = await settingsStore.save(key, current);
        if (key !== activeKey || key !== chatKey(context())) return false;
        if (settings === current) for (const [name, person] of Object.entries(stored.people)) {
            if (person.imageFile && settings.people[name]?.image === images[name]) {
                settings.people[name].image = ''; settings.people[name].imageFile = person.imageFile;
            }
        }
        if (storageWarning && notice.textContent === storageWarning) notify('');
        storageWarning = ''; return true;
    } catch (error) {
        console.error('[Character Stats] Storage failed', error);
        if (key === activeKey) { storageWarning = storageMessage(error); notify(storageWarning); }
        return false;
    }
}
function personLabel(name) {
    if (name === '@user') return settings.people['@user']?.displayName || state?.user.name || t('user');
    return displayName(name, settings, profile);
}
function allNames() {
    const names = new Map();
    for (const name of [...settings.roster, ...Object.values(state?.characters || {}).map(item => item.name)]) {
        const owner = resolveOwner(name, settings, profile);
        names.set(nameKey(owner), owner);
    }
    return [...names.values()];
}
async function refresh() {
    const request = ++refreshId; stale = false;
    const ctx = context();
    const key = chatKey(ctx);
    const changed = key !== activeKey || storageLoadFailed;
    if (changed) {
        if (body) { body.replaceChildren(element('p', 'cs-empty', t('loading'))); pickerHost.replaceChildren(); }
        let loaded, loadError;
        try { loaded = await settingsStore.load(key); } catch (error) { loaded = error.settings || defaults(); loadError = error; }
        if (request !== refreshId || key !== chatKey(context())) return;
        activeKey = key; settings = loaded;
        storageLoadFailed = !!loadError && !loadError.settings;
        settingsOpen = false; editingPerson = '@user'; notify('');
        storageWarning = loadError ? storageMessage(loadError) : '';
        if (storageWarning) notify(storageWarning);
    }
    profile = sharedProfile(readableStorage, ctx, settings);
    lastShared = sharedSignature();
    state = replay(key ? ctx?.chat || [] : [], settings, profile, ctx?.name1 || t('user'), parseCache);
    const roster = allNames();
    if (JSON.stringify(roster) !== JSON.stringify(settings.roster)) { settings.roster = roster; persist(); }
    if (settings.selected !== '@user' && !roster.some(name => name === settings.selected)) settings.selected = '@user';
    render();
}
// A closed panel does no work: it is marked stale and rebuilt when it is next shown.
const panelVisible = () => !!panel && !panel.hidden && panel.getClientRects().length > 0;
function scheduleRefresh() {
    if (!panelVisible()) { stale = true; return; }
    clearTimeout(pendingRefresh); pendingRefresh = setTimeout(refresh, 80);
}
// Character Thoughts 1.3.11+ bumps a tiny revision key on every shared change. Older
// versions fall back to comparing the stored records, which may hold megabytes of avatars.
function sharedSignature() {
    const revision = readableStorage.getItem('ct_shared_rev');
    return revision ? [revision] : [readableStorage.getItem('ct_profiles_v1') || '', readableStorage.getItem('ct_cardmap_v2') || ''];
}
function sharedChanged() {
    const current = sharedSignature();
    return current.length !== lastShared.length || current.some((value, index) => value !== lastShared[index]);
}
function checkShared() {
    if (!panelVisible()) { stale = true; return; }
    if (chatKey(context()) !== activeKey || stale) { refresh(); return; }
    if (sharedChanged()) {
        if (settingsOpen) { notify(t('sharedUpdated')); return; }
        refresh();
    }
}

function avatarSources(name) {
    const ownImage = settings.people[name]?.image;
    if (safeImage(ownImage)) return [ownImage];
    if (settings.people[name]?.imageFile) return [fileUrl(settings.people[name].imageFile)];
    if (name === '@user' || !settings.shareAvatars) return [];
    const owner = resolveOwner(name, {}, profile);
    if (safeImage(profile.uploads?.[owner])) return [profile.uploads[owner]];
    const file = profile.avatars?.[owner];
    if (!file || !/^[^/\\\x00-\x1f]+$/.test(file) || ['.', '..'].includes(file)) return [];
    const folder = profile.folder || 'default';
    if (!/^[^/\\\x00-\x1f]+$/.test(folder) || ['.', '..'].includes(folder)) return [];
    const base = new URL('../sillytavern-character-thoughts/', import.meta.url);
    return [new URL(`${encodeURIComponent(folder)}/${encodeURIComponent(file)}`, base).href, new URL(`avatars/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`, base).href];
}
function avatar(name, large = false) {
    const wrap = element('div', large ? 'cs-portrait-image' : 'cs-avatar');
    const initial = element('span', 'cs-initial', [...personLabel(name)][0] || '?');
    wrap.append(initial);
    const sources = avatarSources(name);
    if (sources.length) {
        const image = element('img');
        image.alt = personLabel(name); image.draggable = false;
        let index = 0;
        image.addEventListener('load', () => {
            initial.hidden = true;
            if (large) {
                wrap.classList.add('cs-has-image');
            }
        });
        image.addEventListener('error', () => {
            if (++index < sources.length) image.src = sources[index];
            else {
                image.remove(); initial.hidden = false; wrap.classList.remove('cs-has-image');
            }
        });
        image.src = sources[0]; wrap.append(image);
    } else if (large) wrap.append(element('p', 'cs-portrait-hint', t('portraitHint')));
    return wrap;
}
function render() {
    title.textContent = t('title'); launcher.title = t('title'); launcher.setAttribute('aria-label', t('title'));
    settingsButton.title = t(settingsOpen ? 'back' : 'settings');
    settingsButton.setAttribute('aria-label', settingsButton.title);
    body.replaceChildren();
    pickerHost.replaceChildren();
    if (!activeKey) { body.append(element('p', 'cs-empty', t('noChat'))); return; }
    renderPicker();
    if (settingsOpen) { renderSettings(); return; }
    renderCharacter();
}
function renderPicker() {
    const trigger = button(personLabel(settings.selected), null, () => {
        const open = menu.hidden;
        menu.hidden = !open; trigger.setAttribute('aria-expanded', String(open));
        if (open) {
            menu.showPopover?.();
            const box = trigger.getBoundingClientRect();
            const width = Math.min(280, innerWidth - 24);
            menu.style.width = `${width}px`;
            menu.style.left = `${Math.max(12, Math.min(box.right - width, innerWidth - width - 12))}px`;
            menu.style.top = `${Math.max(12, Math.min(box.bottom + 7, innerHeight - menu.offsetHeight - 12))}px`;
            menu.querySelector('.cs-choice[aria-pressed="true"]')?.focus();
        } else menu.hidePopover?.();
    }, 'cs-picker-trigger');
    trigger.replaceChildren(avatar(settings.selected), element('span', '', personLabel(settings.selected)), icon('chevron-down'));
    trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-expanded', 'false');
    const menu = element('div', 'cs-picker-menu'); menu.hidden = true;
    if ('showPopover' in menu) menu.setAttribute('popover', 'manual');
    menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-label', t('person'));
    const tabs = element('div', 'cs-filter');
    for (const filter of ['scene', 'all']) {
        const tab = button(t(filter), null, () => {
            settings.filter = filter;
            const selected = state.characters[nameKey(settings.selected)];
            if (filter === 'scene' && (!selected || selected.presence === 'absent')) settings.selected = '@user';
            persist(); render(); pickerHost.querySelector('.cs-picker-trigger')?.click();
        }, settings.filter === filter ? 'cs-active' : '');
        tab.setAttribute('aria-pressed', String(settings.filter === filter)); tabs.append(tab);
    }
    const choices = element('div', 'cs-choices');
    const names = ['@user', ...allNames().filter(name => settings.filter === 'all' || (state.characters[nameKey(name)] && state.characters[nameKey(name)].presence !== 'absent'))];
    for (const name of names) {
        const choice = button(personLabel(name), null, () => { settings.selected = name; persist(); render(); }, `cs-choice ${settings.selected === name ? 'cs-active' : ''}`);
        choice.replaceChildren(avatar(name), element('span', '', personLabel(name)));
        choice.setAttribute('aria-pressed', String(settings.selected === name)); choices.append(choice);
    }
    menu.append(tabs, choices); pickerHost.append(trigger, menu);
}
function renderCharacter() {
    const selected = settings.selected;
    const isUser = selected === '@user';
    const character = isUser ? state.user : state.characters[nameKey(selected)];
    const fields = character?.fields || {};
    const layout = element('div', `cs-layout ${isUser ? 'cs-user' : 'cs-npc'}`);
    const upper = element('div', 'cs-upper');
    const portrait = element('div', 'cs-portrait');
    portrait.append(avatar(selected, true));
    for (const corner of ['tl', 'tr', 'bl', 'br']) {
        const ornament = element('span', `cs-frame-corner cs-corner-${corner}`);
        ornament.setAttribute('aria-hidden', 'true'); portrait.append(ornament);
    }
    portrait.append(button(t('portrait'), 'image', () => uploadPortrait(selected), 'cs-portrait-edit'));
    const details = element('div', 'cs-details');
    const identity = element('div', 'cs-identity');
    const heading = element('div', 'cs-person-heading');
    const divider = element('div', 'cs-name-divider'); divider.setAttribute('aria-hidden', 'true'); divider.append(element('i'));
    heading.append(element('h2', '', personLabel(selected)), divider); identity.append(heading);
    if (settings.visible.birthday) identity.append(birthdayControl(selected));
    if (!isUser) {
        const status = element('div', 'cs-status-line');
        status.append(element('span', 'cs-presence', t(character?.presence || 'unknown')));
        if (fields.mood?.value) {
            const mood = element('span', 'cs-mood', fields.mood.value); sourceTitle(mood, fields.mood); status.append(mood);
        }
        identity.append(status);
    }
    details.append(identity);
    if (settings.visible.appearance && fields.info) details.append(card('appearance', fields.info));
    if (isUser) for (const field of ['outfit', 'inventory']) if (settings.visible[field]) details.append(card(field, fields[field]));
    upper.append(portrait, details); layout.append(upper);
    if (!isUser) for (const field of ['outfit', 'state']) if (settings.visible[field] && fields[field]) layout.append(card(field, fields[field]));
    if (isUser && settings.visible.cycle) layout.append(card('cycle', fields.cycle));
    const meters = meterCard(fields);
    if (meters) layout.append(meters);
    if (isUser && settings.visible.location && state.scene.location) layout.append(card('location', state.scene.location));
    if (settings.visible.notes) layout.append(notesCard(selected));
    const row = element('div', 'cs-scene-row');
    for (const field of ['date', 'time', 'weather']) if (settings.visible[field] && state.scene[field]) row.append(card(field, state.scene[field], true));
    if (row.childElementCount) layout.append(row);
    if (!Object.keys(fields).length && !Object.keys(state.scene).length) details.append(element('p', 'cs-empty', t('noStats')));
    body.append(layout);
}
function birthdayControl(owner) {
    const row = element('div', 'cs-birthday-row');
    const label = element('span', '', t('birthday'));
    const value = settings.people[owner]?.birthday || '';
    const edit = button(t('editBirthday'), null, () => { edit.hidden = true; form.hidden = false; input.focus(); }, 'cs-birthday-edit');
    edit.textContent = value || t('setBirthday');
    const form = element('form', 'cs-birthday-form'); form.hidden = true;
    const input = element('input', 'cs-birthday-input'); input.type = 'text'; input.maxLength = 60;
    input.value = settings.people[owner]?.birthday || ''; input.placeholder = value || t('birthday'); input.setAttribute('aria-label', t('birthday')); input.title = t('birthdayHint');
    const save = element('button', 'cs-button', t('save')); save.type = 'submit';
    const cancel = button(t('cancel'), null, () => { form.hidden = true; edit.hidden = false; });
    form.append(input, save, cancel); row.append(label, edit, form);
    form.addEventListener('submit', async event => {
        event.preventDefault(); settings.people[owner] = { ...settings.people[owner], birthday: clean(input.value).slice(0, 60) };
        if (await persist()) render();
    });
    return row;
}
function notesCard(owner) {
    const node = element('section', 'cs-card cs-notes');
    const heading = element('h3'); heading.append(element('span', '', t('personalNotes')));
    const status = element('span', 'cs-notes-status'); status.setAttribute('aria-live', 'polite');
    const input = element('textarea', 'cs-notes-input'); input.rows = 3; input.maxLength = 2000;
    input.placeholder = t('notesHint'); input.setAttribute('aria-label', t('personalNotes')); input.value = settings.people[owner]?.notes || '';
    const save = button(t('save'), null, async () => {
        settings.people[owner] = { ...settings.people[owner], notes: input.value.slice(0, 2000) };
        if (await persist()) status.textContent = t('saved');
    }, 'cs-notes-save');
    input.addEventListener('input', () => {
        settings.people[owner] = { ...settings.people[owner], notes: input.value.slice(0, 2000) };
        status.textContent = t('unsaved');
    });
    // The field grows with its text. Browsers without field-sizing get a measured height.
    if (!globalThis.CSS?.supports?.('field-sizing', 'content')) {
        const fit = () => { input.style.height = 'auto'; input.style.height = `${input.scrollHeight}px`; };
        input.addEventListener('input', fit); requestAnimationFrame(fit);
    }
    heading.append(status, save); node.append(heading, input); return node;
}

function sourceTitle(node, field) { if (field) node.title = `${t('source')} #${field.source}`; }
function meterCard(fields) {
    const node = element('section', 'cs-card cs-meters'); node.setAttribute('aria-label', t('indicators'));
    for (const field of METER_FIELDS) {
        const data = fields[field];
        if (!settings.visible[field] || !data?.value) continue;
        const row = element('div', `cs-meter cs-meter-${field}`); sourceTitle(row, data);
        const heading = element('div', 'cs-meter-heading'); heading.append(element('strong', 'cs-meter-label', t(field)));
        const details = meterDetails(data.value);
        if (details) {
            heading.append(element('span', 'cs-meter-value', `${details.level} / 100`));
            const track = element('div', 'cs-meter-track');
            track.setAttribute('role', 'progressbar'); track.setAttribute('aria-label', t(field));
            track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '100'); track.setAttribute('aria-valuenow', String(details.level));
            const fill = element('div'); fill.style.width = `${details.level}%`; track.append(fill);
            row.append(heading, track);
            if (details.comment) row.append(element('p', 'cs-meter-comment', details.comment));
        } else row.append(heading, element('p', 'cs-meter-comment', data.value));
        node.append(row);
    }
    return node.childElementCount ? node : null;
}
function card(field, data, compact = false) {
    const node = element(field === 'outfit' ? 'details' : 'section', `cs-card cs-${field} ${compact ? 'cs-compact' : ''}`);
    const label = element('h3'); label.append(icon(ICONS[field]));
    label.append(document.createTextNode(t(field)));
    if (field === 'outfit') {
        const owner = settings.selected, capturedKey = activeKey;
        node.open = !settings.people[owner]?.outfitCollapsed;
        let previousOpen = node.open;
        const summary = element('summary', 'cs-outfit-summary');
        const arrow = icon('chevron-down'); arrow.classList.add('cs-fold-arrow'); summary.append(label, arrow);
        summary.title = t(node.open ? 'collapseOutfit' : 'expandOutfit'); node.append(summary);
        node.addEventListener('toggle', () => {
            if (node.open === previousOpen) return;
            previousOpen = node.open; summary.title = t(node.open ? 'collapseOutfit' : 'expandOutfit');
            if (!node.isConnected || capturedKey !== activeKey || capturedKey !== chatKey(context())) return;
            settings.people[owner] = { ...settings.people[owner], outfitCollapsed: !node.open }; persist();
        });
    } else node.append(label);
    sourceTitle(node, data);
    if (field === 'cycle' && data?.value) {
        const cycle = cycleDetails(data.value);
        if (cycle) {
            const top = element('div', 'cs-cycle-top');
            top.append(element('strong', '', `${t(cycle.week ? 'week' : 'day')} ${cycle.count}`), element('span', 'cs-cycle-phase', cycle.phase));
            const track = element('div', 'cs-cycle-track');
            track.setAttribute('role', 'progressbar'); track.setAttribute('aria-label', t('cycle'));
            track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '100'); track.setAttribute('aria-valuenow', String(Math.round(cycle.progress)));
            const fill = element('div'); fill.style.width = `${cycle.progress}%`; track.append(fill);
            const bottom = element('div', 'cs-cycle-bottom');
            for (const [label, value] of [['pregnancy', cycle.pregnancy], ['risk', cycle.risk]]) {
                const status = element('span');
                const translated = settings.language === 'ru' ? ({No:'Нет',Yes:'Да',Pending:'Ожидается',None:'Нет'}[value.trim()] || value) : value;
                status.append(document.createTextNode(`${t(label)}: `), element('strong', 'cs-cycle-status', translated));
                bottom.append(status);
            }
            node.append(top, track, bottom); return node;
        }
    }
    // Inventory/outfits remain verbatim: comma splitting would corrupt captions.
    const text = element('div', `cs-value ${!data?.value ? 'cs-muted' : ''}`, data ? data.value || t('empty') : t('empty'));
    node.append(text); return node;
}

function settingField(labelText, control) {
    const label = element('label', 'cs-setting-field'); label.append(element('span', '', labelText), control); return label;
}
function select(options, current, onChange) {
    const node = element('select');
    for (const [value, label] of options) { const option = element('option', '', label); option.value = value; node.append(option); }
    node.value = current;
    node.addEventListener('change', () => onChange(node.value)); return node;
}
function checkbox(label, checked, onChange) {
    const wrap = element('label', 'cs-checkbox'); const input = element('input'); input.type = 'checkbox'; input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked)); wrap.append(input, document.createTextNode(label)); return wrap;
}
function renderSettings() {
    const wrap = element('div', 'cs-settings');
    wrap.append(element('p', 'cs-help', t('notes')));
    wrap.append(settingField(t('language'), select([['ru', 'Русский'], ['en', 'English']], settings.language, value => { settings.language = value; persist(); render(); })));
    const visible = element('fieldset'); visible.append(element('legend', '', t('fields')));
    for (const field of FIELDS) visible.append(checkbox(t(field === 'notes' ? 'personalNotes' : field), settings.visible[field], value => { settings.visible[field] = value; persist(); }));
    wrap.append(visible);
    wrap.append(checkbox(t('sharing'), settings.shareAvatars, value => { settings.shareAvatars = value; persist(); refresh(); }));
    const profiles = readJSON(readableStorage, 'ct_profiles_v1');
    if (settings.shareAvatars) {
        wrap.append(settingField(t('avatarSet'), select([['', t('automatic')], ...Object.entries(profiles).map(([id, value]) => [id, value.name || id])], settings.profileId, value => { settings.profileId = value; persist(); refresh(); })));
        wrap.append(element('p', 'cs-help', t('sharedHint')));
    }
    const people = element('fieldset'); people.append(element('legend', '', t('person')));
    const names = ['@user', ...allNames()];
    if (!names.includes(editingPerson)) editingPerson = '@user';
    people.append(settingField(t('person'), select(names.map(name => [name, personLabel(name)]), editingPerson, value => { editingPerson = value; render(); })));
    const owner = editingPerson;
    const person = settings.people[owner] || {};
    const display = element('input'); display.type = 'text'; display.value = person.displayName || ''; display.placeholder = personLabel(owner);
    people.append(settingField(t('display'), display));
    let aliases;
    if (owner !== '@user') {
        aliases = element('input'); aliases.type = 'text'; aliases.value = (person.aliases || []).join(', ');
        people.append(settingField(t('aliases'), aliases));
        const inherited = profile.aliases?.[resolveOwner(owner, {}, profile)] || [];
        if (inherited.length) people.append(element('p', 'cs-help', `${t('inherited')} ${inherited.join(', ')}`));
    }
    const birthday = element('input'); birthday.type = 'text'; birthday.maxLength = 60; birthday.value = person.birthday || ''; birthday.placeholder = t('birthdayHint');
    people.append(settingField(t('birthday'), birthday));
    const save = button(t('save'), null, async () => {
        const items = aliases ? [...new Set(aliases.value.split(',').map(clean).filter(value => value && nameKey(value) !== nameKey(owner)))] : [];
        const collision = owner === '@user' ? null : validateAliases(owner, items, settings, profile, allNames());
        if (collision) { notify(`${t('conflict')} ${collision}`); return; }
        settings.people[owner] = { ...settings.people[owner], displayName: clean(display.value), aliases: items, birthday: clean(birthday.value).slice(0, 60) };
        if (await persist()) { notify(t('saved')); refresh(); }
    }, 'cs-primary');
    const actions = element('div', 'cs-setting-actions'); actions.append(save, button(t('portrait'), null, () => uploadPortrait(owner)));
    if (person.image || person.imageFile) actions.append(button(t('clearPortrait'), null, async () => { settings.people[owner].image = ''; settings.people[owner].imageFile = ''; if (await persist()) render(); }));
    people.append(actions, element('p', 'cs-help', t('localHint'))); wrap.append(people);
    const transfer = element('fieldset'); transfer.append(element('legend', '', t('transfer')));
    const transfers = element('div', 'cs-setting-actions'); transfers.append(button(t('export'), null, exportSettings), button(t('import'), null, importSettings)); transfer.append(transfers); wrap.append(transfer);
    const migrate = button(t('migrate'), null, async () => {
        const key = activeKey;
        migrate.disabled = true;
        try {
            if (!await persist()) return;
            notify(t('migrating'));
            const result = await settingsStore.migrateAll(key);
            if (key === activeKey) notify(`${t('migrated')} ${result.migrated}. ${result.failed ? `${t('migrationFailed')} ${result.failed}.` : ''}`);
        } catch (error) { console.error('[Character Stats] Migration failed', error); if (key === activeKey) notify(storageMessage(error)); }
        finally { migrate.disabled = false; }
    });
    transfer.append(migrate);
    body.append(wrap);
}

function pickFile(accept) {
    return new Promise(resolve => {
        const input = element('input'); input.type = 'file'; input.accept = accept; input.hidden = true;
        input.addEventListener('change', () => { resolve(input.files?.[0] || null); input.remove(); }, { once: true });
        input.addEventListener('cancel', () => { resolve(null); input.remove(); }, { once: true });
        document.body.append(input); input.click();
    });
}
async function fileDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob);
    });
}
async function uploadPortrait(owner) {
    const capturedKey = activeKey;
    const file = await pickFile('image/png,image/jpeg,image/webp,image/gif');
    if (!file || capturedKey !== chatKey(context())) return;
    try {
        if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('Unsupported image');
        const image = new Image(); const url = URL.createObjectURL(file);
        try {
            await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
            if (owner !== '@user' && image.naturalWidth !== image.naturalHeight) { notify(t('squareOnly')); return; }
            const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
            const canvas = element('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
            const data = canvas.toDataURL('image/webp', 0.88);
            if (capturedKey !== chatKey(context())) return;
            settings.people[owner] = { ...settings.people[owner], image: data, imageFile: '' };
            if (await persist()) { notify(''); render(); }
        } finally { URL.revokeObjectURL(url); }
    } catch (error) { console.error('[Character Stats] Portrait failed', error); notify(t('invalidImage')); }
}
async function exportSettings() {
    const capturedKey = activeKey;
    const data = backup(settings);
    try {
        // Materialize inherited portraits into the backup, not into live settings.
        for (const name of new Set(['@user', ...allNames(), ...Object.keys(settings.people)])) {
            const sources = avatarSources(name);
            const owner = resolveOwner(name, {}, profile);
            const local = data.settings.people[name] || {};
            const entry = { ...local, displayName: local.displayName || (name !== '@user' ? profile.displayNames?.[owner] || '' : ''), aliases: [...new Set([...(local.aliases || []), ...(name !== '@user' ? profile.aliases?.[owner] || [] : [])])] };
            if (sources.length) {
                let image;
                for (const source of sources) {
                    try {
                        if (safeImage(source)) { image = source; break; }
                        const response = await fetch(source);
                        if (!response.ok) continue;
                        image = await fileDataURL(await response.blob());
                        if (safeImage(image)) break;
                        image = null;
                    } catch { /* Try the legacy avatar folder. */ }
                }
                if (!image) throw new Error('Avatar missing');
                entry.image = image;
            }
            delete entry.imageFile;
            data.settings.people[name] = entry;
        }
        if (capturedKey !== chatKey(context())) return;
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        const link = element('a'); link.href = url; link.download = 'character-stats-backup.json'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { console.error('[Character Stats] Export failed', error); notify(t('exportPartial')); }
}
async function importSettings() {
    const capturedKey = activeKey;
    const file = await pickFile('.json,application/json');
    if (!file || capturedKey !== chatKey(context())) return;
    try {
        const imported = importBackup(JSON.parse(await file.text()));
        if (capturedKey !== chatKey(context())) return;
        if (!window.confirm(t('importConfirm'))) return;
        settings = imported; if (await persist()) { notify(''); refresh(); }
    } catch (error) { console.error('[Character Stats] Import failed', error); notify(t('invalidBackup')); }
}

function clampPanel() {
    if (isRoleplayDocked(panel) || panel.hidden || innerWidth <= 600) return;
    const viewport = window.visualViewport;
    const x = viewport?.offsetLeft || 0, y = viewport?.offsetTop || 0;
    const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
    panel.style.maxWidth = `${Math.max(240, width - 16)}px`; panel.style.maxHeight = `${Math.max(160, height - 32)}px`;
    const rect = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(x + 8, Math.min(rect.left, x + width - rect.width - 8))}px`;
    panel.style.top = `${Math.max(y + 8, Math.min(rect.top, y + height - rect.height - 8))}px`;
    panel.style.right = 'auto'; panel.style.bottom = 'auto';
}
function setOpen(open) {
    panel.hidden = !open; panel.style.display = open ? 'flex' : 'none';
    if (open) { refresh(); clampPanel(); }
}
function createUI() {
    if (document.getElementById('cs-panel')) return;
    panel = element('section'); panel.id = 'cs-panel'; panel.style.display = 'none'; panel.hidden = true;
    panel.setAttribute('aria-label', 'Character Stats');
    const header = element('header', 'cs-header');
    title = element('strong', 'cs-title', t('title'));
    const titleWrap = element('div', 'cs-title-wrap'); titleWrap.append(icon('book-open'), title);
    const controls = element('div', 'cs-controls');
    const refreshButton = button(t('refresh'), 'rotate-right', () => { notify(''); refresh(); });
    settingsButton = button(t('settings'), 'sliders', () => { settingsOpen = !settingsOpen; notify(''); refresh(); });
    const close = button(t('close'), 'xmark', () => setOpen(false), 'cs-close');
    pickerHost = element('div', 'cs-picker');
    controls.append(refreshButton, settingsButton, close); header.append(titleWrap, pickerHost, controls);
    notice = element('div', 'cs-notice'); notice.hidden = true; notice.setAttribute('role', 'status');
    body = element('div', 'cs-body'); panel.append(header, notice, body);
    launcher = button(t('title'), 'id-card', () => setOpen(panel.style.display === 'none')); launcher.id = 'cs-launcher';
    document.body.append(panel, launcher);
    const closePicker = () => {
        const menu = pickerHost.querySelector('.cs-picker-menu');
        if (menu) { menu.hidden = true; menu.hidePopover?.(); }
        pickerHost.querySelector('.cs-picker-trigger')?.setAttribute('aria-expanded', 'false');
    };
    document.addEventListener('pointerdown', event => { if (!pickerHost.contains(event.target)) closePicker(); });
    pickerHost.addEventListener('keydown', event => {
        if (event.key === 'Escape') { closePicker(); pickerHost.querySelector('.cs-picker-trigger')?.focus(); }
    });
    let drag;
    header.addEventListener('pointerdown', event => {
        if (isRoleplayDocked(panel) || innerWidth <= 600 || event.target.closest('button') || event.button !== 0) return;
        clampPanel(); const rect = panel.getBoundingClientRect(); drag = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        header.setPointerCapture(event.pointerId);
    });
    header.addEventListener('pointermove', event => {
        if (!drag) return;
        panel.style.left = `${event.clientX - drag.x}px`; panel.style.top = `${event.clientY - drag.y}px`; clampPanel();
    });
    header.addEventListener('pointerup', () => { drag = null; });
    header.addEventListener('pointercancel', () => { drag = null; });
    const resize = new ResizeObserver(() => { if (panel.style.display !== 'none' && !isRoleplayDocked(panel)) clampPanel(); }); resize.observe(panel);
    window.addEventListener('resize', clampPanel); window.visualViewport?.addEventListener('resize', clampPanel);
    registerRoleplayPanel({
        id: 'character-stats', title: 'Character Stats', minHeight: 280,
        element: panel, launcher, controls,
        onShow: () => { panel.hidden = false; refresh(); },
        onRelease: () => { panel.hidden = panel.style.display === 'none'; clampPanel(); },
    });
    for (const name of ['CHAT_CHANGED', 'CHAT_CREATED', 'MESSAGE_RECEIVED', 'MESSAGE_EDITED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'MESSAGE_DELETED', 'CHARACTER_MESSAGE_RENDERED', 'USER_MESSAGE_RENDERED', 'GENERATION_ENDED', 'GROUP_UPDATED']) {
        if (event_types[name]) eventSource.on(event_types[name], scheduleRefresh);
    }
    window.addEventListener('storage', async event => {
        if (event.key === activeKey) {
            const key = activeKey;
            try { const loaded = await settingsStore.load(key); if (key === activeKey) { settings = loaded; scheduleRefresh(); } }
            catch (error) { if (key === activeKey) notify(storageMessage(error)); }
        } else if (event.key?.startsWith('ct_')) scheduleRefresh();
    });
    // localStorage events do not fire in the same page when Thoughts changes a set.
    // The interval remains as a fallback for older Character Thoughts versions.
    window.addEventListener('wani-character-thoughts:changed', checkShared);
    setInterval(checkShared, 2000);
    refresh();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', createUI, { once: true });
else createUI();
