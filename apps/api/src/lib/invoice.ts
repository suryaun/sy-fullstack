import type { Prisma } from "@prisma/client";
import { getFinancialYear } from "./gst.js";

// Generates the next sequential invoice number within the current financial year.
// Format: SY/2025-26/0001
// Uses an atomic upsert+increment on InvoiceSequence so concurrent requests
// never produce duplicate numbers.
export async function generateInvoiceNumber(
  tx: Prisma.TransactionClient
): Promise<string> {
  const now = new Date();
  const fy = getFinancialYear(now);

  const updated = await tx.invoiceSequence.upsert({
    where: { financialYear: fy },
    create: { financialYear: fy, lastSequence: 1 },
    update: { lastSequence: { increment: 1 } },
  });

  return `SY/${fy}/${String(updated.lastSequence).padStart(4, "0")}`;
}
