const FALLBACK_API_PORT = "4000";

declare global {
  interface Window {
    __SEERE_YAANA_RUNTIME_CONFIG__?: {
      apiUrl?: string;
    };
  }
}

function getRuntimeApiUrl() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.__SEERE_YAANA_RUNTIME_CONFIG__?.apiUrl;
}

function buildBrowserFallbackUrl() {
  if (typeof window === "undefined") {
    return `http://localhost:${FALLBACK_API_PORT}`;
  }

  return `${window.location.protocol}//${window.location.hostname}:${FALLBACK_API_PORT}`;
}

function isRazorpayHost(hostname: string) {
  return hostname === "razorpay.com" || hostname.endsWith(".razorpay.com");
}

export function getPublicApiUrl() {
  const configured = getRuntimeApiUrl() ?? process.env.NEXT_PUBLIC_API_URL;

  if (typeof window === "undefined") {
    if (!configured) {
      return `http://localhost:${FALLBACK_API_PORT}`;
    }

    try {
      const url = new URL(configured);
      if (isRazorpayHost(url.hostname)) {
        return `http://localhost:${FALLBACK_API_PORT}`;
      }
      return url.toString().replace(/\/$/, "");
    } catch {
      if (configured.includes("razorpay.com")) {
        return `http://localhost:${FALLBACK_API_PORT}`;
      }
      return configured;
    }
  }

  if (!configured) {
    return buildBrowserFallbackUrl();
  }

  try {
    const url = new URL(configured);
    if (isRazorpayHost(url.hostname)) {
      return buildBrowserFallbackUrl();
    }

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
    if (configured.includes("razorpay.com")) {
      return buildBrowserFallbackUrl();
    }
    return configured;
  }
}
