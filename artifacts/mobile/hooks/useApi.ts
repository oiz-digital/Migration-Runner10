import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
const SESSION_KEY = "zebvix_session";

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const session = await AsyncStorage.getItem(SESSION_KEY);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };
  if (session) headers["Cookie"] = `cx_session=${session}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` })) as { message?: string };
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiDelete<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: "DELETE" });
}
