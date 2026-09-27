import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildSchema,
  isInputObjectType,
  isObjectType,
  parse,
  visit,
  type FieldNode,
  type GraphQLInputObjectType,
  type GraphQLObjectType,
} from "graphql";
import type { z } from "zod";
import { AI_TOOLS } from "@cmssy/ai-tools";
import { FORM_BY_ID_QUERY } from "../queries.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const schema = buildSchema(
  readFileSync(resolve(root, "schema.graphql"), "utf8"),
);

function inputFields(name: string): string[] {
  const type = schema.getType(name);
  if (!isInputObjectType(type)) throw new Error(`${name} is not an input type`);
  return Object.keys((type as GraphQLInputObjectType).getFields()).sort();
}

function outputFields(name: string): string[] {
  const type = schema.getType(name);
  if (!isObjectType(type)) throw new Error(`${name} is not an object type`);
  return Object.keys((type as GraphQLObjectType).getFields()).sort();
}

type ZodLike = {
  shape?: z.ZodRawShape;
  _def?: { innerType?: ZodLike; element?: ZodLike; type?: ZodLike };
};

function objectShape(field: unknown): z.ZodRawShape {
  let current = field as ZodLike;
  while (!current.shape) {
    const next =
      current._def?.innerType ?? current._def?.element ?? current._def?.type;
    if (!next) throw new Error("not an object");
    current = next;
  }
  return current.shape!;
}

function toolShape(name: string): z.ZodRawShape {
  const tool = AI_TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`${name} is not in the registry`);
  return (tool.inputSchema as z.ZodObject<z.ZodRawShape>).shape;
}

function selectedUnder(query: string, parent: string): Set<string> {
  const names = new Set<string>();
  visit(parse(query), {
    Field(node: FieldNode) {
      if (node.name.value !== parent || !node.selectionSet) return;
      visit(node.selectionSet, {
        Field(inner: FieldNode) {
          names.add(inner.name.value);
        },
      });
    },
  });
  return names;
}

describe.each([["create_form"], ["update_form"]])(
  "%s mirrors the form input types (CMS-1943)",
  (toolName) => {
    it("describes a field with the backend's own field keys", () => {
      const field = objectShape(toolShape(toolName).fields!);

      expect(Object.keys(field).sort()).toEqual(inputFields("FormFieldInput"));
    });

    it("describes a field's validation with the backend's own keys", () => {
      const field = objectShape(toolShape(toolName).fields!);

      expect(Object.keys(objectShape(field.validation!)).sort()).toEqual(
        inputFields("FormFieldValidationInput"),
      );
    });

    it("describes a field's option with the backend's own keys", () => {
      const field = objectShape(toolShape(toolName).fields!);

      expect(Object.keys(objectShape(field.options!)).sort()).toEqual(
        inputFields("FormFieldOptionInput"),
      );
    });

    it("describes settings with the backend's own keys", () => {
      expect(
        Object.keys(objectShape(toolShape(toolName).settings!)).sort(),
      ).toEqual(inputFields("FormSettingsInput"));
    });
  },
);

describe("get_form reads back everything the form tools can set", () => {
  it("selects every field of FormFieldDefinition", () => {
    const selected = selectedUnder(FORM_BY_ID_QUERY, "fields");
    const missing = outputFields("FormFieldDefinition").filter(
      (f) => !selected.has(f),
    );

    expect(missing).toEqual([]);
  });

  it("selects every field of FormSettings", () => {
    const selected = selectedUnder(FORM_BY_ID_QUERY, "settings");
    const missing = outputFields("FormSettings").filter(
      (f) => !selected.has(f),
    );

    expect(missing).toEqual([]);
  });
});
