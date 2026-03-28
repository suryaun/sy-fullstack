"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { getPublicApiUrl } from "@/lib/publicApiUrl";

function CompleteProfileContent() {
  const router = useRouter();
  const params = useSearchParams();
  const nextUrl = useMemo(() => params.get("next") || "/", [params]);
  const { data: session, status, update } = useSession();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    if (session.user.profileComplete) {
      router.replace(nextUrl);
    }

    setName(session.user.name ?? "");
    setEmail(session.user.email ?? "");
  }, [status, session, router, nextUrl]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!session?.user?.id) {
      setMessage("Session not available. Please sign in again.");
      return;
    }

    setSubmitting(true);
    setMessage("");

    try {
      const apiUrl = getPublicApiUrl();
      const response = await fetch(`${apiUrl}/api/auth/mobile/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: session.user.id,
          name,
          email,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to save profile details.");
      }

      await update({
        user: {
          ...session.user,
          name,
          email,
          profileComplete: true,
        },
      });

      router.replace(nextUrl);
    } catch {
      setMessage("Unable to save profile details.");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <main className="mx-auto max-w-md px-6 py-12 text-sm">
        Loading profile...
      </main>
    );
  }

  if (status === "unauthenticated") {
    return (
      <main className="mx-auto max-w-md px-6 py-12 text-sm">
        Please sign in first.
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
      <section className="w-full rounded-3xl border border-[#e8ddcf] bg-ivory p-6 shadow-luxe">
        <p className="text-xs uppercase tracking-[0.35em] text-[#6A1F2B]">
          Seere Yaana
        </p>
        <h1 className="mt-2 font-serif text-3xl leading-tight text-ink">
          Complete Your Profile
        </h1>
        <p className="mt-2 text-sm text-[#5b5149]">
          Share your name and email to complete registration.
        </p>

        <form className="mt-5 space-y-3" onSubmit={onSubmit}>
          <input
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-xl border border-[#d7c9b7] bg-white px-4 py-3 text-sm"
            required
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-[#d7c9b7] bg-white px-4 py-3 text-sm"
            required
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-wine px-5 py-3 text-sm font-semibold text-ivory disabled:opacity-60"
          >
            {submitting ? "Saving..." : "Save and Continue"}
          </button>
        </form>

        {message ? (
          <p className="mt-3 text-xs text-[#6b625b]">{message}</p>
        ) : null}
      </section>
    </main>
  );
}

export default function CompleteProfilePage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-md px-6 py-12 text-sm">
          Loading profile...
        </main>
      }
    >
      <CompleteProfileContent />
    </Suspense>
  );
}
