export function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('att_token') ?? '';
}

export function clientFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  return fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.headers as Record<string, string> ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}
