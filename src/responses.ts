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
    "Response shape. 'minimal' (default) returns a small ack (~200 bytes). 'full' returns the full pre-0.6 mutation response.",
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
  // `published` is only emitted when the caller explicitly requests it —
  // i.e. publish_page / unpublish_page. Other mutations (savePage etc.)
  // may echo `published` as part of their selection set, but including it
  // in the minimal ack would make the shape depend on which mutation
  // served the request. Keeping it opt-in keeps the minimal schema stable.
  if (extras?.published !== undefined) out.published = extras.published;
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
// `JSON.stringify(mode === "full" ? data : minimal(data), ...)`.
// Minimal mode emits compact JSON - the whole point is keeping the ack
// small, and pretty-print whitespace was eating ~25-40% of the payload.
// Full mode keeps pretty-print for human-readable debugging.
export function jsonText<T>(
  mode: ResponseMode,
  full: T,
  toMinimal: (full: T) => unknown,
): { content: Array<{ type: "text"; text: string }> } {
  const text =
    mode === "full"
      ? JSON.stringify(full, null, 2)
      : JSON.stringify(toMinimal(full));
  return {
    content: [{ type: "text" as const, text }],
  };
}
