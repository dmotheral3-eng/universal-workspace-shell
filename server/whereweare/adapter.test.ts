import { describe, expect, it } from "vitest";
import { absoluteUrl, headerReader, isNodeResponse } from "./adapter.js";

describe("headerReader", () => {
  it("reads a Web Headers instance", () => {
    const h = new Headers({ authorization: "Bearer abc" });
    expect(headerReader(h).get("Authorization")).toBe("Bearer abc");
  });

  it("reads a Node plain-object header bag — the shape that crashed the first deploy", () => {
    const r = headerReader({ authorization: "Bearer abc" });
    expect(r.get("Authorization")).toBe("Bearer abc");
    expect(r.get("authorization")).toBe("Bearer abc");
  });

  it("takes the first value when Node gives an array", () => {
    expect(headerReader({ authorization: ["Bearer one", "Bearer two"] }).get("authorization")).toBe("Bearer one");
  });

  it("returns null rather than throwing for a missing or absent bag", () => {
    expect(headerReader(undefined).get("authorization")).toBeNull();
    expect(headerReader(null).get("authorization")).toBeNull();
    expect(headerReader({}).get("authorization")).toBeNull();
  });
});

describe("absoluteUrl", () => {
  it("passes an absolute URL through", () => {
    expect(absoluteUrl("https://x.example/api/whereweare?a=1", "/api/whereweare"))
      .toBe("https://x.example/api/whereweare?a=1");
  });

  it("makes a Node path parseable without addressing anything real", () => {
    expect(absoluteUrl("/api/whereweare?a=1", "/api/whereweare"))
      .toBe("http://localhost/api/whereweare?a=1");
  });

  it("falls back when the platform gives nothing", () => {
    expect(absoluteUrl(undefined, "/api/whereweare")).toBe("http://localhost/api/whereweare");
    expect(absoluteUrl("", "/api/whereweare")).toBe("http://localhost/api/whereweare");
  });
});

describe("isNodeResponse", () => {
  it("recognises a Node response by its setHeader", () => {
    expect(isNodeResponse({ setHeader: () => {} })).toBe(true);
  });

  it("does not mistake undefined or a plain object for one", () => {
    expect(isNodeResponse(undefined)).toBe(false);
    expect(isNodeResponse({})).toBe(false);
  });
});
