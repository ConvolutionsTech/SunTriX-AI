import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** Admin pages and clients' capability links must never be indexed (robots.txt also disallows them). */
export const PRIVATE_PATHS = /^\/(admin|proposal|contract|invoice|track|client|payment)(\/|$)/;

export function RobotsGuard() {
  const { pathname } = useLocation();
  useEffect(() => {
    let tag = document.querySelector<HTMLMetaElement>('meta[name="robots"][data-guard]');
    if (PRIVATE_PATHS.test(pathname)) {
      if (!tag) {
        tag = document.createElement("meta");
        tag.name = "robots";
        tag.dataset.guard = "true";
        document.head.appendChild(tag);
      }
      tag.content = "noindex, nofollow";
    } else {
      tag?.remove();
    }
  }, [pathname]);
  return null;
}
