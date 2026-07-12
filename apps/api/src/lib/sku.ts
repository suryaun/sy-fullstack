import type { Prisma } from "@prisma/client";

// Category abbreviations for SKU prefixes (3 chars).
const CATEGORY_ABBR: Record<string, string> = {
  BANARASI: "BAN",
  KANJEEVARAM: "KAN",
  BANDHANI: "BDH",
  CHIKANKARI: "CHI",
  PAITHANI: "PAI",
  PATOLA: "PAT",
  JAMDANI: "JAM",
  TUSSAR: "TUS",
};

// Slugify a color name into a 4-char uppercase code.
// e.g. "Crimson" → "CRIM", "Gold Border" → "GOLD", null → "NONE"
function slugifyColor(name: string | null | undefined): string {
  if (!name) return "NONE";
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4)
    .padEnd(4, "X");
}

// Color-level SKU: SY-{CATEGORY3}-{SEQ4}-{BODY4}-{BORDER4}
// e.g. SY-BAN-0042-CRIM-GOLD
export function generateColorSku(params: {
  categoryLabel: string;
  productSequenceNumber: number;
  colorName: string;
  borderColorName?: string | null;
}): string {
  const categoryName = params.categoryLabel.split(" /").at(-1)?.trim() ?? params.categoryLabel;
  const categoryAbbr =
    CATEGORY_ABBR[categoryName.toUpperCase()] ??
    categoryName.slice(0, 3).toUpperCase().padEnd(3, "X");
  const seq = String(params.productSequenceNumber).padStart(4, "0");
  const body = slugifyColor(params.colorName);
  const border = slugifyColor(params.borderColorName);
  return `SY-${categoryAbbr}-${seq}-${body}-${border}`;
}

// Piece-level serial: {COLOR_SKU}-{PIECE3}
// e.g. SY-BAN-0042-CRIM-GOLD-003
export function generatePieceSerial(colorSku: string, pieceNumber: number): string {
  return `${colorSku}-${String(pieceNumber).padStart(3, "0")}`;
}

// Create `count` new ProductPiece rows inside a transaction,
// continuing from the highest existing pieceNumber for that color.
export async function generatePieces(
  tx: Prisma.TransactionClient,
  productColorId: string,
  colorSku: string,
  count: number
): Promise<void> {
  if (count <= 0) return;

  const maxPiece = await tx.productPiece.findFirst({
    where: { productColorId },
    orderBy: { pieceNumber: "desc" },
    select: { pieceNumber: true },
  });

  const startNumber = (maxPiece?.pieceNumber ?? 0) + 1;

  await tx.productPiece.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      productColorId,
      pieceNumber: startNumber + i,
      serial: generatePieceSerial(colorSku, startNumber + i),
      status: "AVAILABLE" as const,
    })),
  });
}

// Mark up to `count` AVAILABLE pieces as REMOVED (when stock is reduced manually).
export async function removePieces(
  tx: Prisma.TransactionClient,
  productColorId: string,
  count: number
): Promise<void> {
  if (count <= 0) return;

  const pieces = await tx.productPiece.findMany({
    where: { productColorId, status: "AVAILABLE" },
    orderBy: { pieceNumber: "desc" },
    take: count,
    select: { id: true },
  });

  if (pieces.length === 0) return;

  await tx.productPiece.updateMany({
    where: { id: { in: pieces.map((p) => p.id) } },
    data: { status: "REMOVED" },
  });
}

// Allocate the first N AVAILABLE pieces to an order item and mark them SOLD.
export async function allocatePieces(
  tx: Prisma.TransactionClient,
  productColorId: string,
  orderItemId: string,
  quantity: number
): Promise<void> {
  if (quantity <= 0) return;

  const pieces = await tx.productPiece.findMany({
    where: { productColorId, status: "AVAILABLE" },
    orderBy: { pieceNumber: "asc" },
    take: quantity,
    select: { id: true },
  });

  if (pieces.length === 0) return;

  await tx.productPiece.updateMany({
    where: { id: { in: pieces.map((p) => p.id) } },
    data: { status: "SOLD", allocatedOrderItemId: orderItemId },
  });
}
