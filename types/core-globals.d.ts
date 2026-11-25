// SPEC-025 AC 9 (review): the globals the core may use for `npm run typecheck` (jsconfig.core.json: lib ES2022, no DOM) — only
// what Node and browsers share. The core never touches document, window, storage or navigator (SPEC-011 AC 3; ESLint's
// no-restricted-globals); without the DOM lib a use of them is also a type error. Nothing here ships or runs.
declare var console: {
  log(...data: any[]): void;
  info(...data: any[]): void;
  warn(...data: any[]): void;
  error(...data: any[]): void;
  debug(...data: any[]): void;
};
declare var performance: { now(): number };
declare function structuredClone<T>(value: T, options?: { transfer?: any[] }): T;
