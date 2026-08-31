import { AsyncLocalStorage } from "node:async_hooks";

export type OfficialAnalysisContext = {
  riskFreeRate?: number | null;
  riskFreeSource?: string | null;
  riskFreeAsOf?: string | null;
};

const storage = new AsyncLocalStorage<OfficialAnalysisContext>();

export function runWithOfficialAnalysisContext<T>(
  context: OfficialAnalysisContext,
  callback: () => Promise<T>,
): Promise<T> {
  return storage.run(context, callback);
}

export function getOfficialAnalysisContext(): OfficialAnalysisContext | null {
  return storage.getStore() ?? null;
}
