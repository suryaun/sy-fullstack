import Image from "next/image";
import { Suspense } from "react";
import MobileLoginForm from "@/components/MobileLoginForm";
import SocialLoginButtons from "@/components/SocialLoginButtons";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
      <section className="w-full rounded border border-[#e4d9d0] bg-white p-8 shadow-luxe">
        <div className="mb-6 flex flex-col items-center gap-3">
          <span className="relative h-16 w-16 overflow-hidden rounded-full ring-1 ring-[#e4d9d0]">
            <Image
              src="/seere-yaana-logo.png"
              alt="Seere Yaana"
              fill
              className="object-cover"
              sizes="64px"
              priority
            />
          </span>
          <p className="font-serif text-2xl italic text-ink">Seere Yaana</p>
        </div>

        <h1 className="font-serif text-3xl leading-tight text-ink">
          Welcome Back
        </h1>
        <p className="mt-3 text-sm text-[#5c4a42]">
          Use your mobile number for the fastest sign in. Social login remains
          available below.
        </p>

        <div className="mt-6">
          <Suspense
            fallback={
              <p className="text-xs uppercase tracking-[0.2em] text-[#6b625b]">
                Loading mobile login...
              </p>
            }
          >
            <MobileLoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-xs uppercase tracking-[0.25em] text-[#8b7e73]">
          Or continue with
        </p>

        <div className="mt-3">
          <Suspense
            fallback={
              <p className="text-xs uppercase tracking-[0.2em] text-[#6b625b]">
                Loading sign-in options...
              </p>
            }
          >
            <SocialLoginButtons />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
