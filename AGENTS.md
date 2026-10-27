# AGENTS.md

Guidance for AI coding assistants working in this repository.

## Product

Glintree is an independent learning tool for languages, words and concepts,
using articles, YouTube and entertainment as source material. See
`docs/PRODUCT.md` for the direction and the boundary between shipped and planned
features. It retains its TextReadsFast reading foundation and original MIT notices.
The toolbar opens settings directly; collection and text reading have their own
tabs. The player retains activation, appearance, Focus, Reading and transcript.
There is no popup, profile gallery, old study dashboard, AI assistant or provider key.

The new collection in `src/learning/` stores explicit word/phrase/concept saves,
meanings, examples, lists, source excerpts and review state. It does not consume
legacy library, assistant, notes or session records. All collection writes pass
through the background's serialized checked message handler. Keep imports atomic
and preserve personal meanings, progress and review history on repeat imports.
Backups merge without overwriting existing local meanings/review state.
Keep source terms/timings independent of romanization; matching is language scoped,
with `und` concepts shared across languages. Learning decoration must not change
font geometry or obscure the focal grapheme. Cards require a saved meaning.
Do not invent dictionary definitions or add network lookup without a deliberate
source/licensing/privacy decision. Imported files and saved items render as text.

YouTube supplies the transcript and timings up front. The current caption word is a
lookup against `video.currentTime`. There is no transcription queue,
backpressure or pacing engine for video. The WPM badge is informational only.
Articles have a separate user-controlled WPM timer; never apply it to captions.

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
- Article extraction, temporary sessions and its reading page live in `src/article/`.
  Use Readability on a cloned document and preserve structural blocks. Render
  extracted text through DOM text nodes, never source HTML in the extension page.
  Use temporary `activeTab`/`scripting` access from explicit context-menu actions;
  do not add permanent all-site content scripts. The toolbar still opens settings.
  Keep article text in `chrome.storage.session`, clean it up when its tab closes,
  and keep article preferences in local storage. Explicit learning saves may keep
  a bounded source excerpt in the collection. Never sync or upload article text.
  The article WPM clock pauses when its tab is hidden. Its full document keeps
  heading levels, lists, quotes and code; heading/body/code typography differs.
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
  The standalone article page mounts its own reader in its dedicated stage;
  it never reuses or moves a YouTube player.
- Focus and Reading mode use YouTube’s native fullscreen control. Leave the
  bottom playback strip clear of both the book and transcript. Do not cover
  native controls with the blackout. Transcript seeks preserve pause state.
- One outward arrow on each side changes width only. The top-centre arrow changes text size;
  caption height always follows the font/content, and old manual heights are
  ignored. Reveal handles on hover or keyboard focus. Keep the caption padding
  reachable so grips cannot disappear on approach. Reserve room outside the
  caption for both handles, including at player edges.
- Reading mode inherits the caption font/inks, retains a stable paragraph around
  the current source word. Paragraph view follows wrapped lines; Centre word
  shifts only the active line to keep the focal grapheme fixed on both axes.
  Split words with the same grapheme-safe recognition point used by RSVP. Keep
  their font geometry unchanged as the highlight advances. Forward excerpt
  refreshes start on an existing wrapped line so retained context does not rewrap.
  A 60ms fade may soften context at adjacent line changes; never fade the current
  word, delay its timing, animate seeks, or ignore reduced-motion preferences.
  Keep its view preference separate from the six caption modes. Do not hide the
  whole overlay when replacing its stage: controls and the blackout must survive.
  Dock appearance on the left while editing, reserve its width for the book,
  and keep the independent transcript on the right. Use the same accent ink for
  resize arrows and the current Reading focal letter.
- The transcript uses the full source words, including words filtered from the
  reader. Romanization changes display only, never source timings. Study words
  opens capture on a word click; timestamps always seek and preserve pause state.
  Keep a way to disable study clicks and open appearance from caption padding
  or keyboard. Learning panels tear down on video navigation and close on ads.
- The on-player switch must stay available while disabled and without captions.
  YouTube may replace the control bar without changing videos.

## Preferences and rendering

- Themes are text-colour starting points over one plain black caption background.
  Opacity is configurable. No rounded cards, shadows or decorative blur.
- Saved presets contain appearance/reading settings. They do not change enabled,
  language, romanization, focus or book-view preferences. Leave legacy records alone.
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
only captions, arrow handles, panel controls and the player switch accept
input. Keep YouTube’s playback controls usable.

The focal point stays fixed while reading. Use no competing animation beyond a
sub-80ms opacity swap. Default text inks avoid pure white; the background is
black at the user’s chosen opacity.

Commits use conventional prefixes (`feat:`, `fix:`, `docs:`, `refactor:`,
`chore:`) and explain the reason for the change.
