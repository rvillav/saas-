"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  Mail,
  FileText,
  User,
  Phone,
  AtSign,
  Hash,
  CalendarDays,
  StickyNote,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
} from "lucide-react";
import { downloadQuotePdf } from "@/lib/pdf/generateQuotePdf";

type QuoteDetail = {
  id: string;
  quote_number: number;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  client_rut: string | null;
  status: string;
  total_amount: number;
  valid_until: string | null;
  notes: string | null;
  created_at: string;
};

type QuoteItemDetail = {
  id: string;
  quantity: number;
  unit_price: number;
  description: string | null;
  products: { name: string } | null;
};

const STATUS_CFG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  DRAFT: { label: "Borrador", color: "bg-slate-500/10 text-slate-400 border border-slate-500/20", icon: Clock },
  SENT: { label: "Enviada", color: "bg-blue-500/10 text-blue-400 border border-blue-500/20", icon: Send },
  ACCEPTED: { label: "Aceptada", color: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20", icon: CheckCircle2 },
  REJECTED: { label: "Rechazada", color: "bg-red-500/10 text-red-400 border border-red-500/20", icon: XCircle },
};

const CLP = (n: number) =>
  n.toLocaleString("es-CL", { style: "currency", currency: "CLP" });

export default function QuoteDetailPage() {
  const [supabase] = useState(() => createClient());
  const params = useParams();
  const router = useRouter();
  const quoteId = params.id as string;

  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [qItems, setQItems] = useState<QuoteItemDetail[]>([]);
  const [orgName, setOrgName] = useState("MedStock");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sentOk, setSentOk] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const { data: q } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", quoteId)
      .single();

    const { data: items } = await supabase
      .from("quote_items")
      .select("id, quantity, unit_price, description, products(name)")
      .eq("quote_id", quoteId);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("users")
        .select("organization_id")
        .eq("id", user.id)
        .single();
      if (profile) {
        const { data: org } = await supabase
          .from("organizations")
          .select("name")
          .eq("id", profile.organization_id)
          .single();
        if (org) setOrgName(org.name);
      }
    }

    setQuote(q ?? null);
    setQItems((items as unknown as QuoteItemDetail[]) ?? []);
    setLoading(false);
  }, [supabase, quoteId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <FileText className="w-12 h-12 text-slate-600" />
        <p className="text-slate-400">Cotización no encontrada.</p>
        <button onClick={() => router.back()} className="text-violet-400 hover:text-violet-300 text-sm">
          ← Volver
        </button>
      </div>
    );
  }

  // Prices are IVA-included — extract neto and IVA.
  const total = qItems.reduce((s, i) => s + i.quantity * Number(i.unit_price), 0);
  const subtotal = Math.round(total / 1.19);
  const iva = total - subtotal;

  const pdfData = {
    quoteNumber: quote.quote_number,
    clientName: quote.client_name,
    clientEmail: quote.client_email,
    clientPhone: quote.client_phone,
    clientRut: quote.client_rut,
    createdAt: quote.created_at,
    validUntil: quote.valid_until,
    notes: quote.notes,
    organizationName: orgName,
    items: qItems.map((i) => ({
      name: i.products?.name ?? "Producto",
      description: i.description,
      quantity: i.quantity,
      unitPrice: Number(i.unit_price),
    })),
  };

  async function handleSendEmail() {
    if (!quote?.client_email) {
      alert("Esta cotización no tiene email de cliente registrado.");
      return;
    }

    setSending(true);

    const { quoteToBase64 } = await import("@/lib/pdf/generateQuotePdf");
    const pdfBase64 = quoteToBase64(pdfData);

    const { data: { session } } = await supabase.auth.getSession();

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-quote-email`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          quoteId: quote.id,
          toEmail: quote.client_email,
          toName: quote.client_name,
          quoteNumber: quote.quote_number,
          organizationName: orgName,
          totalAmount: quote.total_amount,
          pdfBase64,
        }),
      }
    );

    if (res.ok) {
      await supabase.from("quotes").update({ status: "SENT" }).eq("id", quote.id);
      setQuote((prev) => prev ? { ...prev, status: "SENT" } : prev);
      setSentOk(true);
      setTimeout(() => setSentOk(false), 4000);
    } else {
      const err = await res.json().catch(() => ({}));
      alert(`Error al enviar: ${err.error ?? res.statusText}`);
    }
    setSending(false);
  }

  const cfg = STATUS_CFG[quote.status] ?? STATUS_CFG.DRAFT;
  const StatusIcon = cfg.icon;

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("es-CL", {
      day: "2-digit", month: "long", year: "numeric",
    });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <button
          onClick={() => router.push("/dashboard/quotes")}
          className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a cotizaciones
        </button>
        <div className="flex items-center gap-2">
          {sentOk && (
            <span className="flex items-center gap-1.5 text-emerald-400 text-sm animate-pulse">
              <CheckCircle2 className="w-4 h-4" /> Email enviado
            </span>
          )}
          <button
            onClick={() => downloadQuotePdf(pdfData)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-sm font-medium text-white hover:bg-white/10 transition-all"
          >
            <Download className="w-4 h-4" />
            Descargar PDF
          </button>
          <button
            onClick={handleSendEmail}
            disabled={sending || !quote.client_email}
            title={!quote.client_email ? "Sin email registrado" : "Enviar por correo"}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium text-sm hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/20"
          >
            {sending ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Mail className="w-4 h-4" />
            )}
            Enviar por Email
          </button>
        </div>
      </div>

      {/* Document Preview */}
      <div className="bg-white rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
        {/* Header band */}
        <div className="bg-blue-700 px-10 py-8 flex items-start justify-between">
          <div>
            <p className="text-blue-200 text-xs font-medium tracking-widest uppercase mb-1">Empresa</p>
            <h1 className="text-2xl font-bold text-white uppercase tracking-tight">{orgName}</h1>
          </div>
          <div className="text-right">
            <p className="text-blue-200 text-xs font-medium tracking-widest uppercase mb-1">Cotización</p>
            <p className="text-3xl font-bold text-white">
              N° {String(quote.quote_number ?? "—").padStart(4, "0")}
            </p>
            <span className={`inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs font-semibold ${cfg.color} bg-white/20 text-white border-white/20`}>
              <StatusIcon className="w-3.5 h-3.5" />
              {cfg.label}
            </span>
          </div>
        </div>

        {/* Dates bar */}
        <div className="bg-blue-50 px-10 py-3 flex gap-10 text-sm">
          <div>
            <span className="text-slate-400 text-xs uppercase font-semibold tracking-wider">Emisión</span>
            <p className="font-semibold text-slate-700">{fmt(quote.created_at)}</p>
          </div>
          <div>
            <span className="text-slate-400 text-xs uppercase font-semibold tracking-wider">Válida hasta</span>
            <p className="font-semibold text-slate-700">
              {quote.valid_until ? fmt(quote.valid_until) : "30 días desde emisión"}
            </p>
          </div>
        </div>

        {/* Client info */}
        <div className="px-10 py-6 border-b border-slate-100">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Dirigido a</p>
          <h2 className="text-xl font-bold text-slate-800">{quote.client_name}</h2>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
            {quote.client_rut && (
              <span className="flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5" /> {quote.client_rut}
              </span>
            )}
            {quote.client_phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" /> {quote.client_phone}
              </span>
            )}
            {quote.client_email && (
              <span className="flex items-center gap-1.5">
                <AtSign className="w-3.5 h-3.5" /> {quote.client_email}
              </span>
            )}
          </div>
        </div>

        {/* Items table */}
        <div className="px-10 py-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-blue-700 text-white text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3 rounded-tl-lg w-8">#</th>
                <th className="text-left px-4 py-3">Descripción</th>
                <th className="text-center px-4 py-3 w-16">Cant.</th>
                <th className="text-right px-4 py-3 w-36">Precio Unit.</th>
                <th className="text-right px-4 py-3 rounded-tr-lg w-36">Total</th>
              </tr>
            </thead>
            <tbody>
              {qItems.map((item, idx) => (
                <tr
                  key={item.id}
                  className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}
                >
                  <td className="px-4 py-3 text-slate-400 text-center">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{item.products?.name ?? "Producto"}</p>
                    {item.description && (
                      <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-slate-600">{item.quantity}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{CLP(Number(item.unit_price))}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-800">
                    {CLP(item.quantity * Number(item.unit_price))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="mt-4 ml-auto w-72 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-500 pb-1">
              <span>Subtotal (neto)</span>
              <span>{CLP(subtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>IVA (19%)</span>
              <span>{CLP(iva)}</span>
            </div>
            <div className="flex justify-between font-bold text-lg text-slate-800 pt-2 border-t-2 border-blue-700">
              <span>TOTAL</span>
              <span className="text-blue-700">{CLP(total)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {quote.notes && (
          <div className="px-10 pb-6">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <StickyNote className="w-3.5 h-3.5" /> Observaciones
              </p>
              <p className="text-sm text-slate-600">{quote.notes}</p>
            </div>
          </div>
        )}

        {/* Conditions */}
        <div className="px-10 pb-6">
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2">Términos y condiciones</p>
            <ul className="text-xs text-slate-500 space-y-1">
              <li>• Los precios indicados son en pesos chilenos (CLP) e incluyen IVA.</li>
              <li>• Esta cotización tiene una validez de 15 días desde su fecha de emisión.</li>
              <li>• Los plazos de entrega están sujetos a disponibilidad de stock.</li>
              <li>• Para aceptar esta cotización, responda este correo o contáctenos directamente.</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-blue-700 px-10 py-4 text-center">
          <p className="text-blue-200 text-xs">
            {orgName} &nbsp;·&nbsp; Cotización N° {String(quote.quote_number ?? "—").padStart(4, "0")} &nbsp;·&nbsp; Generada el {fmt(quote.created_at)}
          </p>
        </div>
      </div>

      {/* Status change */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <p className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
          <CalendarDays className="w-4 h-4" /> Cambiar estado
        </p>
        <div className="flex flex-wrap gap-2">
          {(["DRAFT", "SENT", "ACCEPTED", "REJECTED"] as const).map((s) => {
            const c = STATUS_CFG[s];
            const Icon = c.icon;
            const isActive = quote.status === s;
            return (
              <button
                key={s}
                disabled={isActive}
                onClick={async () => {
                  await supabase.from("quotes").update({ status: s }).eq("id", quote.id);
                  setQuote((prev) => prev ? { ...prev, status: s } : prev);
                }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${isActive ? c.color + " cursor-default" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {c.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
