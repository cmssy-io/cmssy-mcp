import { describe, expect, it, vi } from "vitest";
import { putObject } from "../put-object.js";

const BYTES = new Uint8Array([1, 2, 3]);

function response(status: number, body = ""): Response {
  return new Response(body, { status });
}

describe("putObject", () => {
  it("sends the bytes with the declared content type", async () => {
    const fetchImpl = vi.fn(async () => response(200));

    await putObject("https://r2/put", BYTES, "image/png", fetchImpl as never);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://r2/put");
    expect(init.method).toBe("PUT");
    expect(init.headers).toEqual({ "Content-Type": "image/png" });
    expect(init.body).toBe(BYTES);
  });

  it("carries R2's error body into the message, not just the status", async () => {
    const fetchImpl = vi.fn(async () =>
      response(403, "<Error><Code>SignatureDoesNotMatch</Code></Error>"),
    );

    await expect(
      putObject("https://r2/put", BYTES, "image/png", fetchImpl as never),
    ).rejects.toThrow(/SignatureDoesNotMatch/);
  });

  it("does not retry a signature failure", async () => {
    const fetchImpl = vi.fn(async () => response(403, "nope"));

    await expect(
      putObject("https://r2/put", BYTES, "image/png", fetchImpl as never),
    ).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a transient 503 and succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200));

    await putObject("https://r2/put", BYTES, "image/png", fetchImpl as never);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries a dropped connection and reports its cause when it never recovers", async () => {
    const reset = Object.assign(new TypeError("fetch failed"), {
      cause: { code: "ECONNRESET" },
    });
    const fetchImpl = vi.fn().mockRejectedValue(reset);

    await expect(
      putObject("https://r2/put", BYTES, "image/png", fetchImpl as never),
    ).rejects.toThrow(/ECONNRESET/);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
