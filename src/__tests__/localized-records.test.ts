import { describe, it, expect } from "vitest";
import { mergeRecordData, toProposedFields } from "../ai-tools-ops.js";

describe("mergeRecordData", () => {
  const localized = ["title"];

  it("keeps the languages the caller did not send", () => {
    // An agent adding a Polish translation must not have to resend the English
    // one to avoid deleting it - a shallow merge would replace the whole map.
    const merged = mergeRecordData(
      { title: { en: "Ball bearing" }, sku: "BRG-1" },
      { title: { pl: "Łożysko kulkowe" } },
      localized,
    );
    expect(merged.title).toEqual({
      en: "Ball bearing",
      pl: "Łożysko kulkowe",
    });
    expect(merged.sku).toBe("BRG-1");
  });

  it("overwrites a language the caller did send", () => {
    const merged = mergeRecordData(
      { title: { en: "Ball bearing", pl: "Łożysko" } },
      { title: { pl: "Łożysko kulkowe" } },
      localized,
    );
    expect(merged.title).toEqual({
      en: "Ball bearing",
      pl: "Łożysko kulkowe",
    });
  });

  it("replaces a field that is not translatable, as before", () => {
    const merged = mergeRecordData(
      { sku: "BRG-1", stock: 10 },
      { stock: 4 },
      localized,
    );
    expect(merged).toEqual({ sku: "BRG-1", stock: 4 });
  });

  it("does not deep-merge a plain object on a field that is not translatable", () => {
    const merged = mergeRecordData(
      { specs: { bore: "25mm", width: "12mm" } },
      { specs: { bore: "30mm" } },
      localized,
    );
    expect(merged.specs).toEqual({ bore: "30mm" });
  });
});

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
