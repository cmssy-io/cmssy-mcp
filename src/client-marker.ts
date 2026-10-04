import { AsyncLocalStorage } from "node:async_hooks";

export const CLIENT_HEADER = "x-cmssy-client";
export const TOOL_HEADER = "x-cmssy-mcp-tool";
export const CALL_START_HEADER = "x-cmssy-mcp-call-start";
export const CLIENT_NAME = "mcp-server";

interface ToolCall {
  tool: string;
  started: boolean;
}

const calls = new AsyncLocalStorage<ToolCall>();

export function runAsTool<T>(tool: string, run: () => Promise<T>): Promise<T> {
  return calls.run({ tool, started: false }, run);
}

export function clientHeaders(version: string): Record<string, string> {
  const headers: Record<string, string> = {
    [CLIENT_HEADER]: `${CLIENT_NAME}/${version}`,
  };
  const call = calls.getStore();
  if (call) {
    headers[TOOL_HEADER] = call.tool;
    headers[CALL_START_HEADER] = call.started ? "0" : "1";
    call.started = true;
  }
  return headers;
}
