import { describe, it, expect } from "vitest";
import { toPropertyFields } from "../ai-tools-ops.js";

describe("toPropertyFields", () => {
  it("translates the shared FieldType names the backend enum does not have", () => {
    const mapped = toPropertyFields([
      { key: "name", label: "Name", type: "string" },
      { key: "body", label: "Body", type: "richtext" },
    ]);

    expect(mapped.map((f) => f.type)).toEqual(["text", "richText"]);
  });

  it("leaves the names both sides already agree on", () => {
    const types = [
      "number",
      "boolean",
      "date",
      "datetime",
      "email",
      "url",
      "media",
      "select",
      "multiselect",
      "relation",
      "object",
      "list",
    ];

    const mapped = toPropertyFields(
      types.map((type) => ({ key: type, label: type, type })),
    );

    expect(mapped.map((f) => f.type)).toEqual(types);
  });

  it("translates a list's item type", () => {
    const [field] = toPropertyFields([
      { key: "tags", label: "Tags", type: "list", itemType: "string" },
    ]);

    expect(field?.itemType).toBe("text");
  });

  it("translates nested object and repeater fields", () => {
    const [field] = toPropertyFields([
      {
        key: "specs",
        label: "Specs",
        type: "object",
        fields: [{ key: "material", label: "Material", type: "string" }],
        itemFields: [{ key: "note", label: "Note", type: "richtext" }],
      },
    ]);

    expect(field?.fields?.[0]?.type).toBe("text");
    expect(field?.itemFields?.[0]?.type).toBe("richText");
  });
});
