/**
 * useHydratedHtml — bake image srcs into an HTML string before it's rendered.
 *
 * B2 images live in the content-addressed store (data-img-id), not in the HTML.
 * The old approach set <img>.src on the DOM AFTER render, which was fragile: any
 * re-render that re-injected the HTML (hover/magnifier, the export modal's
 * PageFrame) wiped the src and left an empty frame. This hook instead resolves
 * the objectURLs (async, once) and returns the HTML with `src="…"` substituted
 * INTO the string, so the src survives every re-render by construction.
 */
import { useEffect, useState } from 'react';
import { resolveImageSrc, hydrateImageSrcs, cachedImageSrc } from '../utils/imageStore';

/**
 * @param {string} html
 * @returns {string} the html with data-img-id images given a resolved src
 */
export function useHydratedHtml(html) {
  const [, force] = useState(0);

  useEffect(() => {
    if (!html || html.indexOf('data-img-id') === -1) return;
    let cancelled = false;
    const ids = new Set();
    for (const m of html.matchAll(/data-img-id="([^"]+)"/gi)) {
      if (!cachedImageSrc(m[1])) ids.add(m[1]);
    }
    if (ids.size === 0) return;
    // Resolve any not-yet-cached ids, then re-render so the sync hydrate below
    // picks up the newly cached URLs.
    Promise.all([...ids].map((id) => resolveImageSrc(id))).then(() => {
      if (!cancelled) force((n) => n + 1);
    });
    return () => { cancelled = true; };
  }, [html]);

  // Synchronous substitution from the cache — safe on every render.
  return hydrateImageSrcs(html, cachedImageSrc);
}
