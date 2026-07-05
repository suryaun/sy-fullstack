"use client";

import { useEffect, useState } from "react";
import { getProviders, signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

const providers = [
  { id: "google", label: "Use Google" },
  { id: "facebook", label: "Use Facebook" },
  { id: "apple", label: "Use Apple" },
] as const;

export default function SocialLoginButtons() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const [availableProviderIds, setAvailableProviderIds] = useState<string[] | null>(null);

  useEffect(() => {
    let isMounted = true;

    getProviders()
      .then((result) => {
        if (!isMounted) {
          return;
        }

        const providerIds = Object.values(result ?? {})
          .filter((provider) => provider.type !== "credentials")
          .map((provider) => provider.id);

        setAvailableProviderIds(providerIds);
      })
      .catch(() => {
        if (isMounted) {
          setAvailableProviderIds([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (availableProviderIds === null) {
    return null;
  }

  const activeProviders = providers.filter((provider) => availableProviderIds.includes(provider.id));

  if (activeProviders.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <p className="text-center text-xs uppercase tracking-[0.25em] text-[#8b7e73]">
        Or continue with
      </p>

      {activeProviders.map((provider) => (
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
