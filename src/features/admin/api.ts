export async function adminApi<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  if (response.status === 401) window.location.replace("/admin/login");
  const body = await response.json() as T & { message?: string };
  if (!response.ok) throw new Error(body.message ?? "Falha na solicitação");
  return body;
}
