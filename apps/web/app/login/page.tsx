import { Suspense } from "react";
import MobileLoginForm from "@/components/MobileLoginForm";
import SocialLoginButtons from "@/components/SocialLoginButtons";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
      <section className="w-full rounded-3xl border border-[#e8ddcf] bg-ivory p-6 shadow-luxe">
        <p className="text-xs uppercase tracking-[0.35em] text-[#6A1F2B]">
          Seere Yaana
        </p>
        <h1 className="mt-2 font-serif text-4xl leading-tight text-ink">
          Welcome Back
        </h1>
        <p className="mt-3 text-sm text-[#5b5149]">
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
