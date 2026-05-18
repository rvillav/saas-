import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type QuotePdfData = {
  quoteNumber: number;
  clientName: string;
  clientRut?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  createdAt: string;
  validUntil?: string | null;
  notes?: string | null;
  organizationName: string;
  items: {
    name: string;
    description?: string | null;
    quantity: number;
    unitPrice: number;
  }[];
};

const CLP = (n: number) =>
  n.toLocaleString("es-CL", { style: "currency", currency: "CLP" });

export function generateQuotePdf(data: QuotePdfData): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const PAGE_W = 210;
  const MARGIN = 18;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  // ── COLORS ──────────────────────────────────────────────────────────────
  const PRIMARY: [number, number, number] = [30, 64, 175]; // blue-700
  const PRIMARY_LIGHT: [number, number, number] = [219, 234, 254]; // blue-100
  const TEXT_DARK: [number, number, number] = [15, 23, 42]; // slate-900
  const TEXT_MID: [number, number, number] = [71, 85, 105]; // slate-500
  const TEXT_LIGHT: [number, number, number] = [148, 163, 184]; // slate-400

  // ── HEADER BAND ─────────────────────────────────────────────────────────
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, PAGE_W, 38, "F");

  // Company name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text("CPAP OSORNO", MARGIN, 18);

  // Website
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(191, 219, 254);
  doc.text("https://cpaposorno.cl/", MARGIN, 24);

  // "COTIZACIÓN" label on right
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(191, 219, 254); // blue-200
  doc.text("COTIZACIÓN", PAGE_W - MARGIN, 12, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text(`N° ${String(data.quoteNumber).padStart(4, "0")}`, PAGE_W - MARGIN, 22, {
    align: "right",
  });

  // ── DATES BAND ──────────────────────────────────────────────────────────
  doc.setFillColor(...PRIMARY_LIGHT);
  doc.rect(0, 38, PAGE_W, 16, "F");

  const dateLabel = (label: string, value: string, x: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MID);
    doc.text(label.toUpperCase(), x, 44);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...PRIMARY);
    doc.text(value, x, 50);
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

  dateLabel("Fecha de emisión", fmt(data.createdAt), MARGIN);
  dateLabel(
    "Válida hasta",
    data.validUntil ? fmt(data.validUntil) : "30 días desde emisión",
    MARGIN + 70
  );
  dateLabel("Estado", "BORRADOR", MARGIN + 145);

  // ── BILLING / CLIENT BLOCK ───────────────────────────────────────────────
  let y = 66;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_LIGHT);
  doc.text("DIRIGIDO A", MARGIN, y);

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...TEXT_DARK);
  doc.text(data.clientName, MARGIN, y);

  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MID);

  if (data.clientRut) {
    doc.text(`RUT: ${data.clientRut}`, MARGIN, y);
    y += 4.5;
  }
  if (data.clientPhone) {
    doc.text(`Teléfono: ${data.clientPhone}`, MARGIN, y);
    y += 4.5;
  }
  if (data.clientEmail) {
    doc.text(`Email: ${data.clientEmail}`, MARGIN, y);
    y += 4.5;
  }

  // ── ITEMS TABLE ──────────────────────────────────────────────────────────
  y += 6;

  // Prices are IVA-included — extract neto and IVA.
  const total = data.items.reduce(
    (s, i) => s + i.quantity * i.unitPrice,
    0
  );
  const subtotal = Math.round(total / 1.19);
  const iva = total - subtotal;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [["#", "Descripción", "Cant.", "Precio Unit.", "Total"]],
    body: data.items.map((item, idx) => [
      idx + 1,
      item.description
        ? `${item.name}\n${item.description}`
        : item.name,
      item.quantity,
      CLP(item.unitPrice),
      CLP(item.quantity * item.unitPrice),
    ]),
    foot: [
      ["", "", "", "Subtotal (neto)", CLP(subtotal)],
      ["", "", "", "IVA (19%)", CLP(iva)],
      ["", "", "", "TOTAL", CLP(total)],
    ],
    headStyles: {
      fillColor: PRIMARY,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: TEXT_DARK,
    },
    footStyles: {
      fontStyle: "bold",
      fontSize: 9,
      textColor: TEXT_DARK,
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 18, halign: "center" },
      3: { cellWidth: 36, halign: "right" },
      4: { cellWidth: 36, halign: "right" },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    // Highlight TOTAL row
    didParseCell(hookData) {
      if (hookData.section === "foot" && hookData.row.index === 2) {
        hookData.cell.styles.fillColor = PRIMARY_LIGHT;
        hookData.cell.styles.textColor = PRIMARY;
        hookData.cell.styles.fontSize = 10;
      }
    },
  });

  // ── NOTES ────────────────────────────────────────────────────────────────
  const afterTable = (doc as jsPDF & { lastAutoTable: { finalY: number } })
    .lastAutoTable.finalY;
  let noteY = afterTable + 10;

  if (data.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_MID);
    doc.text("OBSERVACIONES", MARGIN, noteY);
    noteY += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_DARK);
    const lines = doc.splitTextToSize(data.notes, CONTENT_W);
    doc.text(lines, MARGIN, noteY);
    noteY += lines.length * 5 + 5;
  }

  // ── CONDITIONS BOX ───────────────────────────────────────────────────────
  const conditions = [
    "• Los precios indicados son en pesos chilenos (CLP) e incluyen IVA.",
    "• Esta cotización tiene una validez de 15 días desde su fecha de emisión.",
    "• Los plazos de entrega están sujetos a disponibilidad de stock.",
    "• Para aceptar esta cotización, responda este correo o contáctenos directamente.",
  ];

  if (noteY + 32 < 270) {
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(MARGIN, noteY, CONTENT_W, conditions.length * 5 + 10, 3, 3, "F");
    doc.setDrawColor(...TEXT_LIGHT);
    doc.roundedRect(MARGIN, noteY, CONTENT_W, conditions.length * 5 + 10, 3, 3, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MID);
    doc.text("TÉRMINOS Y CONDICIONES", MARGIN + 5, noteY + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MID);
    conditions.forEach((line, i) => {
      doc.text(line, MARGIN + 5, noteY + 12 + i * 5);
    });
  }

  // ── FOOTER ───────────────────────────────────────────────────────────────
  const FOOTER_Y = 285;
  doc.setFillColor(...PRIMARY);
  doc.rect(0, FOOTER_Y, PAGE_W, 12, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(191, 219, 254);
  doc.text(
    `CPAP Osorno  |  Cotización N° ${String(data.quoteNumber).padStart(4, "0")}  |  Generado el ${fmt(new Date().toISOString())}`,
    PAGE_W / 2,
    FOOTER_Y + 7.5,
    { align: "center" }
  );

  return doc;
}

/** Download PDF directly in the browser */
export function downloadQuotePdf(data: QuotePdfData) {
  const doc = generateQuotePdf(data);
  doc.save(`cotizacion-${String(data.quoteNumber).padStart(4, "0")}-${data.clientName.replace(/\s+/g, "_")}.pdf`);
}

/** Get PDF as base64 string (for email attachment) */
export function quoteToBase64(data: QuotePdfData): string {
  const doc = generateQuotePdf(data);
  return doc.output("datauristring").split(",")[1];
}
