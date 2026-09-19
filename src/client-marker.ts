import { AsyncLocalStorage } from "node:async_hooks";

export const CLIENT_HEADER = "x-cmssy-client";
export const TOOL_HEADER = "x-cmssy-mcp-tool";
export const CLIENT_NAME = "mcp-server";

interface ToolCall {
  tool: string;
  announced: boolean;
}

const calls = new AsyncLocalStorage<ToolCall>();

export function runAsTool<T>(tool: string, run: () => Promise<T>): Promise<T> {
  return calls.run({ tool, announced: false }, run);
}

export function clientHeaders(version: string): Record<string, string> {
  const headers: Record<string, string> = {
    [CLIENT_HEADER]: `${CLIENT_NAME}/${version}`,
  };
  const call = calls.getStore();
  if (call && !call.announced) {
    call.announced = true;
    headers[TOOL_HEADER] = call.tool;
  }
  return headers;
}
