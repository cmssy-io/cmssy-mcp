import { describe, it, expect } from "vitest";
import { toProposedFields } from "../ai-tools-ops.js";

describe("toProposedFields", () => {
  it("tells the agent which fields are translatable", () => {
    const [title, sku] = toProposedFields([
      { key: "title", label: "Title", type: "text", localized: true },
      { key: "sku", label: "SKU", type: "text" },
    ]);
    expect(title?.localized).toBe(true);
    expect(sku?.localized).toBeUndefined();
  });
});
