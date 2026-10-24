export interface CaptionSource {
  url?: string;
  body: string;
}

/** A translated response is not the track's native text. Keep its signed URL. */
export function nativeCaptionSource(
  source: CaptionSource,
  language?: string,
): CaptionSource | null {
  try {
    const url = new URL(source.url ?? "", "https://www.youtube.com");
    if (language && url.searchParams.get("lang") !== language) return null;
    if (!url.searchParams.has("tlang")) return source;
    url.searchParams.delete("tlang");
    url.searchParams.set("fmt", "json3");
    return { url: url.toString(), body: "" };
  } catch {
    return language ? null : source;
  }
}
