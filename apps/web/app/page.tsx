import BoutiqueGallery from "@/components/BoutiqueGallery";
import { catalogProducts } from "@/lib/catalog";

export default function Home() {
  return (
    <main>
      <header className="mx-auto max-w-6xl px-6 pb-6 pt-14 text-center">
        <p className="mb-3 text-xs uppercase tracking-[0.35em] text-[#6A1F2B]">
          Seere Yaana
        </p>
        <h1 className="font-serif text-5xl leading-tight text-ink sm:text-6xl">
          Modern Heirlooms in Every Drape
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-sm text-[#5b5149] sm:text-base">
          Curated handcrafted drapes with a minimalist luxury edit designed for
          intimate weddings, festive soirees, and statement evenings.
        </p>
      </header>

      <BoutiqueGallery products={catalogProducts} />
    </main>
  );
}
