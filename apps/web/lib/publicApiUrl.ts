const FALLBACK_API_PORT = "4000";

export function getPublicApiUrl() {
  const configured = process.env.NEXT_PUBLIC_API_URL;

  if (typeof window === "undefined") {
    return configured ?? `http://localhost:${FALLBACK_API_PORT}`;
  }

  if (!configured) {
    return `${window.location.protocol}//${window.location.hostname}:${FALLBACK_API_PORT}`;
  }

  try {
    const url = new URL(configured);
    const isLoopback =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1";

    if (isLoopback) {
      const browserHost = window.location.hostname;
      const browserIsLoopback =
        browserHost === "localhost" ||
        browserHost === "127.0.0.1" ||
        browserHost === "::1";

      if (!browserIsLoopback) {
        url.hostname = browserHost;
      }
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    return configured;
  }
}
