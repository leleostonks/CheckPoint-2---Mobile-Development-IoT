import Module, { createRequire } from 'node:module';

type Loader = (request: string, parent: unknown, isMain?: boolean) => unknown;

/** Substitui somente fronteiras externas durante o carregamento do módulo real. */
export function loadWithMocks<T>(filename: string, mocks: Readonly<Record<string, unknown>>): T {
  const internals = Module as unknown as { _load: Loader };
  const original = internals._load;
  const requireModule = createRequire(__filename);
  internals._load = function (request, parent, isMain) {
    const replacement = Object.entries(mocks).find(([suffix]) => request === suffix || request.endsWith(suffix));
    return replacement ? replacement[1] : original.call(this, request, parent, isMain);
  };
  try {
    const resolved = requireModule.resolve(filename);
    delete requireModule.cache[resolved];
    return requireModule(filename) as T;
  } finally { internals._load = original; }
}
