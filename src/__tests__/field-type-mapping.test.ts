import { describe, it, expect } from "vitest";
import { toPropertyFields, toProposedFields } from "../ai-tools-ops.js";

describe("toPropertyFields", () => {
  it("passes the canonical backend type names through unchanged", () => {
    const types = [
      "text",
      "textarea",
      "richText",
      "markdown",
      "password",
      "phone",
      "json",
      "color",
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
      "hidden",
    ];

    const mapped = toPropertyFields(
      types.map((type) => ({ key: type, label: type, type })),
    );

    expect(mapped.map((f) => f.type)).toEqual(types);
  });

  it("prefixes relationTo with model: for the backend", () => {
    const mapped = toPropertyFields([
      {
        key: "category",
        label: "Category",
        type: "relation",
        relationTo: "category",
      },
    ]);

    expect(mapped[0]?.relationTo).toBe("model:category");
  });

  it("does not double-prefix a relationTo that already has model:", () => {
    const mapped = toPropertyFields([
      {
        key: "category",
        label: "Category",
        type: "relation",
        relationTo: "model:category",
      },
    ]);

    expect(mapped[0]?.relationTo).toBe("model:category");
  });

  it("round-trips a raw backend field back to the tool contract", () => {
    const proposed = toProposedFields([
      {
        key: "password",
        label: "Password",
        type: "password",
        required: false,
        hidden: true,
        description: null,
        defaultValue: null,
        options: [],
        relationTo: null,
      },
      {
        key: "category",
        label: "Category",
        type: "relation",
        required: true,
        relationTo: "model:category",
        relationType: "hasOne",
        minLength: null,
        maxValue: 10,
      },
    ]);

    expect(proposed).toEqual([
      {
        key: "password",
        label: "Password",
        type: "password",
        required: false,
        hidden: true,
      },
      {
        key: "category",
        label: "Category",
        type: "relation",
        required: true,
        relationTo: "category",
        relationType: "hasOne",
        maxValue: 10,
      },
    ]);
  });

  it("prefixes relationTo inside nested object and item fields", () => {
    const [field] = toPropertyFields([
      {
        key: "specs",
        label: "Specs",
        type: "object",
        fields: [
          {
            key: "brand",
            label: "Brand",
            type: "relation",
            relationTo: "brand",
          },
        ],
        itemFields: [
          {
            key: "supplier",
            label: "Supplier",
            type: "relation",
            relationTo: "supplier",
          },
        ],
      },
    ]);

    expect(field?.fields?.[0]?.relationTo).toBe("model:brand");
    expect(field?.itemFields?.[0]?.relationTo).toBe("model:supplier");
  });
});
