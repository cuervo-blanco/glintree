# AGENTS.md

Guidance for AI coding assistants working in this repository.

## Product

A YouTube caption tool for language learning and faster reading. The player has
an activation switch, editable captions, Focus mode and a timed transcript panel.
The toolbar icon opens settings directly. There is no popup, profile gallery,
Read Mode, AI assistant, library, notes, export system or provider API key.

YouTube supplies the transcript and timings up front. The current word is a
lookup against `video.currentTime`. There is no transcription queue,
backpressure or pacing engine. The WPM badge is informational only.

## Commands

```bash
pnpm run build         # dist/ is the only installable extension directory
pnpm run watch
pnpm run typecheck
pnpm test
pnpm run check         # typecheck and unit tests
pnpm run shoot         # visual reading geometry and settings checks
pnpm run reel
pnpm run package
pnpm run format
```

`pnpm run check-drift` optionally compares the shared reading files with a
companion desktop checkout. It requires that checkout and is not a release CI
prerequisite for this fork.

## Boundaries and lifecycle

- Do not edit or format `src/reader-core/` here. Keep changed browser behaviour
  in `src/content/`; the core still supplies the shared geometry and fonts.
- The manifest lives in `src/` and is copied to `dist/`. Keep the root manifest-free.
- Content scripts are bundled as IIFEs: initialize through an async function,
  never top-level await.
- Page globals, the player API and signed caption requests belong to
  `src/page/inject.ts`. Communicate through the checked postMessage channel.
- A successful HTTP response can be empty. Caption acquisition succeeds only
  when usable words are parsed. Preserve signed URL parameters.
- Filter caption requests by the video id in their URL, not the arrival time.
  Main-video captions can arrive during an ad.
- YouTube navigation is a single-page transition. Tear down the old session,
  transcript, controls and listeners on every video change; reject stale async
  starts with the generation guard.
- Ads use the same video element and URL. Watch `ad-showing`/`ad-interrupting`
  independently of navigation, and keep the reader off ads.
- Mount inside `#movie_player`. Never move, detach, hide or zero-size the video
  to build Focus mode. An opaque layer covers the picture while presented video
  frames continue driving the reader.
- Fullscreen Focus centres the reader. Direct geometry gestures are disabled
  there; clicking the caption still opens settings. Transcript word buttons
  seek to original word starts and preserve pause state.
- The transcript uses the full source words, including words filtered from the
  reader. Romanization changes display only, never source timings.
- The on-player switch must stay available while disabled and without captions.
  YouTube may replace the control bar without changing videos.

## Preferences and rendering

- Themes are text-colour starting points over one plain black caption background.
  Opacity is configurable. No rounded cards, shadows or decorative blur.
- Saved presets contain appearance/reading settings. They do not change enabled,
  language, romanization or focus preferences. Leave legacy stored records alone.
- Read palettes from computed `--text`, `--faded` and `--accent`; CSS remains the
  source of colour values. Editing a colour starts from the palette on screen.
- Debounce storage writes during drags and flush before navigation or applying a
  preset. Keep the live preview immediate.
- `apply()` invalidates the overlay’s render guard. A paused video presents no
  frames, so settings changes and seeks also require an explicit redraw.
- Reading modes must stay exhaustive in their type, labels and render switch.
  Bionic, Plain and Highlighter share the line renderer.
- Recognition points and Bionic bolding must preserve complete grapheme clusters.
  Canvas measurements include font weight/style; shaped fallback glyphs use DOM
  geometry where canvas and rendered widths disagree.
- Highlighter padding belongs to every word, not only the current one. Verify
  that marking a word does not move its neighbours.
- No higher font weight or italic face is bundled unless the fonts actually
  provide it. Do not silently change shared font files.

## Design and code

Plain DOM, strict TypeScript, no `any`. Prefer small shared helpers to duplicated
renderers. Document why a choice matters, not what the following line does.

Every extension class is prefixed `trf-`. Scope caption rules beneath
`.trf-reader`; player switches and fullscreen/transcript rules are explicitly
scoped to their player/widget classes. The root remains pointer-transparent;
only captions being edited, grips, panel controls and the player switch accept
input. Keep YouTube’s playback controls usable.

The focal point stays fixed while reading. Use no competing animation beyond a
sub-80ms opacity swap. Default text inks avoid pure white; the background is
black at the user’s chosen opacity.

Commits use conventional prefixes (`feat:`, `fix:`, `docs:`, `refactor:`,
`chore:`) and explain the reason for the change.
