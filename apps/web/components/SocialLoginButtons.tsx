"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

const providers = [
  { id: "google", label: "Use Google" },
  { id: "facebook", label: "Use Facebook" },
  { id: "apple", label: "Use Apple" },
] as const;

export default function SocialLoginButtons() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  return (
    <div className="space-y-3">
      {providers.map((provider) => (
        <button
          key={provider.id}
          type="button"
          onClick={() => signIn(provider.id, { callbackUrl })}
          className="w-full rounded-sm border border-[#e4d9d0] bg-white px-5 py-3 text-sm font-light text-ink transition hover:border-[#c5b9ae] hover:bg-[#faf8f5]"
        >
          {provider.label}
        </button>
      ))}
    </div>
  );
}
