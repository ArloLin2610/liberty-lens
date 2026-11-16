import { useEffect, useState } from 'react';

/** URL of a file under the site's data folder; relative, so the site works from any path (GitHub Pages serves it under /liberty-lens/). */
export const dataUrl = (name: string): string => `${import.meta.env.BASE_URL}data/${name}`;

export interface Loaded<T> { data: T | null; error: string | null }

/** Fetch a static JSON file once per URL. */
export function useJson<T>(url: string | null): Loaded<T> {
  const [state, setState] = useState<Loaded<T> & { url: string | null }>({ data: null, error: null, url });
  useEffect(() => {
    if (!url) return;
    let alive = true;
    setState({ data: null, error: null, url });
    fetch(url, { cache: 'no-cache' })
      .then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json() as Promise<T>; })
      .then((data) => { if (alive) setState({ data, error: null, url }); })
      .catch((error: unknown) => { if (alive) setState({ data: null, error: error instanceof Error ? error.message : String(error), url }); });
    return () => { alive = false; };
  }, [url]);
  return state.url === url ? state : { data: null, error: null };
}
