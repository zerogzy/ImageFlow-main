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

export function uploadWithProgress<T>(
  endpoint: string,
  files: File[],
  onProgress?: (percent: number) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const apiKey = getApiKey();
    const formData = new FormData();
    for (const file of files) {
      formData.append("images[]", file);
    }

    const url = new URL(endpoint, window.location.origin);
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("响应解析失败"));
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          reject(new Error(error.message || `上传失败 (${xhr.status})`));
        } catch {
          reject(new Error(`上传失败 (${xhr.status})`));
        }
      }
    };

    xhr.onerror = () => reject(new Error("网络错误，上传失败"));
    xhr.ontimeout = () => reject(new Error("上传超时"));
    xhr.onabort = () => reject(new Error("上传已取消"));

    xhr.open("POST", url.toString());
    xhr.setRequestHeader("Authorization", `Bearer ${apiKey}`);
    xhr.send(formData);
  });
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
