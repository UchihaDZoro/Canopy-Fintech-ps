"use client";
import { useEffect, useRef, useState } from "react";

const memo = new Map<string, Promise<unknown>>();

export function fetchJson<T>(url: string, body?: unknown, { cache = true } = {}): Promise<T> {
  const key = url + (body ? JSON.stringify(body) : "");
  if (cache && memo.has(key)) return memo.get(key) as Promise<T>;
  const p = fetch(url, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined).then(
    async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ? JSON.stringify(j.error) : `HTTP ${r.status}`);
      return j as T;
    }
  );
  if (cache) {
    memo.set(key, p);
    p.catch(() => memo.delete(key));
  }
  return p;
}

export function useApi<T>(url: string | null, body?: unknown, opts: { refreshMs?: number; debounceMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const bodyKey = body === undefined ? "" : JSON.stringify(body);
  const seq = useRef(0);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    const run = (useCache: boolean) => {
      const my = ++seq.current;
      setLoading(true);
      fetchJson<T>(url, bodyKey ? JSON.parse(bodyKey) : undefined, { cache: useCache })
        .then((d) => {
          if (alive && my === seq.current) {
            setData(d);
            setError(null);
          }
        })
        .catch((e) => alive && my === seq.current && setError(String(e.message ?? e)))
        .finally(() => alive && my === seq.current && setLoading(false));
    };
    const t = setTimeout(() => run(true), opts.debounceMs ?? 0);
    const iv = opts.refreshMs ? setInterval(() => run(false), opts.refreshMs) : null;
    return () => {
      alive = false;
      clearTimeout(t);
      if (iv) clearInterval(iv);
    };
  }, [url, bodyKey, opts.refreshMs, opts.debounceMs]);

  return { data, error, loading };
}
