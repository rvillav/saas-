import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type RentalPdfData = {
  clientName: string;
  clientRut?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  productName: string;
  quantity: number;
  dailyRate: number;
  startDate: string;
  expectedReturnDate?: string | null;
  actualReturnDate?: string | null;
  status: string;
  notes?: string | null;
  organizationName: string;
  createdAt: string;
};

const CLP = (n: number) =>
  n.toLocaleString("es-CL", { style: "currency", currency: "CLP" });

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "ACTIVO",
  RETURNED: "DEVUELTO",
  OVERDUE: "VENCIDO",
  CANCELLED: "CANCELADO",
};

export function generateRentalPdf(data: RentalPdfData): jsPDF {
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

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

  // ── HEADER BAND ─────────────────────────────────────────────────────────
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, PAGE_W, 38, "F");

  // Company name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text(data.organizationName.toUpperCase(), MARGIN, 18);

  // "CONTRATO DE ARRIENDO" label on right
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(191, 219, 254); // blue-200
  doc.text("CONTRATO DE ARRIENDO", PAGE_W - MARGIN, 12, { align: "right" });

  // Status badge
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  const statusLabel = STATUS_LABELS[data.status] ?? data.status;
  doc.text(statusLabel, PAGE_W - MARGIN, 22, { align: "right" });

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

  dateLabel("Fecha de inicio", fmt(data.startDate), MARGIN);
  dateLabel(
    "Devolución esperada",
    data.expectedReturnDate ? fmt(data.expectedReturnDate) : "Sin fecha límite",
    MARGIN + 65
  );
  if (data.actualReturnDate) {
    dateLabel("Devuelto el", fmt(data.actualReturnDate), MARGIN + 130);
  } else {
    dateLabel("Estado", statusLabel, MARGIN + 130);
  }

  // ── CLIENT BLOCK ────────────────────────────────────────────────────────
  let y = 66;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_LIGHT);
  doc.text("ARRENDATARIO", MARGIN, y);

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
    doc.text(`Fono: ${data.clientPhone}`, MARGIN, y);
    y += 4.5;
  }
  if (data.clientEmail) {
    doc.text(`Mail: ${data.clientEmail}`, MARGIN, y);
    y += 4.5;
  }

  // ── EQUIPMENT DETAILS TABLE ─────────────────────────────────────────────
  y += 4;

  const weeks = (() => {
    const s = new Date(data.startDate);
    const e = data.actualReturnDate
      ? new Date(data.actualReturnDate)
      : data.expectedReturnDate
        ? new Date(data.expectedReturnDate)
        : new Date();
    const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24 * 7));
    return Math.max(1, diff);
  })();

  const totalAmount = data.dailyRate * weeks;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [["Equipo", "Cantidad", "Tarifa Semanal", "Semanas", "Total"]],
    body: [
      [
        data.productName,
        String(data.quantity),
        CLP(data.dailyRate),
        String(weeks),
        CLP(totalAmount),
      ],
    ],
    foot: [
      ["", "", "", "TOTAL", CLP(totalAmount)],
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
      0: { cellWidth: "auto" },
      1: { cellWidth: 24, halign: "center" },
      2: { cellWidth: 36, halign: "right" },
      3: { cellWidth: 18, halign: "center" },
      4: { cellWidth: 36, halign: "right" },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell(hookData) {
      if (hookData.section === "foot" && hookData.row.index === 0) {
        hookData.cell.styles.fillColor = PRIMARY_LIGHT;
        hookData.cell.styles.textColor = PRIMARY;
        hookData.cell.styles.fontSize = 10;
      }
    },
  });

  // ── PERIOD SUMMARY ──────────────────────────────────────────────────────
  const afterTable = (doc as jsPDF & { lastAutoTable: { finalY: number } })
    .lastAutoTable.finalY;
  let noteY = afterTable + 10;

  // Period info box
  const boxPadding = 5;
  const endDateText = data.actualReturnDate
    ? fmt(data.actualReturnDate)
    : data.expectedReturnDate
      ? fmt(data.expectedReturnDate)
      : "Sin definir";

  const boxH = 22;

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(MARGIN, noteY, CONTENT_W, boxH, 3, 3, "F");
  doc.setDrawColor(...TEXT_LIGHT);
  doc.roundedRect(MARGIN, noteY, CONTENT_W, boxH, 3, 3, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MID);
  doc.text("RESUMEN DEL PERÍODO", MARGIN + boxPadding, noteY + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_DARK);
  doc.text(`Inicio:  ${fmt(data.startDate)}`, MARGIN + boxPadding, noteY + 13);
  doc.text(`Fin:       ${endDateText}`, MARGIN + boxPadding, noteY + 18);

  noteY += boxH + 8;

  // ── NOTES ───────────────────────────────────────────────────────────────
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

  // ── CONDITIONS BOX ────────────────────────────────────────────────────
  const conditions = [
    "• Los precios indicados son en pesos chilenos (CLP) e incluyen IVA.",
    "• El arrendatario se compromete a devolver el equipo en las condiciones recibidas.",
    "• En caso de daño o pérdida, el arrendatario asume la responsabilidad del costo de reposición.",
    "• La tarifa semanal aplica desde la fecha de inicio hasta la fecha de devolución efectiva.",
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

  // ── FOOTER ──────────────────────────────────────────────────────────────
  const FOOTER_Y = 285;
  doc.setFillColor(...PRIMARY);
  doc.rect(0, FOOTER_Y, PAGE_W, 12, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(191, 219, 254);
  doc.text(
    `${data.organizationName}  |  Contrato de Arriendo  |  Generado el ${fmt(new Date().toISOString())}`,
    PAGE_W / 2,
    FOOTER_Y + 7.5,
    { align: "center" }
  );

  return doc;
}

/** Download rental PDF directly in the browser */
export function downloadRentalPdf(data: RentalPdfData) {
  const doc = generateRentalPdf(data);
  doc.save(
    `arriendo-${data.clientName.replace(/\s+/g, "_")}-${new Date(data.startDate).toISOString().split("T")[0]}.pdf`
  );
}

/** Preview rental PDF in a new browser tab */
export function previewRentalPdf(data: RentalPdfData) {
  const doc = generateRentalPdf(data);
  const blobUrl = doc.output("bloburl");
  window.open(blobUrl as unknown as string, "_blank");
}
