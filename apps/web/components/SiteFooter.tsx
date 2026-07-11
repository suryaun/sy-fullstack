"use client";

import { useEffect, useState } from "react";
import { getRuntimeReleaseVersion } from "@/lib/publicApiUrl";

export default function SiteFooter() {
  const [releaseVersion, setReleaseVersion] = useState("local");

  useEffect(() => {
    setReleaseVersion(getRuntimeReleaseVersion() || "local");
  }, []);

  return (
    <footer className="border-t border-[#e4d9d0] px-5 py-3 text-right text-[10px] uppercase tracking-[0.14em] text-[#8a7467] sm:px-8">
      Release {releaseVersion}
    </footer>
  );
}