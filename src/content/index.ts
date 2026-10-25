/**
 * Content script: wire the caption timeline to the video clock.
 *
 * This reader is much simpler than the desktop app's, and for one reason: the
 * whole transcript arrives with timings attached. There is no queue, no
 * backpressure and no pacing to estimate — the current word is a lookup against
 * `video.currentTime`.
 *
 * That is also why playback rate needs no handling at all. `currentTime` already
 * accounts for it, so watching at 2x simply moves the words twice as fast, which
 * is the point: RSVP is what makes 2x comprehensible.
 */

import {
  captionVideoId,
  parseCaptions,
  pickTrack,
  withoutFillers,
  wordAt,
  type CaptionTrack,
  type TimedWord,
} from "./captions";
import { ReaderOverlay } from "./overlay";
import { ReaderControls } from "./controls";
import { readingWpm } from "./speed";
import { nativeCaptionSource, type CaptionSource } from "./captionSource";
import { buildLines, lineAt, readsWholeLine, type Line } from "./lines";
import { adAction, isAdShowing } from "./ads";
import { FocusView } from "./focus";
import { PlayerToggle } from "./playerToggle";
import {
  DEFAULTS,
  loadSettings,
  onSettingsChanged,
  saveSettings,
  type Settings,
} from "../settings";

const CHANNEL = "trf-youtube";

interface Session {
  words: TimedWord[];
  overlay: ReaderOverlay;
  focus: FocusView;
  video: HTMLVideoElement;
  stop: () => void;
  /** Force one redraw. A paused video presents no frames, so a settings change
   *  would otherwise not reach the screen until playback resumed. */
  redraw: () => void;
}

// Not top-level await: a content script is bundled as an IIFE, where that is a
// syntax error. Settings start at their defaults and are replaced during init.
let settings: Settings = DEFAULTS;
let session: Session | null = null;
let tracks: CaptionTrack[] = [];
/** Caption payloads seen for the current video, newest last. */
let pendingBodies: CaptionSource[] = [];
let currentVideoId: string | null = null;
/** Whether an ad is on screen right now. See `ads.ts`. */
let adShowing = false;
let adWatcher: { player: HTMLElement; observer: MutationObserver } | null =
  null;
let playerToggle: PlayerToggle | null = null;

/* ── page bridge ────────────────────────────────────────────────────────── */

function injectPageScript(): void {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("inject.js");
  script.addEventListener("load", () => script.remove());
  (document.head ?? document.documentElement).appendChild(script);
}

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window || event.origin !== window.location.origin)
    return;
  const data = event.data as {
    channel?: string;
    kind?: string;
    payload?: unknown;
  };
  if (data?.channel !== CHANNEL) return;

  // Captions can beat navigation; reset before accepting the new transcript.
  onNavigate();

  if (data.kind === "tracks") {
    const mine = (data.payload as CaptionTrack[]).filter((t) =>
      belongsToCurrentVideo(t.baseUrl),
    );
    // An empty result means every track belonged to something else — an ad.
    // Keeping what we had beats replacing it with nothing.
    if (mine.length > 0) {
      tracks = mine;
      void start();
    }
  } else if (data.kind === "timedtext") {
    const { url, body } = data.payload as { url?: string; body: string };
    if (body && belongsToCurrentVideo(url)) {
      pendingBodies.push({ url, body });
      void start();
    }
  }
});

/**
 * Does this payload belong to the video in the address bar?
 *
 * A caption URL names its own video id, which settles a question the ad state
 * alone cannot. The player fetches the *main* video's track during a pre-roll as
 * well as the ad's, so "arrived while an ad was showing" and "belongs to the ad"
 * are different things — and discarding on timing alone would throw away the
 * very captions being waited for.
 */
function belongsToCurrentVideo(url: string | undefined): boolean {
  const current = videoIdOf();
  const id = url ? captionVideoId(url) : null;
  // Either side unknown: fall back to the ad state, which is the weaker signal.
  if (id === null || current === null) return !adShowing;
  return id === current;
}

/** Ask the page script to re-read the player response. */
function requestRescan(): void {
  window.postMessage(
    { channel: CHANNEL, kind: "rescan" },
    window.location.origin,
  );
}

/* ── caption acquisition ────────────────────────────────────────────────── */

/**
 * The player's captured text or signed URL comes first. Track URLs can lack
 * the proof-of-origin token and return HTTP 200 with an empty body, so judge
 * success by whether words came out rather than by the status alone.
 */
async function collectWords(): Promise<TimedWord[]> {
  const track = pickTrack(tracks, settings.language);
  const cache = pendingBodies;
  const sources = [...cache].reverse().flatMap((source) => {
    const native = nativeCaptionSource(source, track?.languageCode);
    return native ? [native] : [];
  });
  if (track) {
    for (const format of ["json3", ""]) {
      try {
        const url = new URL(track.baseUrl);
        if (format) url.searchParams.set("fmt", format);
        sources.push({ url: url.toString(), body: "" });
      } catch {
        // A malformed track must not discard a usable captured response.
      }
    }
  }

  for (const source of sources) {
    try {
      let { body } = source;
      if (!body && source.url) {
        const response = await fetch(source.url, { credentials: "include" });
        if (!response.ok) continue;
        body = await response.text();
      }
      const words = parseCaptions(body);
      if (words.length === 0) continue;
      if (!source.body) cache.push({ url: source.url, body });
      return words;
    } catch {
      // A signed URL can expire; try the remaining sources.
    }
  }
  return [];
}

/* ── session ────────────────────────────────────────────────────────────── */

const videoIdOf = (): string | null =>
  new URLSearchParams(window.location.search).get("v");

function findPlayer(): { player: HTMLElement; video: HTMLVideoElement } | null {
  const player = document.querySelector<HTMLElement>("#movie_player");
  const video = player?.querySelector<HTMLVideoElement>("video");
  return player && video ? { player, video } : null;
}

/** An overtaken caption fetch must not mount a second reader. */
let generation = 0;

async function start(): Promise<void> {
  if (!currentVideoId || !settings.enabled || session) return;
  const mine = ++generation;
  const words = await collectWords();
  // Navigation can replace the player while captions load. Use the current one,
  // and reject any attempt overtaken by another start, teardown or navigation.
  const found = findPlayer();
  if (!found || mine !== generation || currentVideoId !== videoIdOf()) return;
  watchAds(found.player);
  if (mine !== generation || adShowing || words.length === 0) return;

  const usable = settings.removeFillers ? withoutFillers(words) : words;
  let controls: ReaderControls;
  const overlay = new ReaderOverlay(
    settings,
    (root) =>
      (controls = new ReaderControls(root, settings, {
        romanizable: words.some(({ word }) =>
          /[\p{Script=Devanagari}\p{Script=Bengali}]/u.test(word.text),
        ),
        onChange: (patch) => {
          applySettings({ ...settings, ...patch });
        },
      })),
  );
  overlay.mount(found.player);
  const focus = new FocusView(found.player, found.video, words, {
    onFocus: (focusMode) => {
      applySettings({ ...settings, focusMode });
      void saveSettings({ focusMode });
    },
  });
  controls!.attachFocus(focus.controls);
  focus.apply(settings);
  document.documentElement.classList.toggle(
    "trf-hide-native",
    settings.hideNativeCaptions,
  );

  session = {
    words: usable,
    overlay,
    focus,
    video: found.video,
    ...track(found.video, usable, overlay, focus),
  };
  session.redraw();
}

/**
 * Follow the video clock.
 *
 * `requestVideoFrameCallback` is preferred: it fires in step with presented
 * frames, so the word changes when the viewer actually sees that moment. It
 * also stops on its own while paused. rAF is the fallback for browsers without
 * it, where a pause check is needed explicitly.
 */
function track(
  video: HTMLVideoElement,
  words: TimedWord[],
  overlay: ReaderOverlay,
  focus: FocusView,
): { stop: () => void; redraw: () => void } {
  let stopped = false;
  let handle = 0;

  /*
   * Built once, and only if a static mode actually asks for one.
   *
   * A transcript is tens of thousands of words, and chunking it is wasted work
   * for the five modes that slide. Cached rather than recomputed per frame for
   * the same reason.
   */
  let cachedLines: Line[] | null = null;
  // Indices line up with `words` because the map is one-to-one, which is what
  // lets `lineAt` be queried with the index `wordAt` just returned.
  let cachedFor = -1;
  const lines = (): Line[] => {
    // Rebuilt when the setting changes, not only when the video does: line
    // length is a live control and the preview has to follow it.
    if (!cachedLines || cachedFor !== settings.lineWords) {
      cachedFor = settings.lineWords;
      cachedLines = buildLines(
        words.map((w) => w.word),
        settings.lineWords,
      );
    }
    return cachedLines;
  };

  const update = (): void => {
    // An ad runs through this same element on its own clock, so the transcript
    // read at that offset would be real words at meaningless moments. Hide the
    // reader outright rather than fading it: there is nothing to follow.
    //
    // The player is read directly here rather than through the cached flag. A
    // session can be built in the instant before the ad class lands, and the
    // flag would then let a frame of the real transcript render over the ad.
    if (adOnScreen()) {
      overlay.setHidden(true);
      focus.setHidden(true);
      overlay.clear();
      return;
    }
    overlay.setHidden(false);
    focus.setHidden(false);
    const timeMs = video.currentTime * 1000;
    focus.update(timeMs);
    const index = wordAt(words, timeMs);
    overlay.setSpeed(
      readingWpm(words, index, video.playbackRate),
      video.paused,
    );
    if (index < 0) {
      overlay.clear();
      return;
    }

    /*
     * Static is a line at a time, not a window around the playhead.
     *
     * Keyed on the line's own start index so the render guard holds the whole
     * line still: this runs once a frame, and without a key that changes only
     * at a boundary the caption would be rebuilt sixty times a second for no
     * visible reason. `current` is the line's first word purely so the guard
     * upstream still has a word to work with; nothing marks it on screen.
     */
    if (readsWholeLine(settings)) {
      const line = lineAt(lines(), index);
      if (!line) {
        overlay.clear();
        return;
      }
      overlay.render({
        key: `line:${line.startIndex}`,
        current: line.words[0],
        previous: [],
        upcoming: line.words.slice(1),
      });
      return;
    }

    overlay.render({
      current: words[index].word,
      previous: words
        .slice(Math.max(0, index - settings.contextBefore), index)
        .map((w) => w.word),
      upcoming: words
        .slice(index + 1, index + 1 + settings.contextAfter)
        .map((w) => w.word),
    });
  };

  type WithFrameCallback = HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: () => void) => number;
    cancelVideoFrameCallback?: (id: number) => void;
  };
  const withFrames = video as WithFrameCallback;
  const events = ["seeked", "ratechange", "play", "pause", "ended"];
  for (const event of events) video.addEventListener(event, update);
  const unlisten = (): void => {
    for (const event of events) video.removeEventListener(event, update);
  };

  if (typeof withFrames.requestVideoFrameCallback === "function") {
    const step = (): void => {
      if (stopped) return;
      update();
      handle = withFrames.requestVideoFrameCallback!(step);
    };
    handle = withFrames.requestVideoFrameCallback(step);
    // A paused video presents no frames, so the callback stops firing and the
    // last word simply stays — which is the behaviour we want. Seeking while
    // paused still needs an explicit nudge.
    return {
      redraw: update,
      stop: () => {
        stopped = true;
        withFrames.cancelVideoFrameCallback?.(handle);
        unlisten();
      },
    };
  }

  const step = (): void => {
    if (stopped) return;
    if (!video.paused) update();
    handle = requestAnimationFrame(step);
  };
  handle = requestAnimationFrame(step);
  return {
    redraw: update,
    stop: () => {
      stopped = true;
      cancelAnimationFrame(handle);
      unlisten();
    },
  };
}

function teardown(): void {
  // Invalidates any start still waiting on its transcript, which is the case
  // this has to handle: with no session yet, there is nothing else to stop.
  generation += 1;
  session?.stop();
  session?.focus.destroy();
  session?.overlay.destroy();
  session = null;
  document.documentElement.classList.remove("trf-hide-native");
}

/* ── ads ────────────────────────────────────────────────────────────────── */

/**
 * Watch the player's ad state.
 *
 * Attached lazily, because `#movie_player` does not exist when the content
 * script first runs. Re-attaching to the same element is a no-op, so this can be
 * called from anywhere that has just found the player.
 */
/**
 * Is an ad on screen right now?
 *
 * Reads the player rather than the cached flag, which only updates when the
 * observer fires. Cheap enough to call per frame, and being right per frame is
 * what keeps the reader off the screen during an ad.
 */
function adOnScreen(): boolean {
  return isAdShowing(
    adWatcher?.player ?? document.querySelector("#movie_player"),
  );
}

function watchAds(player: HTMLElement): void {
  if (adWatcher?.player !== player) {
    adWatcher?.observer.disconnect();
    const observer = new MutationObserver(() => onAdStateChange(player));
    observer.observe(player, { attributes: true, attributeFilter: ["class"] });
    adWatcher = { player, observer };
  }

  // Reconcile on every call, not only on the first. A MutationObserver reports
  // changes, never the state it started from, so the page may already be mid-ad
  // when we attach — and this is also what corrects a transition that was missed
  // while no observer was attached at all.
  onAdStateChange(player);
}

function onAdStateChange(player: HTMLElement): void {
  const isAd = isAdShowing(player);
  const action = adAction({ wasAd: adShowing, isAd, hasSession: !!session });
  adShowing = isAd;

  switch (action) {
    case "suspend":
      // Done here as well as in `update`, because a paused ad presents no frames
      // and `update` would not run to notice.
      session?.overlay.setHidden(true);
      session?.focus.setHidden(true);
      session?.overlay.clear();
      break;
    case "resume":
      // A mid-roll interrupted captions that are still correct. Re-fetching them
      // would be wasted work that can also fail.
      session?.overlay.setHidden(false);
      session?.redraw();
      break;
    case "rescan":
      // A pre-roll left no session. Nothing is discarded here: payloads are
      // filtered by the video id in their own URL, so anything held is already
      // the main video's — including tracks the player prefetched behind the ad.
      // What is missing is the player response, which `inject.ts` declines to
      // publish while an ad is showing and no navigation event will prompt again.
      requestRescan();
      void start();
      break;
    case "none":
      break;
  }
}

/* ── navigation ─────────────────────────────────────────────────────────── */

/**
 * YouTube never reloads. Every video change has to tear the previous session
 * down explicitly, or listeners and overlays accumulate for the whole session.
 */
function onNavigate(): void {
  const id = videoIdOf();
  if (id === currentVideoId) return;
  currentVideoId = id;
  teardown();
  tracks = [];
  pendingBodies = [];
  playerToggle?.destroy();
  playerToggle = null;
  if (id) {
    // The player can lag navigation; ask again with the bridge's retries.
    requestRescan();
    awaitPlayer();
  }
}

/**
 * Look for the player until it appears, then start.
 *
 * `#movie_player` does not exist when the content script first runs, and there
 * is one case where nothing else will ever prompt us: a pre-roll ad with
 * captions switched off. No caption request is made, and the page script
 * declines to publish a player response while an ad is showing — so without
 * this, the ad would end with no watcher attached and the video would play
 * unread until the page was reloaded.
 */
function awaitPlayer(): void {
  let tries = 0;
  const tick = (): void => {
    const found = findPlayer();
    if (found) {
      mountToggle(found.player);
      watchAds(found.player);
      void start();
      return;
    }
    if (++tries < 40) window.setTimeout(tick, 250);
  };
  tick();
}

function mountToggle(player: HTMLElement): void {
  if (playerToggle?.player !== player) {
    playerToggle?.destroy();
    playerToggle = new PlayerToggle(player, () => {
      const enabled = !settings.enabled;
      applySettings({ ...settings, enabled });
      void saveSettings({ enabled });
    });
  }
  playerToggle.apply(settings.enabled);
}

function applySettings(next: Settings): void {
  const previous = settings;
  settings = next;
  playerToggle?.apply(next.enabled);
  if (!next.enabled) {
    teardown();
    return;
  }
  if (
    !previous.enabled ||
    previous.removeFillers !== next.removeFillers ||
    previous.language !== next.language
  ) {
    teardown();
    void start();
    return;
  }
  session?.overlay.apply(next);
  session?.focus.apply(next);
  session?.redraw();
  document.documentElement.classList.toggle(
    "trf-hide-native",
    !!session && next.hideNativeCaptions,
  );
}

async function init(): Promise<void> {
  settings = await loadSettings();
  onSettingsChanged(applySettings);
  document.addEventListener("yt-navigate-finish", onNavigate);
  window.addEventListener("popstate", onNavigate);
  window.addEventListener("pagehide", () => {
    teardown();
    playerToggle?.destroy();
  });
  injectPageScript();
  currentVideoId = videoIdOf();
  awaitPlayer();
}

void init();
