"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import AddressManager from "@/components/AddressManager";

export default function AccountPage() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <p className="text-sm text-[#4e4038]">Checking account...</p>
      </main>
    );
  }

  if (status === "unauthenticated") {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="font-serif text-3xl text-ink">My Account</h1>
        <p className="mt-3 text-sm text-[#4e4038]">
          Please sign in to view your account details.
        </p>
        <Link
          href="/login?callbackUrl=/account"
          className="mt-4 inline-block rounded-sm bg-ink px-6 py-2.5 text-[11px] uppercase tracking-[0.18em] text-[#faf8f5]"
        >
          Sign In
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-serif text-3xl text-ink">My Account</h1>

      <section className="mt-6 rounded border border-[#e4d9d0] bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#5b5149]">
          Profile
        </h2>
        <div className="mt-3 grid gap-3 text-sm text-[#4f473f] sm:grid-cols-2">
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-[#4e4038]">
              Name
            </p>
            <p>{session?.user?.name ?? "Not set"}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-[#4e4038]">
              Email
            </p>
            <p>{session?.user?.email ?? "Not set"}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-[#4e4038]">
              Mobile
            </p>
            <p>{session?.user?.mobile ?? "Not set"}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-[#4e4038]">
              Profile Status
            </p>
            <p>{session?.user?.profileComplete ? "Complete" : "Pending"}</p>
          </div>
        </div>
        <Link
          href="/complete-profile"
          className="mt-4 inline-block rounded-sm border border-[#e4d9d0] px-5 py-2.5 text-[11px] uppercase tracking-[0.18em] text-[#5c4e44]"
        >
          Edit Profile
        </Link>
      </section>

      <div className="mt-6">
        <AddressManager
          title="Saved Addresses"
          emptyMessage="No saved address yet. Add one to keep checkout quick."
          selectedAddressLabel="Selected"
        />
      </div>
    </main>
  );
}