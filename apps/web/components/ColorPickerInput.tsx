"use client";

import { useEffect, useRef, useState } from "react";

// A curated palette of saree-relevant colours, grouped by family.
const PALETTE: { label: string; hex: string }[][] = [
  // Reds & pinks
  [
    { label: "Wine", hex: "#6a1f2b" },
    { label: "Deep Red", hex: "#8b1a1a" },
    { label: "Crimson", hex: "#c0392b" },
    { label: "Rose", hex: "#e8687a" },
    { label: "Blush", hex: "#f4b8c1" },
    { label: "Coral", hex: "#e8735a" },
  ],
  // Purples & magentas
  [
    { label: "Eggplant", hex: "#3d1a3d" },
    { label: "Plum", hex: "#7b2d8b" },
    { label: "Violet", hex: "#6a35b7" },
    { label: "Lavender", hex: "#b0a0d4" },
    { label: "Magenta", hex: "#c0307a" },
    { label: "Pink", hex: "#d4609a" },
  ],
  // Blues & teals
  [
    { label: "Navy", hex: "#1a2456" },
    { label: "Royal Blue", hex: "#2c4fad" },
    { label: "Sky Blue", hex: "#6aaed4" },
    { label: "Teal", hex: "#1d7a7a" },
    { label: "Peacock", hex: "#2a7a5a" },
    { label: "Turquoise", hex: "#38b2ac" },
  ],
  // Greens
  [
    { label: "Bottle Green", hex: "#1a4a2a" },
    { label: "Forest", hex: "#2d5e40" },
    { label: "Mint", hex: "#6ecf9e" },
    { label: "Olive", hex: "#6b6b2a" },
    { label: "Lime", hex: "#a8c543" },
    { label: "Sage", hex: "#9ab89a" },
  ],
  // Yellows, oranges & saffron
  [
    { label: "Saffron", hex: "#f5820a" },
    { label: "Marigold", hex: "#f5a623" },
    { label: "Turmeric", hex: "#e8b840" },
    { label: "Ivory", hex: "#f7f0e0" },
    { label: "Cream", hex: "#fdf5e6" },
    { label: "Lemon", hex: "#f5e642" },
  ],
  // Neutrals & metallics
  [
    { label: "Black", hex: "#1a1a1a" },
    { label: "Charcoal", hex: "#4a4a4a" },
    { label: "Grey", hex: "#9a9a9a" },
    { label: "White", hex: "#ffffff" },
    { label: "Gold", hex: "#c7a56a" },
    { label: "Silver", hex: "#c0c0c0" },
  ],
];

type Props = {
  label: string;
  colorName: string;
  colorCode: string;
  onColorNameChange: (name: string) => void;
  onColorCodeChange: (hex: string) => void;
  placeholder?: string;
};

export default function ColorPickerInput({
  label,
  colorName,
  colorCode,
  onColorNameChange,
  onColorCodeChange,
  placeholder = "e.g. Crimson",
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Normalise the hex value: ensure it starts with #
  const normHex = colorCode.startsWith("#") ? colorCode : colorCode ? `#${colorCode}` : "";

  // Close panel when clicking outside
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  function pickSwatch(hex: string, swatchLabel: string) {
    onColorCodeChange(hex);
    // Only auto-fill name if it's still empty
    if (!colorName.trim()) {
      onColorNameChange(swatchLabel);
    }
  }

  const isValidHex = /^#[0-9a-fA-F]{6}$/.test(normHex);

  return (
    <div ref={containerRef} className="relative w-full">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[#7a6a5a]">
        {label}
      </p>

      {/* Name + swatch trigger row */}
      <div className="flex gap-2">
        <input
          type="text"
          value={colorName}
          onChange={(e) => onColorNameChange(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-xl border border-[#d7c9b7] p-2 text-sm"
        />

        {/* Colour swatch button — shows current colour or a grey placeholder */}
        <button
          type="button"
          title="Pick a colour"
          onClick={() => setOpen((prev) => !prev)}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-[#d7c9b7] shadow-sm transition hover:border-[#b5a28c]"
          style={{
            background: isValidHex ? normHex : "#e8e0d8",
          }}
        >
          {!isValidHex && (
            <svg
              viewBox="0 0 16 16"
              className="h-4 w-4 text-[#8a7a69]"
              fill="currentColor"
            >
              <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm0 2a5 5 0 1 1 0 10A5 5 0 0 1 8 3Zm-.75 2.5v2.25H5.5a.75.75 0 0 0 0 1.5h1.75V11.5a.75.75 0 0 0 1.5 0V9.25H10.5a.75.75 0 0 0 0-1.5H8.75V5.5a.75.75 0 0 0-1.5 0Z" />
            </svg>
          )}
        </button>

        {/* Manual hex input */}
        <input
          type="text"
          value={colorCode}
          onChange={(e) => onColorCodeChange(e.target.value)}
          placeholder="#RRGGBB"
          maxLength={7}
          className="w-24 flex-shrink-0 rounded-xl border border-[#d7c9b7] p-2 font-mono text-xs"
          style={isValidHex ? { borderColor: normHex, boxShadow: `0 0 0 2px ${normHex}22` } : {}}
        />
      </div>

      {/* Dropdown palette */}
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 w-full min-w-[22rem] rounded-2xl border border-[#e4d9d0] bg-white p-3 shadow-xl">
          {/* Native colour picker at top for full freedom */}
          <div className="mb-3 flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#d7c9b7] px-3 py-1.5 text-xs text-[#5b5149] hover:bg-[#faf5ef]">
              <input
                type="color"
                value={isValidHex ? normHex : "#c7a56a"}
                onChange={(e) => onColorCodeChange(e.target.value)}
                className="h-5 w-5 cursor-pointer rounded border-none bg-transparent p-0"
              />
              <span>Custom colour</span>
            </label>
            {isValidHex && (
              <span
                className="flex items-center gap-1.5 rounded-xl border border-[#d7c9b7] px-3 py-1.5 text-xs"
                style={{ borderLeftColor: normHex, borderLeftWidth: 3 }}
              >
                <span
                  className="inline-block h-3 w-3 rounded-full border border-black/10"
                  style={{ background: normHex }}
                />
                {normHex}
              </span>
            )}
          </div>

          {/* Curated palette grid */}
          <div className="space-y-2">
            {PALETTE.map((row, rowIdx) => (
              <div key={rowIdx} className="flex gap-1.5">
                {row.map((swatch) => (
                  <button
                    key={swatch.hex}
                    type="button"
                    title={swatch.label}
                    onClick={() => pickSwatch(swatch.hex, swatch.label)}
                    className="group relative h-7 w-7 flex-shrink-0 rounded-full border border-black/10 transition hover:scale-110 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#c7a56a]"
                    style={{ background: swatch.hex }}
                  >
                    {/* Tooltip */}
                    <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#1a1a1a] px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                      {swatch.label}
                    </span>
                    {/* Tick for selected */}
                    {normHex.toLowerCase() === swatch.hex.toLowerCase() && (
                      <svg
                        viewBox="0 0 12 12"
                        className="absolute inset-0 m-auto h-3.5 w-3.5 drop-shadow"
                        fill="none"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="2,6 5,9 10,3" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
