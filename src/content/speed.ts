import type { TimedWord } from "./captions";

/** A local estimate of the caption pace, not a clock that advances the reader. */
export function readingWpm(
  words: TimedWord[],
  index: number,
  playbackRate: number,
): number | null {
  const current = words[index];
  if (!current || !Number.isFinite(playbackRate) || playbackRate <= 0)
    return null;
  let first = index;
  let last = index;
  while (first > 0 && words[first - 1].startMs >= current.startMs - 5000)
    first -= 1;
  while (
    last + 1 < words.length &&
    words[last + 1].startMs <= current.startMs + 5000
  )
    last += 1;
  // Cue ends can include silence. Count intervals between nearby word onsets.
  const span = words[last].startMs - words[first].startMs;
  return span > 0 && Number.isFinite(span)
    ? Math.round(((last - first) * 60000 * playbackRate) / span)
    : null;
}
