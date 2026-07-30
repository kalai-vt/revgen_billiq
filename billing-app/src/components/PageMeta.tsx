import { useEffect } from 'react';

interface PageMetaProps {
  title: string;
  description: string;
}

/**
 * Sets the document `<title>` and meta description for a page. This app is on React 18, which
 * does NOT hoist `<title>`/`<meta>` tags rendered in the component tree into `<head>` (that's a
 * React 19 feature) — so this sets them imperatively via an effect instead. Intended for the
 * app's handful of genuinely public routes (pricing, legal pages, login/register) where a real
 * page title and description matter for search results and social previews.
 */
export function PageMeta({ title, description }: PageMetaProps) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = meta?.getAttribute('content') ?? null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', description);

    return () => {
      document.title = previousTitle;
      if (meta && previousDescription !== null) {
        meta.setAttribute('content', previousDescription);
      }
    };
  }, [title, description]);

  return null;
}
