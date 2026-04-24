import { z } from "zod";

// `response: "minimal"` is the default starting in 0.6.0 to keep agent
// context windows from being eaten by echoed page/block content.
// Pass "full" only when the caller actually needs the post-write state
// inline; otherwise issue a follow-up read tool call.
export const responseModeSchema = z
  .enum(["minimal", "full"])
  .optional()
  .default("minimal")
  .describe(
    "Response shape. 'minimal' (default) returns a small ack (~200 bytes). 'full' returns the entire mutated resource (pre-0.6 behavior).",
  );

export type ResponseMode = "minimal" | "full";

interface PageLike {
  id: string;
  slug?: string | null;
  hasUnpublishedChanges?: boolean | null;
  updatedAt?: string | null;
  published?: boolean | null;
}

export interface PageMinimal {
  id: string;
  slug?: string;
  hasUnpublishedChanges?: boolean;
  updatedAt?: string;
  published?: boolean;
}

export function pageMinimal(
  page: PageLike,
  extras?: { published?: boolean },
): PageMinimal {
  const out: PageMinimal = { id: page.id };
  if (page.slug != null) out.slug = page.slug;
  if (page.hasUnpublishedChanges != null)
    out.hasUnpublishedChanges = page.hasUnpublishedChanges;
  if (page.updatedAt != null) out.updatedAt = page.updatedAt;
  // Caller-supplied `published` wins over whatever the mutation echoed —
  // matters for unpublish_page where the toggle result lags semantically.
  if (extras?.published !== undefined) out.published = extras.published;
  else if (page.published != null) out.published = page.published;
  return out;
}

export interface PageBlockMinimal {
  pageId: string;
  blockId: string;
  hasUnpublishedChanges?: boolean;
  updatedAt?: string;
}

export function pageBlockMinimal(
  page: PageLike,
  blockId: string,
): PageBlockMinimal {
  const out: PageBlockMinimal = { pageId: page.id, blockId };
  if (page.hasUnpublishedChanges != null)
    out.hasUnpublishedChanges = page.hasUnpublishedChanges;
  if (page.updatedAt != null) out.updatedAt = page.updatedAt;
  return out;
}

interface FormLike {
  id: string;
  slug?: string | null;
  status?: string | null;
  updatedAt?: string | null;
}

export interface FormMinimal {
  id: string;
  slug?: string;
  status?: string;
  updatedAt?: string;
}

export function formMinimal(form: FormLike): FormMinimal {
  const out: FormMinimal = { id: form.id };
  if (form.slug != null) out.slug = form.slug;
  if (form.status != null) out.status = form.status;
  if (form.updatedAt != null) out.updatedAt = form.updatedAt;
  return out;
}

interface ModelLike {
  id: string;
  slug?: string | null;
  updatedAt?: string | null;
}

export interface ModelMinimal {
  id: string;
  slug?: string;
  updatedAt?: string;
}

export function modelMinimal(model: ModelLike): ModelMinimal {
  const out: ModelMinimal = { id: model.id };
  if (model.slug != null) out.slug = model.slug;
  if (model.updatedAt != null) out.updatedAt = model.updatedAt;
  return out;
}

interface RecordLike {
  id: string;
  status?: string | null;
  updatedAt?: string | null;
}

export interface RecordMinimal {
  id: string;
  status?: string;
  updatedAt?: string;
}

export function recordMinimal(record: RecordLike): RecordMinimal {
  const out: RecordMinimal = { id: record.id };
  if (record.status != null) out.status = record.status;
  if (record.updatedAt != null) out.updatedAt = record.updatedAt;
  return out;
}

// Tiny wrapper so call sites stay one-liners instead of repeating
// `JSON.stringify(mode === "full" ? data : minimal(data), null, 2)`.
export function jsonText<T>(
  mode: ResponseMode,
  full: T,
  toMinimal: (full: T) => unknown,
): { content: Array<{ type: "text"; text: string }> } {
  const value = mode === "full" ? full : toMinimal(full);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}
