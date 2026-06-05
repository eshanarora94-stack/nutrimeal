/**
 * lib/fetcher.ts
 *
 * SWR-compatible JSON fetcher. Throws on non-ok responses so SWR
 * puts the error into the `error` field rather than silently ignoring it.
 */
export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(text);
  }
  return res.json() as Promise<T>;
}
