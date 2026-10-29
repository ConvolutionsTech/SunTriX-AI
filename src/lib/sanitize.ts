import DOMPurify from "dompurify";

/**
 * Sanitises rich text (blog posts) before it is rendered as HTML.
 * Scripts, event handlers, styles and non-http(s)/mailto links are removed.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/(?!\/)|#)/i,
    FORBID_TAGS: ["style", "iframe", "script", "form", "input", "object", "embed"],
    FORBID_ATTR: ["style"],
    ADD_ATTR: ["target", "rel"],
  });
}

/**
 * Href for a URL that came from data (CMS, uploads, user input). Returns
 * undefined unless it is http(s), mailto:, tel: or a same-site path, so a
 * `javascript:` URL can never become a clickable link.
 */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  return /^(?:https?:\/\/|mailto:|tel:|\/(?!\/))/i.test(trimmed) ? trimmed : undefined;
}
