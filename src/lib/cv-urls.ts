// The one place that knows the CV route paths. Ids are encoded (a no-op for uuids).

// GET /api/cv/[id]: the file inline, or as an attachment with `download`.
export function cvFileUrl(id: string, options: { download?: boolean } = {}): string {
  const url = `/api/cv/${encodeURIComponent(id)}`;
  return options.download ? `${url}?download=1` : url;
}

// POST /api/applications/[id]/cv: attach (or detach) a CV.
export function applicationCvUrl(applicationId: string): string {
  return `/api/applications/${encodeURIComponent(applicationId)}/cv`;
}
