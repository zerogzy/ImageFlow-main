export function getFullUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  if (typeof window !== "undefined") {
    return new URL(url, window.location.origin).toString();
  }
  return url.startsWith("/") ? url : `/${url}`;
}
