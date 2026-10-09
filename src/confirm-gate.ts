import { createHash, randomBytes } from "node:crypto";

export const CONFIRMATION_TTL_SECONDS = 600;
export const CONFIRM_ARG = "_confirm";
export const CONFIRM_REF_PATTERN = /^[0-9a-f]{8}$/;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return Object.fromEntries(entries.map(([k, v]) => [k, canonicalize(v)]));
  }
  return value;
}

export function confirmArgsHash(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(input)))
    .digest("hex");
}

export function confirmSummary(toolName: string, input: unknown): string {
  return `${toolName.split("_").join(" ")} ${JSON.stringify(canonicalize(input))}`;
}

export type ConsumeOutcome =
  "approved" | "unknown-ref" | "expired" | "args-changed";

interface PendingConfirmation {
  toolName: string;
  argsHash: string;
  expiresAt: number;
}

export class ConfirmGate {
  private pending = new Map<string, PendingConfirmation>();

  request(toolName: string, argsHash: string): string {
    const now = Date.now();
    for (const [ref, entry] of this.pending) {
      if (entry.expiresAt <= now) {
        this.pending.delete(ref);
        continue;
      }
      if (entry.toolName === toolName && entry.argsHash === argsHash) {
        return ref;
      }
    }
    const ref = randomBytes(4).toString("hex");
    this.pending.set(ref, {
      toolName,
      argsHash,
      expiresAt: now + CONFIRMATION_TTL_SECONDS * 1000,
    });
    return ref;
  }

  consume(ref: string, toolName: string, argsHash: string): ConsumeOutcome {
    const entry = this.pending.get(ref);
    if (!entry) return "unknown-ref";
    if (entry.expiresAt <= Date.now()) {
      this.pending.delete(ref);
      return "expired";
    }
    if (entry.toolName !== toolName || entry.argsHash !== argsHash) {
      return "args-changed";
    }
    this.pending.delete(ref);
    return "approved";
  }
}
