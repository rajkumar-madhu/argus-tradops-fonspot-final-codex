import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';
const nodeRequire = createRequire(import.meta.url);

// Runs the real browser modules with isolated, synthetic browser/HTTP state.
// No real credentials, cookies, identity provider or trading data are involved.
export function browserModules({ fetch, rejectCookies = false, origin = 'https://ui.example.test', apiUrl = 'https://api.example.test', mocks = {} } = {}) {
  const root = new URL('../../', import.meta.url).pathname;
  const storage = new Map();
  const cookies = new Map();
  const document = {};
  Object.defineProperty(document, 'cookie', {
    get: () => [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
    set: value => {
      const [pair] = value.split(';');
      const i = pair.indexOf('=');
      const key = pair.slice(0, i);
      if (/Max-Age=0(?:;|$)/.test(value)) cookies.delete(key);
      else if (!rejectCookies && Buffer.byteLength(pair) <= 4096) cookies.set(key, pair.slice(i + 1));
    },
  });
  const location = { origin, protocol: new URL(origin).protocol, href: '', replace(url) { this.href = url; } };
  const sandbox = vm.createContext({
    document, window: { location }, fetch, console, URL, URLSearchParams,
    TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, AbortSignal, Response,
    atob, btoa, crypto: webcrypto, setTimeout, clearTimeout,
    process: { env: { NEXT_PUBLIC_API_URL: apiUrl } },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  });
  const modules = new Map();
  function load(name) {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith('@/') && !path.isAbsolute(name)) return nodeRequire(name);
    let filename = name.startsWith('@/') ? path.join(root, `${name.slice(2)}.ts`) : name;
    if (!fs.existsSync(filename) && filename.endsWith('.ts')) filename += 'x';
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const require = spec => load(spec.startsWith('.') ? path.resolve(path.dirname(filename), spec.replace(/\.ts$/, '') + '.ts') : spec);
    vm.runInContext(`(function(require,module,exports){${source}\n})`, sandbox)(require, module, module.exports);
    return module.exports;
  }
  return { load, storage, cookies, location, document };
}
