import { redirect } from "@tanstack/react-router";

const CORPORATE_LOGIN = "https://spearyx.com/login";
const JOBS_ORIGIN = "https://jobs.spearyx.com";

type RedirectLocation = {
  href?: string;
  pathname?: string;
  search?: string | Record<string, unknown>;
  searchStr?: string;
  hash?: string;
};

function buildJobsUrl(location: RedirectLocation): string {
  const path =
    typeof location.href === "string" && location.href.startsWith("/")
      ? location.href
      : (() => {
          const pathname = location.pathname || "/";
          const search =
            typeof location.searchStr === "string"
              ? location.searchStr
              : typeof location.search === "string"
                ? location.search
                : "";
          const hash = typeof location.hash === "string" ? location.hash : "";
          return `${pathname}${search}${hash}`;
        })();
  return `${JOBS_ORIGIN}${path}`;
}

export function requireLoginRedirect(location: RedirectLocation, feature: string) {
  const params = new URLSearchParams({
    redirect: buildJobsUrl(location),
    reason: `Sign in to use ${feature}.`,
  });
  throw redirect({
    href: `${CORPORATE_LOGIN}?${params.toString()}`,
    reloadDocument: true,
  });
}
