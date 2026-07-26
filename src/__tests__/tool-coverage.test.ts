import { describe, it, expect, vi } from "vitest";
import { AI_TOOLS } from "@cmssy/ai-tools";
import { createServer } from "../server.js";
import type { CmssyClient } from "../graphql-client.js";

function boundToolNames(): Set<string> {
  const names = new Set<string>();
  const client = {
    query: vi.fn(),
  } as unknown as CmssyClient;
  const server = createServer(client);
  const registered = (
    server as unknown as { _registeredTools?: Record<string, unknown> }
  )._registeredTools;

  for (const name of Object.keys(registered ?? {})) names.add(name);
  return names;
}

const KNOWN_UNBOUND = new Set(["search_content"]);

describe("tool coverage", () => {
  const bound = boundToolNames();

  it("finds the server's registered tools at all", () => {
    expect(bound.size).toBeGreaterThan(50);
  });

  it("binds every tool the shared registry defines", () => {
    const missing = AI_TOOLS.map((t) => t.name).filter(
      (n) => !bound.has(n) && !KNOWN_UNBOUND.has(n),
    );

    expect(missing).toEqual([]);
  });

  it("keeps the unbound list honest - a bound tool must leave it", () => {
    const stale = [...KNOWN_UNBOUND].filter((n) => bound.has(n));

    expect(stale).toEqual([]);
  });
});
