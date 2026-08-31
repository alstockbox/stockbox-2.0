export type OfficialAnalysisContext = {
  riskFreeRate?: number | null;
  riskFreeSource?: string | null;
  riskFreeAsOf?: string | null;
};

type AsyncContextStore = {
  run<T>(context: OfficialAnalysisContext, callback: () => Promise<T>): Promise<T>;
  getStore(): OfficialAnalysisContext | undefined;
};

type AsyncLocalStorageConstructor = new () => AsyncContextStore;

let storage: AsyncContextStore | null | undefined;

function getStorage(): AsyncContextStore | null {
  if (storage !== undefined) return storage;
  if (typeof process === "undefined") {
    storage = null;
    return storage;
  }

  // Avoid a static node:async_hooks import here. DCF helpers are re-exported from the shared
  // analysis barrel and can therefore be referenced by client bundles. Node's runtime loader
  // gives server requests a real AsyncLocalStorage without making Turbopack externalize the
  // built-in into browser chunks.
  const nodeProcess = process as NodeJS.Process & {
    getBuiltinModule?: (id: string) => { AsyncLocalStorage?: AsyncLocalStorageConstructor } | undefined;
  };
  const AsyncLocalStorage = nodeProcess.getBuiltinModule?.("node:async_hooks")?.AsyncLocalStorage;
  storage = AsyncLocalStorage ? new AsyncLocalStorage() : null;
  return storage;
}

export function runWithOfficialAnalysisContext<T>(
  context: OfficialAnalysisContext,
  callback: () => Promise<T>,
): Promise<T> {
  const contextStorage = getStorage();
  return contextStorage ? contextStorage.run(context, callback) : callback();
}

export function getOfficialAnalysisContext(): OfficialAnalysisContext | null {
  return getStorage()?.getStore() ?? null;
}
