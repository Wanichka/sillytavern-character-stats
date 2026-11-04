# Character Stats

A theme-aware SillyTavern extension for viewing the user's and NPCs' current stats beside a large portrait. Works as a standalone window or as a block inside [Roleplay Tools](https://github.com/Wanichka/sillytavern-roleplay-tools).

## Features

- Switch between the user and NPCs, with **In scene** and **All characters** filters.
- Keep a persistent character roster for each chat, including characters who have left the scene.
- Show the user's outfit, inventory, cycle, and location.
- Show NPC outfits, mood subtitles, and current state from `char_notes`.
- Keep the scene's date, time, and weather visible when switching characters.
- Display outfit descriptions as text, without requiring fixed clothing categories.
- Upload portraits without cropping. The frame follows the image's proportions, including square avatars.
- Reuse Character Thoughts avatars, aliases, and display names, with optional per-chat overrides.
- Configure visible sections in settings; the main view has no section collapse buttons.
- Follow SillyTavern's current colors and font, including light themes.
- Use a Times New Roman name heading with a clean underline, and an olive-accented cycle section.
- Adapt the layout to the portrait: square images use a compact profile row with full-width stats below; tall images retain the portrait-and-stats columns.
- Keep date, time, and weather typography consistent, with geometric frame corners and dividers.
- Russian and English interface.
- Export and import per-chat settings and portrait backups.

## Installation

In SillyTavern, open **Extensions → Install extension** and paste:

```text
https://github.com/Wanichka/sillytavern-character-stats
```

Reload SillyTavern. Use the portrait-card launcher to open Character Stats. With Roleplay Tools installed and docking enabled, it appears as a registered block; place it on your preferred page using Roleplay Tools settings.

For manual installation, place this repository in a third-party extension folder named `sillytavern-character-stats`. Keep `manifest.json`, `index.js`, and `style.css` at the repository root.

No build step, API key, or additional model call is required. Character Thoughts and Roleplay Tools are optional.

## Data sources

The extension reads existing assistant-message info blocks. It does not create stats, infer facts from narrative prose, edit messages, or add anything to the model prompt.

| View | Source | Display |
| --- | --- | --- |
| User | `user_stats/basic_info` | Name, when the value begins with `Name's appearance:` |
| User | `user_stats/outfit` | Outfit description |
| User | `user_stats/inventory` | Inventory description |
| User | `user_stats/cycle` | Cycle or pregnancy status |
| User | `general_stats/location` | Current scene location |
| NPC | `char_stats/char_info` | Character discovery and name boundaries |
| NPC | `char_stats/char_outfit` | Outfit description |
| NPC | `char_stats/char_notes` | Current state, including location when supplied |
| NPC | `char_stats/char_mood` | Mood subtitle |
| Scene | `general_stats/date`, `time`, `weather` | Shared scene information |
| Presence | `general_stats/char_around` | Present/absent status |

NPC inventory and cycle sections are not displayed because the supplied NPC format has no corresponding fields. `char_notes` is displayed as written; it is not assumed to contain a location. The user's `user_notes` is not displayed.

### Supported structure

This example documents the expected data shape; it is not a new required prompt. Existing compatible info blocks can remain unchanged.

```xml
<user_stats>
<basic_info>User Name's appearance: established appearance</basic_info>
<outfit>Current outfit, including any accessories.</outfit>
<inventory>User Name's inventory: current possessions.</inventory>
<cycle>Day: 8/28, current phase (effects); Pregnancy: No; Risk: None</cycle>
</user_stats>

<char_stats>
<char_info>Character One: established appearance ; Character Two: established appearance</char_info>
<char_outfit>Outfit = Character One: current outfit ; Character Two: current outfit</char_outfit>
<char_notes>State = Character One: current state or location ; Character Two: current state or location</char_notes>
<char_mood>Mood = Character One: current mood ; Character Two: current mood</char_mood>
</char_stats>

<general_stats>
<location>Current location and sublocation</location>
<date>Thursday, 05.11.26</date>
<time>15:05</time>
<weather>Clear autumn afternoon ☀</weather>
<char_around>Characters around: Character One, Character Two</char_around>
</general_stats>
```

Cycles support `Day: X/Y, phase (effects); Pregnancy: X; Risk: X`. Pregnancies support `Week: X+Y/40, phase (effects); Pregnancy: Yes; Risk: None`. Unrecognized formats are shown as text rather than discarded or recalculated. The extension never advances the cycle or story clock itself.

## History and presence

- Stats are rebuilt from the currently selected assistant messages in this chat. Message edits, swipe changes, deletions, and chat switches trigger a refresh.
- A missing field retains its last known value from the remaining history. An explicitly empty field clears that value. Literal values such as `None` are preserved.
- Hover a field to see its source message number. Numbers refer to positions in the current chat, including user messages.
- Deleted or unselected swipe content is not used. User messages, system messages, and closed `think`/`thinking`/`analysis` blocks are excluded.
- Presence comes from `char_around`, not from appearance in `char_stats`. Parenthetical comments are excluded from the presence list, so remote characters mentioned there are not counted as present.
- If a presence list has never been supplied, presence is unknown. Unknown characters remain available in the **In scene** filter. Use **All characters** to see saved characters outside the scene.
- Leaving the scene does not remove a character from the roster. If all source messages for a character are removed, their roster entry and portrait remain, but removed stats do not.

## Portraits, aliases, and Character Thoughts

Open **Settings** to select a character, enter a display name, add comma-separated alternate names, or assign a portrait. The image button below the portrait also accepts a local PNG, JPEG, WebP, or GIF. Uploaded images are resized to a maximum edge of 1,200 pixels and stored as a still image; their aspect ratio and framing are preserved.

**Use Character Thoughts avatars and names** is enabled by default. The extension reads the existing `ct_profiles_v1` and `ct_cardmap_v2` browser records:

- By default, use the avatar set already bound to the current card or group in Character Thoughts.
- Alternatively, select a specific existing set for this chat.
- Inherit that set's uploaded avatars, folder-file assignments, aliases, and display names.
- Local portrait and display-name overrides take precedence. Removing a local portrait restores the inherited one.
- Chat aliases take precedence over inherited aliases. Bare observed duplicate names may be merged; an alias cannot take over a different character's configured name or avatar assignment.
- Changes made here never modify Character Thoughts settings. Shared-set changes made in Character Thoughts are picked up when this panel is visible; closing settings refreshes inherited data without interrupting form edits.

For folder-based avatars, install Character Thoughts as the sibling extension `sillytavern-character-thoughts`. Both `<folder>/<file>` and its legacy `avatars/<folder>/<file>` layout are supported. Renamed installation directories require restoring that folder name or using uploaded/local portraits. If no usable image exists, the portrait shows the character's initial.

## Storage and backups

Character Stats stores per-chat UI data in this browser's `localStorage`, under `wani_character_stats_v1::<card-or-group>::<chat-id>`. This includes the saved roster, selected character, filters, visible sections, language, aliases, display names, portrait overrides, and optional shared-set selection. Matching chat names on different cards do not share data.

Current stats are reconstructed from chat messages, so no extra copy is injected into model context. The original info blocks in messages still occupy their normal context space. The extension does not change your context or regex settings.

**Export** creates a JSON backup of this chat's settings and portraits, including inherited portraits that can be read. Export is cancelled with a visible message if a referenced portrait cannot be read. **Import** replaces settings for the currently open chat after confirmation; it does not edit messages or import another chat's story facts. Shared aliases and display names are materialized into the backup for portability. Character Thoughts profiles themselves are not overwritten.

Browser storage is device-specific and may be cleared by browser cleanup. Export before changing browsers, clearing site data, or reinstalling. Copying the extension folder or updating it does not transfer browser storage. If saving fails, a visible message advises exporting a backup.

## Parsing limits

- NPC fields use `Name: value ; Other Name: value`. Semicolons inside descriptions are preserved when the current `char_info` block identifies the character boundaries.
- Without `char_info`, a semicolon followed by a short `Label:` can be ambiguous and may be interpreted as a character boundary. Keep the existing `char_info` block for best results.
- Normal spaces, non-breaking spaces, and Hangul filler spaces (`ㅤ`) are supported. Name matching ignores case and repeated spaces.
- `char_around` should list names separated by commas, semicolons, or line breaks. Narrative descriptions of presence are not interpreted.
- This is a viewer of supplied story data. It cannot correct missing or contradictory model output.

## Development

Requires Node.js 18+ for the unit tests; the extension itself has no runtime package dependencies.

```sh
npm test
npm run check
```

The optional dependency-free browser check requires Node.js 22+ and an installed Chromium browser:

```sh
node tests/browser-smoke.mjs
```

On Windows it uses the standard Google Chrome path. Set `CHROME_PATH` for another installation. It starts a separate headless profile and local test server, uses a mocked SillyTavern context, and saves screenshots under `.test-artifacts/`. Real Roleplay Tools integration is additionally checked if its current `index.js` and `style.css` are provided as `.test-artifacts/host.js` and `.test-artifacts/host.css`. These fixtures and test output are not shipped.

## License

MIT. See [LICENSE](LICENSE).
