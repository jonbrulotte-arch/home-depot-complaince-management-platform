/** JSON fetch for client components; throws the API's error message on failure. */
export async function apiFetch<T = unknown>(url: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? (init.body || init.form ? "POST" : "GET"),
    headers: init.form ? undefined : { "Content-Type": "application/json" },
    body: init.form ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}
