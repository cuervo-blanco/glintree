import { describe, expect, it } from "vitest";
import { nativeCaptionSource } from "./captionSource";

const native = {
  url: "https://www.youtube.com/api/timedtext?v=video&lang=bn&pot=proof&signature=signed",
  body: "বাংলা",
};

describe("native caption sources", () => {
  it("uses captured native text without another fetch", () => {
    expect(nativeCaptionSource(native, "bn")).toBe(native);
  });

  it("accepts relative player requests", () => {
    const source = {
      ...native,
      url: "/api/timedtext?v=video&lang=bn&pot=proof",
    };
    expect(nativeCaptionSource(source, "bn")).toBe(source);
    expect(
      nativeCaptionSource({ ...source, url: `${source.url}&tlang=hi` }, "bn"),
    ).toEqual({
      url: "https://www.youtube.com/api/timedtext?v=video&lang=bn&pot=proof&fmt=json3",
      body: "",
    });
  });

  it("removes translation while preserving the signed request", () => {
    const source = nativeCaptionSource(
      { url: `${native.url}&tlang=hi&fmt=srv3`, body: "हिन्दी" },
      "bn",
    );
    expect(source?.body).toBe("");
    expect(Object.fromEntries(new URL(source!.url!).searchParams)).toEqual({
      v: "video",
      lang: "bn",
      pot: "proof",
      signature: "signed",
      fmt: "json3",
    });
  });

  it("ignores other source languages even when translated into the selection", () => {
    expect(nativeCaptionSource(native, "hi")).toBeNull();
    expect(
      nativeCaptionSource({ ...native, url: `${native.url}&tlang=hi` }, "hi"),
    ).toBeNull();
  });

  it("uses unknown sources only before the available tracks are known", () => {
    for (const url of [undefined, "invalid"]) {
      const source = { url, body: "captions" };
      expect(nativeCaptionSource(source)).toBe(source);
      expect(nativeCaptionSource(source, "bn")).toBeNull();
    }
  });
});
