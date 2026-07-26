/**
 * A tool defined in @cmssy/ai-tools and registered in AI_TOOLS is still
 * invisible until this server binds it. That gap shipped once: 0.50.0 went to
 * npm advertising 79 tools, without the clear_cart_config it was released for
 * (CMS-1062). Nothing failed - the tool simply was not there.
 */
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

describe("tool coverage", () => {
  const bound = boundToolNames();

  it("finds the server's registered tools at all", () => {
    // If this breaks, the SDK changed where it keeps them and the check below
    // would pass vacuously - which is worse than failing.
    expect(bound.size).toBeGreaterThan(50);
  });

  // Defined in @cmssy/ai-tools, never bound here. Found by this test, not by
  // anyone using them. Each one is either meant for Spotlight only - in which
  // case say so here - or it is a gap to close; leaving them unlisted is what
  // let them sit unnoticed. Adding a name here must be a decision, not a way
  // to make the build green.
  const KNOWN_UNBOUND = new Set(["search_content", "promote_dev_draft"]);

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
