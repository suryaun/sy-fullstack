import NextAuth from "next-auth";
import type { DefaultSession } from "next-auth";
import type { Provider } from "next-auth/providers";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import Facebook from "next-auth/providers/facebook";
import Google from "next-auth/providers/google";

function env(name: string) {
  return process.env[name];
}

const internalApiUrl = env("API_INTERNAL_URL") ?? env("NEXT_PUBLIC_API_URL") ?? "http://localhost:4000";
const configuredAuthUrl = env("AUTH_URL") ?? env("NEXTAUTH_URL");

function hasRealValue(value: string | undefined, placeholder: string) {
  return Boolean(value && value !== placeholder);
}

const providers: Provider[] = [
  Credentials({
    id: "mobile-otp",
    name: "Mobile OTP",
    credentials: {
      mobile: { label: "Mobile", type: "text" },
      otp: { label: "OTP", type: "text" },
      name: { label: "Name", type: "text" },
      email: { label: "Email", type: "email" }
    },
    async authorize(credentials) {
      const response = await fetch(`${internalApiUrl}/api/auth/mobile/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mobile: credentials?.mobile,
          otp: credentials?.otp,
          name: credentials?.name,
          email: credentials?.email
        })
      });

      if (!response.ok) {
        return null;
      }

      const result = await response.json();
      const user = result.user as {
        id: string;
        mobile: string;
        name: string | null;
        email: string | null;
        profileComplete: boolean;
      };

      return {
        id: user.id,
        name: user.name ?? "Seere Yaana Shopper",
        email: user.email,
        mobile: user.mobile,
        profileComplete: user.profileComplete
      };
    }
  })
];

const googleClientId = env("GOOGLE_CLIENT_ID");
const googleClientSecret = env("GOOGLE_CLIENT_SECRET");
const facebookClientId = env("FACEBOOK_CLIENT_ID");
const facebookClientSecret = env("FACEBOOK_CLIENT_SECRET");
const appleClientId = env("AUTH_APPLE_ID");
const appleClientSecret = env("AUTH_APPLE_SECRET");

if (hasRealValue(googleClientId, "replace-with-google-client-id") && hasRealValue(googleClientSecret, "replace-with-google-client-secret")) {
  providers.push(
    Google({
      clientId: googleClientId,
      clientSecret: googleClientSecret
    })
  );
}

if (hasRealValue(facebookClientId, "replace-with-facebook-app-id") && hasRealValue(facebookClientSecret, "replace-with-facebook-app-secret")) {
  providers.push(
    Facebook({
      clientId: facebookClientId,
      clientSecret: facebookClientSecret
    })
  );
}

if (hasRealValue(appleClientId, "replace-with-apple-services-id") && hasRealValue(appleClientSecret, "replace-with-apple-client-secret")) {
  providers.push(
    Apple({
      clientId: appleClientId,
      clientSecret: appleClientSecret
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login"
  },
  providers,
  callbacks: {
    async redirect({ url, baseUrl }) {
      const resolvedBaseUrl = (() => {
        try {
          const runtimeBase = new URL(baseUrl);
          if (!configuredAuthUrl) {
            return runtimeBase;
          }

          const configuredBase = new URL(configuredAuthUrl);
          const runtimeIsLocal =
            runtimeBase.hostname === "localhost" || runtimeBase.hostname === "127.0.0.1";
          const configuredIsLocal =
            configuredBase.hostname === "localhost" || configuredBase.hostname === "127.0.0.1";

          return runtimeIsLocal && !configuredIsLocal
            ? configuredBase
            : runtimeBase;
        } catch {
          return new URL(baseUrl);
        }
      })();

      if (url.startsWith("/")) {
        return `${resolvedBaseUrl.origin}${url}`;
      }

      try {
        const targetUrl = new URL(url);
        if (targetUrl.origin === resolvedBaseUrl.origin) {
          return targetUrl.toString();
        }

        const targetIsLocal =
          targetUrl.hostname === "localhost" || targetUrl.hostname === "127.0.0.1";
        const baseIsLocal =
          resolvedBaseUrl.hostname === "localhost" || resolvedBaseUrl.hostname === "127.0.0.1";

        if (targetIsLocal && !baseIsLocal) {
          return `${resolvedBaseUrl.origin}${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
        }
      } catch {
        // Fall through to safe base URL.
      }

      return resolvedBaseUrl.toString();
    },
    async jwt({ token, account, user }) {
      if (account?.provider) {
        (token as { provider?: string }).provider = account.provider;
      }
      if (user?.id) {
        (token as { userId?: string }).userId = user.id;
      }
      if (typeof (user as { mobile?: string } | undefined)?.mobile === "string") {
        (token as { mobile?: string }).mobile = (user as { mobile: string }).mobile;
      }
      if (typeof (user as { profileComplete?: boolean } | undefined)?.profileComplete === "boolean") {
        (token as { profileComplete?: boolean }).profileComplete = (user as { profileComplete: boolean }).profileComplete;
      }
      return token;
    },
    async session({ session, token }) {
      const provider = (token as { provider?: string }).provider;
      const userId = (token as { userId?: string }).userId;
      const mobile = (token as { mobile?: string }).mobile;
      const profileComplete = (token as { profileComplete?: boolean }).profileComplete;

      if (session.user) {
        session.user.name = session.user.name ?? "Seere Yaana Shopper";
        if (userId) {
          session.user.id = userId;
        }
        if (mobile) {
          session.user.mobile = mobile;
        }
        session.user.profileComplete = Boolean(profileComplete);
      }
      if (provider) {
        session.provider = String(provider);
      }
      return session;
    }
  }
});

declare module "next-auth" {
  interface User {
    mobile?: string;
    profileComplete?: boolean;
  }

  interface Session {
    provider?: string;
    user: {
      id?: string;
      mobile?: string;
      profileComplete?: boolean;
    } & DefaultSession["user"];
  }
}
