import { useEffect, useState } from "react";

// Hash routes, so the same built files work in the cloud and on the onsite
// box with no server-side routing rules.
export type Route =
  | { name: "events" }
  | { name: "eventNew" }
  | { name: "event"; id: string }
  | { name: "inventory" }
  | { name: "itemNew" }
  | { name: "item"; id: string }
  | { name: "locations" }
  | { name: "movements" }
  | { name: "movementNew"; itemId?: string }
  | { name: "members" }
  | { name: "account" };

export function parseRoute(hash: string): Route {
  const [path = "", query = ""] = hash.replace(/^#\/?/, "").split("?");
  const parts = path.split("/").filter(Boolean);
  const params = new URLSearchParams(query);
  switch (parts[0]) {
    case "events":
      if (parts[1] === "new") return { name: "eventNew" };
      if (parts[1]) return { name: "event", id: parts[1] };
      return { name: "events" };
    case "inventory":
      if (parts[1] === "new") return { name: "itemNew" };
      if (parts[1]) return { name: "item", id: parts[1] };
      return { name: "inventory" };
    case "locations":
      return { name: "locations" };
    case "movements":
      if (parts[1] === "new") return { name: "movementNew", itemId: params.get("item") ?? undefined };
      return { name: "movements" };
    case "members":
      return { name: "members" };
    case "account":
      return { name: "account" };
    default:
      return { name: "events" };
  }
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
