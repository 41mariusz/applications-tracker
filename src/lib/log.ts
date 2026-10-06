// Side-effecting wrapper around the pure error-line formatter: one JSON line per failure, at error level,
// so Workers Logs and Issues pick it up. Imports `cloudflare:workers`, so nothing Vitest runs may import it.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { formatErrorLine } from "@/lib/domain/error-log";

export interface LogErrorExtra {
  op?: string;
  status?: number;
  step?: string;
  entityId?: string;
}

function releaseVersion(): string {
  try {
    return env.CF_VERSION_METADATA?.id ?? "dev";
  } catch {
    return "dev";
  }
}

export function logError(context: APIContext, error: unknown, extra: LogErrorExtra = {}): void {
  const line = formatErrorLine({
    ...extra,
    route: context.routePattern,
    method: context.request.method,
    path: context.url.pathname,
    userId: context.locals.user?.id ?? null,
    version: releaseVersion(),
    error,
  });
  // eslint-disable-next-line no-console -- the structured error line Workers Logs and Issues read
  console.error(JSON.stringify(line));
  context.locals.errorLogged = true;
}
