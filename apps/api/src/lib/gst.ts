// GST utilities for Indian B2C textile invoicing.
// Seller is registered in Karnataka.

const SELLER_STATE = "karnataka";

export function getFinancialYear(date: Date): string {
  const month = date.getMonth(); // 0-indexed; 3 = April
  const year = date.getFullYear();
  if (month >= 3) {
    return `${year}-${String(year + 1).slice(-2)}`;
  }
  return `${year - 1}-${String(year).slice(-2)}`;
}

// HSN codes for common saree fabrics (Chapter 50-57).
export function getHsnCode(fabric: string): string {
  const map: Record<string, string> = {
    SILK: "5007",
    SATIN: "5007",
    COTTON: "5208",
    LINEN: "5309",
    CHIFFON: "5407",
    GEORGETTE: "5407",
    CREPE: "5407",
    ORGANZA: "5407",
  };
  return map[fabric.toUpperCase()] ?? "6299";
}

// GST rate for textiles (Notification 1/2017-CT(Rate)):
//   - Handloom-certified → 0 % (Notification 2/2017-CT(Rate))
//   - < ₹1,000/piece     → 5 %
//   - ≥ ₹1,000/piece     → 12 %
export function getGstRatePercent(
  unitPriceInPaise: number,
  hasHandloomMark: boolean
): number {
  if (hasHandloomMark) return 0;
  return unitPriceInPaise < 100_000 ? 5 : 12;
}

export type ItemGstResult = {
  gstRatePercent: number;
  taxableAmountInPaise: number;
  cgstInPaise: number;
  sgstInPaise: number;
  igstInPaise: number;
};

// Prices stored in DB are MRP (GST-inclusive) for B2C retail.
// Back-calculates taxable value and splits into CGST/SGST (intrastate)
// or IGST (interstate) depending on the buyer's delivery state.
export function calculateItemGst(params: {
  unitPriceInPaise: number; // per-piece price, used for rate determination
  lineTotalInPaise: number; // qty × unitPrice (inclusive of GST)
  hasHandloomMark: boolean;
  deliveryState: string;
}): ItemGstResult {
  const { unitPriceInPaise, lineTotalInPaise, hasHandloomMark, deliveryState } =
    params;

  const gstRate = getGstRatePercent(unitPriceInPaise, hasHandloomMark);

  if (gstRate === 0) {
    return {
      gstRatePercent: 0,
      taxableAmountInPaise: lineTotalInPaise,
      cgstInPaise: 0,
      sgstInPaise: 0,
      igstInPaise: 0,
    };
  }

  // Reverse-calculate: MRP = taxable × (1 + rate/100)
  const taxableAmountInPaise = Math.round(lineTotalInPaise / (1 + gstRate / 100));
  const gstAmountInPaise = lineTotalInPaise - taxableAmountInPaise;

  const isIntrastate =
    deliveryState.trim().toLowerCase() === SELLER_STATE;

  if (isIntrastate) {
    const half = Math.round(gstAmountInPaise / 2);
    return {
      gstRatePercent: gstRate,
      taxableAmountInPaise,
      cgstInPaise: half,
      sgstInPaise: gstAmountInPaise - half,
      igstInPaise: 0,
    };
  }

  return {
    gstRatePercent: gstRate,
    taxableAmountInPaise,
    cgstInPaise: 0,
    sgstInPaise: 0,
    igstInPaise: gstAmountInPaise,
  };
}
