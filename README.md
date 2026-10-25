# TextReadsFast for YouTube

A caption reader for language learning and faster reading. Follow a video one
word at a time, read a caption line, or study its full transcript without
leaving the player.

## Use it

1. Turn **TRF** on or off in YouTube’s player controls.
2. Click the captions to open their settings. Click them again, click outside,
   or press Escape to close the panel.
3. Drag the captions to move them. Drag any corner to resize them, like an
   object in an image editor.
4. Click the extension’s toolbar icon to open the full settings page directly.

The caption background is a plain black rectangle. Adjust its opacity, choose
text colours and a font, and keep the reading mode that works for you. Colour
presets provide starting points; save your own named preset to reuse a setup.
There is no separate profile system.

Keyboard users can focus the captions, press Enter or Space for settings, and
use the arrow keys to move them. Shift moves in larger steps. Corner grips also
support the arrow keys.

## Reading modes

| Mode          | What appears                                                |
| ------------- | ----------------------------------------------------------- |
| RSVP          | One word with its recognition point held at a fixed column. |
| RSVP + Bionic | A pinned word with bolded surrounding words.                |
| Bionic        | A caption line with bold word beginnings.                   |
| Plain         | A caption line with minimal emphasis.                       |
| Highlighter   | A caption line with a block on the current word.            |
| Focus line    | One word centred without a coloured pivot.                  |

Bionic and Plain can hold a whole line still instead of sliding word by word.
The small WPM indicator estimates the nearby caption pace and accounts for
playback speed. It never controls the video or decides when words advance.

## Focus and transcript

**Focus** covers the picture while audio and caption timing continue.
**Fullscreen focus** centres the text against a black screen. Move the pointer
or use the keyboard to reveal the controls; Escape leaves fullscreen.

**Transcript** opens a side panel containing the whole caption track. Click a
word or timestamp to seek to it, including while paused. The current word is
marked as the video plays. Scroll to browse independently, then use **Follow**
to return to the current word. The panel can be opened or closed independently
of fullscreen.

The old Read Mode, assistant, notes, library and export system have been removed.
Focus and the transcript stay inside the existing player.

## Languages and romanization

Choose a preferred caption language in settings. Hindi and Bengali can be read
in their native scripts or in Latin letters with diacritics. The transcript and
reader follow the same script choice. Chinese captions without spaces are
segmented into words.

Romanization happens locally and follows spelling, including written inherent
vowels: भारत becomes _bhārata_, and বাংলা becomes _bāṁlā_. It does not infer
pronunciation. The original words and timings remain intact.

The source track supplies the timing. Automatically translated captions cannot
provide word-for-word alignment with speech in a different language, so the
reader uses the selected original track rather than silently adopting a
translation being shown by YouTube.

## Install from source

```bash
pnpm install
pnpm run build
```

Open your browser’s extensions page, enable Developer mode, choose **Load
unpacked**, and select **dist/**. The source directory is not an installable
extension. Refresh an already-open YouTube tab after reloading the extension.

Chrome is the tested browser. Other Chromium browsers can load the same package,
but should be tested before being declared supported.

## Development

```bash
pnpm run watch         # rebuild on change
pnpm run typecheck
pnpm test
pnpm run check         # typecheck and unit tests
pnpm run shoot         # screenshot reading modes and settings
pnpm run reel          # generate reading-mode GIFs
pnpm run package       # build a store-ready ZIP
pnpm run format
```

Visual checks use Python’s Playwright package; GIF generation also needs Pillow.

`src/reader-core/` remains a copy of the desktop reader’s font and focal-point
logic. It is excluded from formatting. The optional `pnpm run check-drift`
compares it with a companion desktop checkout; supply that checkout with
`node scripts/check-drift.mjs --desktop /path/to/textreadsfast`.

```text
src/
  content/       caption parsing, reader, editing controls, focus and transcript
  page/          signed caption capture in YouTube’s page context
  options/       settings, preview and saved presets
  background/    opens settings when the toolbar icon is clicked
  reader-core/   shared reading geometry and fonts
  presets.ts     user-created presets
  settings.ts    preferences and defaults
```

## Timing and limitations

Every displayed word is looked up against `video.currentTime`. Pausing,
seeking and playback speed therefore use the video clock, with no transcription
or artificial reading queue.

YouTube’s caption interfaces are not a public API. Direct caption requests can
return HTTP 200 with an empty body when a proof-of-origin token is missing. The
extension also captures the player’s signed caption requests and judges success
by whether actual words were returned. Captions may need to be enabled in
YouTube before that request is made.

Auto-captions can supply individual word offsets. A track with only phrase
boundaries needs interpolation within each phrase, and cannot be perfectly
aligned word by word. Videos without usable captions have no reader.

## Privacy

Captions and video requests stay with YouTube. Reading preferences use
`chrome.storage.sync`; named presets use extension-local storage. There are no
accounts, analytics, model providers or API keys in this version. See
[PRIVACY.md](PRIVACY.md) for the storage and permissions details.

## Credits and license

This project is a fork of
[Ramonvdo/textreadsfast-youtube](https://github.com/Ramonvdo/textreadsfast-youtube).
The reading core originated in
[TextReadsFast](https://github.com/Ramonvdo/textreadsfast). Language Reactor is an
inspiration for the simpler player workflow; this project is independent.

The original copyright notices remain in the [MIT license](LICENSE). See also
[DISCLAIMER.md](DISCLAIMER.md).
