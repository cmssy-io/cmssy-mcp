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
import { SITE_CONFIG_QUERY } from "../queries.js";

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

function shapeKeys(shape: z.ZodRawShape): string[] {
  return Object.keys(shape).sort();
}

type ZodLike = {
  shape?: z.ZodRawShape;
  _def?: { innerType?: ZodLike; element?: ZodLike; type?: ZodLike };
};

function unwrapArrayItem(field: unknown): z.ZodObject<z.ZodRawShape> {
  let current = field as unknown as ZodLike;
  while (!current.shape) {
    const next =
      current._def?.innerType ?? current._def?.element ?? current._def?.type;
    if (!next) throw new Error("not an object array");
    current = next;
  }
  return current as unknown as z.ZodObject<z.ZodRawShape>;
}

const tool = AI_TOOLS.find((t) => t.name === "update_cart_config");
if (!tool) throw new Error("update_cart_config is not in the registry");
const toolShape = (tool.inputSchema as z.ZodObject<z.ZodRawShape>).shape;

describe("update_cart_config mirrors CartConfigInput (CMS-1908)", () => {
  it("accepts every field the backend input accepts, and nothing else", () => {
    expect(shapeKeys(toolShape)).toEqual(inputFields("CartConfigInput"));
  });

  it("describes a shipping method with the backend's own fields", () => {
    const shipping = unwrapArrayItem(toolShape.shippingMethods!);

    expect(shapeKeys(shipping.shape)).toEqual(
      inputFields("ShippingMethodInput"),
    );
  });

  it("describes a tax rate with the backend's own fields", () => {
    const tax = unwrapArrayItem(toolShape.taxRates!);

    expect(shapeKeys(tax.shape)).toEqual(inputFields("TaxRateInput"));
  });

  it("describes a product source with the backend's own fields", () => {
    const source = unwrapArrayItem(toolShape.productSources!);

    expect(shapeKeys(source.shape)).toEqual(
      inputFields("CartProductSourceInput"),
    );
  });
});

function selectedUnder(parent: string): Set<string> {
  const names = new Set<string>();
  visit(parse(SITE_CONFIG_QUERY), {
    Field(node: FieldNode) {
      if (node.name.value !== parent) return;
      visit(node.selectionSet!, {
        Field(inner: FieldNode) {
          names.add(inner.name.value);
        },
      });
    },
  });
  return names;
}

describe("get_site_config reads back everything update_cart_config can set", () => {
  it("selects every field of CartConfig", () => {
    const selected = selectedUnder("cart");
    const missing = outputFields("CartConfig").filter((f) => !selected.has(f));

    expect(missing).toEqual([]);
  });

  it("selects every field of a stored shipping method", () => {
    const selected = selectedUnder("shippingMethods");
    const missing = outputFields("ShippingMethodConfig").filter(
      (f) => !selected.has(f),
    );

    expect(missing).toEqual([]);
  });
});
