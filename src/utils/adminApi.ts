/**
 * Thin fetch wrapper for the admin panel — JSON in, JSON out, throws on
 * non-2xx with the server's `error` message. Shared by /settings and the
 * template builder.
 */
export async function adminApi(path: string, options?: RequestInit) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Request failed");
  return data;
}
