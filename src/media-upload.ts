import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { MediaUploadInput } from "@cmssy/ai-tools";

// Client-side mirror of the backend cap (apps/backend/src/lib/media-mime-types.ts)
// so oversize sources fail with a friendly error before any network call.
export const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;
export const MAX_UPLOAD_SIZE_MB = MAX_UPLOAD_SIZE / (1024 * 1024);

const MIME_BY_EXTENSION: Record<string, string> = {
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  ico: "image/x-icon",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function mimeFromFilename(filename: string): string | undefined {
  const extension = filename.split(".").pop()?.toLowerCase();
  return extension ? MIME_BY_EXTENSION[extension] : undefined;
}

export function mediaTypeFromMime(
  mimeType: string,
): "image" | "video" | "audio" | "document" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}

export interface ResolvedUpload {
  bytes: Buffer;
  filename: string;
  mimeType: string;
}

function assertSize(bytes: Buffer, source: string): void {
  if (bytes.byteLength === 0) {
    throw new Error(`${source} is empty`);
  }
  if (bytes.byteLength > MAX_UPLOAD_SIZE) {
    throw new Error(
      `${source} is ${Math.round(bytes.byteLength / (1024 * 1024))}MB - the upload limit is ${MAX_UPLOAD_SIZE_MB}MB`,
    );
  }
}

async function resolveFromFile(
  filePath: string,
  filenameOverride?: string,
): Promise<ResolvedUpload> {
  let bytes: Buffer;
  try {
    bytes = await readFile(filePath);
  } catch (err) {
    throw new Error(
      `Cannot read file "${filePath}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  assertSize(bytes, `File "${filePath}"`);
  const filename = filenameOverride ?? basename(filePath);
  const mimeType = mimeFromFilename(filename);
  if (!mimeType) {
    throw new Error(
      `Cannot infer a mime type for "${filename}" - pass a filename with a known extension`,
    );
  }
  return { bytes, filename, mimeType };
}

async function resolveFromUrl(
  url: string,
  filenameOverride?: string,
): Promise<ResolvedUpload> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetching "${url}" failed with HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  assertSize(bytes, `Content of "${url}"`);
  const filename =
    filenameOverride || basename(new URL(url).pathname) || "download";
  const headerMime = response.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim();
  const mimeType =
    headerMime && headerMime !== "application/octet-stream"
      ? headerMime
      : mimeFromFilename(filename);
  if (!mimeType) {
    throw new Error(
      `Cannot determine the mime type of "${url}" - pass a filename with a known extension`,
    );
  }
  return { bytes, filename, mimeType };
}

export async function resolveUploadSource(
  input: MediaUploadInput,
): Promise<ResolvedUpload> {
  if (input.filePath) {
    return resolveFromFile(input.filePath, input.filename);
  }
  if (input.url) {
    return resolveFromUrl(input.url, input.filename);
  }
  throw new Error("Provide exactly one of filePath or url");
}
