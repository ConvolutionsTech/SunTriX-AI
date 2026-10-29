import { useEffect } from "react";

interface SEOMeta {
  title: string;
  description: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  canonicalUrl?: string;
  noIndex?: boolean;
}

/**
 * useSEO — sets document <head> meta tags for SEO.
 * Call at the top of any public page component.
 */
export function useSEO(meta: SEOMeta) {
  useEffect(() => {
    // Title
    document.title = meta.title;

    // Helper to upsert a <meta> tag
    const setMeta = (selector: string, attr: string, value: string) => {
      if (!value) return;
      let el = document.querySelector<HTMLMetaElement>(selector);
      if (!el) {
        el = document.createElement("meta");
        document.head.appendChild(el);
      }
      (el as any)[attr] = value;
      el.content = value;
    };

    const setMetaName = (name: string, content: string) => {
      if (!content) return;
      let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.name = name;
        document.head.appendChild(el);
      }
      el.content = content;
    };

    const setMetaProperty = (property: string, content: string) => {
      if (!content) return;
      let el = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("property", property);
        document.head.appendChild(el);
      }
      el.content = content;
    };

    const setCanonical = (url: string) => {
      if (!url) return;
      let el = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!el) {
        el = document.createElement("link");
        el.rel = "canonical";
        document.head.appendChild(el);
      }
      el.href = url;
    };

    // Core meta
    setMetaName("description", meta.description);
    if (meta.keywords) setMetaName("keywords", meta.keywords);
    // Page-level noindex lives in its own tag so it can be removed when the page unmounts
    let noIndexTag: HTMLMetaElement | null = null;
    if (meta.noIndex) {
      noIndexTag = document.createElement("meta");
      noIndexTag.name = "robots";
      noIndexTag.content = "noindex, nofollow";
      document.head.appendChild(noIndexTag);
    }

    // Open Graph
    setMetaProperty("og:title", meta.ogTitle || meta.title);
    setMetaProperty("og:description", meta.ogDescription || meta.description);
    if (meta.ogImage) setMetaProperty("og:image", meta.ogImage);
    setMetaProperty("og:type", "website");

    // Twitter
    setMetaName("twitter:card", "summary_large_image");
    setMetaName("twitter:title", meta.ogTitle || meta.title);
    setMetaName("twitter:description", meta.ogDescription || meta.description);
    if (meta.ogImage) setMetaName("twitter:image", meta.ogImage);

    // Canonical
    if (meta.canonicalUrl) setCanonical(meta.canonicalUrl);
    else setCanonical(window.location.href);

    // Cleanup on unmount (reset to defaults)
    return () => {
      noIndexTag?.remove();
      document.title = "SunTriX — AI Solutions";
    };
  }, [meta.title, meta.description, meta.ogImage, meta.canonicalUrl, meta.noIndex]);
}

export default useSEO;
