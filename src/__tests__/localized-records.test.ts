import { describe, it, expect } from "vitest";
import { toProposedFields } from "../ai-tools-ops.js";

describe("toProposedFields", () => {
  it("tells the agent which fields are translatable", () => {
    const [title, sku] = toProposedFields([
      {
        key: "title",
        label: { en: "Title" },
        type: "text",
        required: false,
        localized: true,
      },
      { key: "sku", label: { en: "SKU" }, type: "text", required: true },
    ]);
    expect(title?.localized).toBe(true);
    expect(sku?.localized).toBeUndefined();
  });
});
