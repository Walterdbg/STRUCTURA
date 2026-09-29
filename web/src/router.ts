import { useEffect, useState } from "react";

// Hash routes (#/events, #/events/new, #/events/<id>, #/members), so the
// same built files work in the cloud and on the onsite box with no
// server-side routing rules.
export type Route =
  | { name: "events" }
  | { name: "eventNew" }
  | { name: "event"; id: string }
  | { name: "members" };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "events" && parts[1] === "new") return { name: "eventNew" };
  if (parts[0] === "events" && parts[1]) return { name: "event", id: parts[1] };
  if (parts[0] === "members") return { name: "members" };
  return { name: "events" };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function go(path: string): void {
  location.hash = path;
}
