import { getApiKey } from "./auth";

interface RequestOptions extends RequestInit {
  params?: Record<string, string>;
}

export async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const apiKey = getApiKey();

  const { params, ...restOptions } = options;

  const url = new URL(endpoint, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, value);
    }
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    ...options.headers,
  };

  const response = await fetch(url.toString(), {
    ...restOptions,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "请求失败");
  }

  return response.json();
}

export const api = {
  request,
  get: <T>(endpoint: string, params?: Record<string, string>) =>
    request<T>(endpoint, { method: "GET", params }),

  post: <T>(endpoint: string, data?: any) =>
    request<T>(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }),

  delete: <T>(endpoint: string) => request<T>(endpoint, { method: "DELETE" }),

  upload: <T>(endpoint: string, files: File[]) => {
    const formData = new FormData();
    for (const file of files) {
      formData.append("images[]", file);
    }
    return request<T>(endpoint, {
      method: "POST",
      body: formData,
    });
  },
};
