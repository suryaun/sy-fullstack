"use client";

import { FormEvent, useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { getPublicApiUrl } from "@/lib/publicApiUrl";

type OtpResponse = {
  success: boolean;
  isRegistered: boolean;
  expiresInSeconds: number;
  devOtp?: string;
};

function normalizeClientRedirect(url: string | null | undefined) {
  if (!url) {
    return "/complete-profile";
  }

  if (url.startsWith("/")) {
    return url;
  }

  try {
    const parsed = new URL(url);
    const isLoopback =
      parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";

    if (isLoopback && typeof window !== "undefined") {
      parsed.hostname = window.location.hostname;
      parsed.protocol = window.location.protocol;
      parsed.port = window.location.port;
    }

    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return "/complete-profile";
  }
}

export default function MobileLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = useMemo(() => params.get("callbackUrl") || "/", [params]);

  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [isRegistered, setIsRegistered] = useState<boolean | null>(null);
  const [devOtp, setDevOtp] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const requestOtp = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage("");

    try {
      const apiUrl = getPublicApiUrl();
      const response = await fetch(`${apiUrl}/api/auth/mobile/request-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile }),
      });

      const data = (await response.json()) as OtpResponse;

      if (!response.ok || !data.success) {
        throw new Error("Unable to send OTP. Check the number and try again.");
      }

      setOtpSent(true);
      setIsRegistered(data.isRegistered);
      setDevOtp(data.devOtp ?? "");
      setMessage("OTP sent. Enter it below to continue.");
    } catch {
      setMessage("Unable to send OTP. Check the number and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const verifyAndSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage("");

    try {
      const result = await signIn("mobile-otp", {
        mobile,
        otp,
        name,
        email,
        redirect: false,
        callbackUrl: `/complete-profile?next=${encodeURIComponent(callbackUrl)}`,
      });

      if (result?.error) {
        throw new Error("OTP invalid or expired. Please request a new OTP.");
      }

      router.push(normalizeClientRedirect(result?.url));
      router.refresh();
    } catch {
      setMessage("OTP invalid or expired. Please request a new OTP.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <form
        className="space-y-3"
        onSubmit={otpSent ? verifyAndSignIn : requestOtp}
      >
        <input
          type="tel"
          inputMode="numeric"
          placeholder="Mobile number"
          value={mobile}
          onChange={(event) => setMobile(event.target.value)}
          className="w-full rounded-xl border border-[#d7c9b7] bg-white px-4 py-3 text-sm"
          required
        />

        {otpSent ? (
          <>
            <input
              type="text"
              inputMode="numeric"
              placeholder="6-digit OTP"
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              className="w-full rounded-xl border border-[#d7c9b7] bg-white px-4 py-3 text-sm"
              required
            />

            {isRegistered === false ? (
              <>
                <input
                  type="text"
                  placeholder="Full name (required for first sign-in)"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full rounded-xl border border-[#d7c9b7] bg-white px-4 py-3 text-sm"
                />
                <input
                  type="email"
                  placeholder="Email (required for first sign-in)"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-xl border border-[#d7c9b7] bg-white px-4 py-3 text-sm"
                />
              </>
            ) : null}
          </>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-wine px-5 py-3 text-sm font-semibold text-ivory disabled:opacity-60"
        >
          {submitting
            ? "Please wait..."
            : otpSent
              ? "Verify and Sign In"
              : "Continue with Mobile"}
        </button>
      </form>

      {devOtp ? (
        <p className="text-xs text-[#6A1F2B]">
          Dev OTP: <span className="font-semibold">{devOtp}</span>
        </p>
      ) : null}

      {message ? <p className="text-xs text-[#6b625b]">{message}</p> : null}
    </div>
  );
}
