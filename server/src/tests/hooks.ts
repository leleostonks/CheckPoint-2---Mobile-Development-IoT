type Effect = { deps: readonly unknown[]; cleanup?: () => void };

/** Harness de efeitos/estado para executar hooks reais sem adicionar um renderer nativo. */
export class HookHarness {
  private cursor = 0;
  private slots: unknown[] = [];
  private pending: (() => void)[] = [];

  render<T>(action: () => T): T {
    this.cursor = 0;
    // O tsx do servidor usa JSX clássico; este objeto só pertence ao harness de testes.
    const globals = globalThis as unknown as { React?: { createElement: (type: unknown, props: unknown, ...children: unknown[]) => unknown } };
    const previous = globals.React;
    globals.React = { createElement: (type, props, ...children) => ({ type, props: { ...(typeof props === 'object' && props !== null ? props : {}), children } }) };
    try {
      const result = action();
      for (const effect of this.pending.splice(0)) effect();
      return result;
    } finally {
      if (previous) globals.React = previous;
      else delete globals.React;
    }
  }

  readonly react = {
    useState: <T>(initial: T): [T, (next: T | ((previous: T) => T)) => void] => {
      const index = this.cursor++;
      if (!(index in this.slots)) this.slots[index] = initial;
      return [this.slots[index] as T, (next) => {
        this.slots[index] = typeof next === 'function' ? (next as (previous: T) => T)(this.slots[index] as T) : next;
      }];
    },
    useRef: <T>(initial: T): { current: T } => {
      const index = this.cursor++;
      if (!(index in this.slots)) this.slots[index] = { current: initial };
      return this.slots[index] as { current: T };
    },
    useEffect: (effect: () => void | (() => void), deps: readonly unknown[]) => {
      const index = this.cursor++;
      const previous = this.slots[index] as Effect | undefined;
      if (!previous || deps.some((value, position) => !Object.is(value, previous.deps[position]))) {
        this.pending.push(() => {
          previous?.cleanup?.();
          this.slots[index] = { deps, cleanup: effect() };
        });
      }
    },
    useMemo: <T>(compute: () => T): T => compute(),
    useCallback: <T>(callback: T): T => callback,
    useContext: <T>(context: { value: T }): T => context.value,
    createContext: <T>(value: T) => ({ value, Provider: 'Provider' }),
  };
}

export const jsxRuntime = {
  jsx: (type: unknown, props: unknown) => ({ type, props }),
  jsxs: (type: unknown, props: unknown) => ({ type, props }),
};

export async function flushPromises(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}
