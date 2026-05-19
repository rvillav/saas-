"use client";

import { createQuote, updateQuote, deleteQuote } from "@/app/actions/quotes";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUserRole } from "@/components/RoleProvider";
import { hasMinRole } from "@/lib/roles";
import { friendlyError } from "@/lib/errors";
import {
  FileText,
  Plus,
  X,
  Save,
  Trash2,
  AlertCircle,
  Download,
  Mail,
  Eye,
  User,
  Phone,
  AtSign,
  StickyNote,
  Pencil
} from "lucide-react";
import { downloadQuotePdf } from "@/lib/pdf/generateQuotePdf";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Quote = {
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

type Product = {
  id: string;
  name: string;
  unit_price: number;
};

type QuoteItem = {
  product_id: string;
  name: string;
  description: string;
  quantity: number;
  unit_price: number;
};

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Borrador", color: "bg-slate-500/10 text-slate-500" },
  SENT: { label: "Enviada", color: "bg-blue-500/10 text-blue-500" },
  ACCEPTED: { label: "Aceptada", color: "bg-emerald-500/10 text-emerald-500" },
  REJECTED: { label: "Rechazada", color: "bg-destructive/10 text-destructive" },
};

export default function QuotesPage() {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const { profile } = useUserRole();
  const canWrite = profile ? hasMinRole(profile.role, "USER") : false;
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [items, setItems] = useState<QuoteItem[]>([]);
  
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("MedStock");

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("quotes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) setError(friendlyError(error.message));
    else setQuotes(data ?? []);
    setLoading(false);
  }, [supabase]);

  const fetchProducts = useCallback(async () => {
    const { data } = await supabase
      .from("products")
      .select("id, name, unit_price")
      .order("name");
    setProducts(data ?? []);
  }, [supabase]);

  const fetchOrgName = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    if (!profile) return;
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", profile.organization_id)
      .single();
    if (org) setOrgName(org.name);
  }, [supabase]);

  useEffect(() => {
    fetchQuotes();
    fetchProducts();
    fetchOrgName();
  }, [fetchQuotes, fetchProducts, fetchOrgName]);

  function openCreate() {
    setModalMode("create");
    setEditingQuote(null);
    setItems([]);
    setError(null);
    setShowModal(true);
  }

  async function openEdit(quote: Quote) {
    setLoading(true);
    setModalMode("edit");
    setEditingQuote(quote);
    setError(null);
    setShowModal(true);
    
    // Fetch items
    const { data: qItems } = await supabase
      .from("quote_items")
      .select("product_id, quantity, unit_price, description, products(name)")
      .eq("quote_id", quote.id);
      
    if (qItems) {
      setItems(qItems.map(i => ({
        product_id: i.product_id,
        name: (i.products as any)?.name ?? "Producto",
        description: i.description || "",
        quantity: i.quantity,
        unit_price: i.unit_price
      })));
    } else {
      setItems([]);
    }
    setLoading(false);
  }

  async function handleDelete(quote: Quote) {
    if (!window.confirm(`¿Seguro que deseas eliminar la cotización #${quote.quote_number}?`)) return;
    setLoading(true);
    const res = await deleteQuote(quote.id);
    if (res.ok) {
      await fetchQuotes();
    } else {
      setError(res.error);
    }
    setLoading(false);
  }

  function addItem() {
    setItems([
      ...items,
      {
        product_id: "",
        name: "",
        description: "",
        quantity: 1,
        unit_price: 0,
      },
    ]);
  }

  function updateItem(index: number, field: string, value: string | number) {
    const updated = [...items];
    if (field === "product_id") {
      const product = products.find((p) => p.id === value);
      if (product) {
        updated[index] = {
          ...updated[index],
          product_id: product.id,
          name: product.name,
          unit_price: product.unit_price,
        };
      }
    } else if (field === "quantity") {
      updated[index].quantity = Number(value);
    } else if (field === "unit_price") {
      updated[index].unit_price = Number(value);
    } else if (field === "description") {
      updated[index].description = value as string;
    }
    setItems(updated);
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const subtotal = Math.round(total / 1.19);
  const iva = total - subtotal;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (items.length === 0) {
      setError("Agrega al menos un producto a la cotización.");
      return;
    }
    if (items.some(i => !i.product_id)) {
      setError("Por favor, selecciona un producto en todas las líneas.");
      return;
    }

    setSaving(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    // Auto-calculate valid_until: 15 days from today
    const validUntilDate = new Date();
    validUntilDate.setDate(validUntilDate.getDate() + 15);
    const validUntil = validUntilDate.toISOString().split("T")[0];

    const payload = {
      client_name: formData.get("client_name") as string,
      client_email: (formData.get("client_email") as string) || null,
      client_phone: (formData.get("client_phone") as string) || null,
      client_rut: (formData.get("client_rut") as string) || null,
      notes: (formData.get("notes") as string) || null,
      valid_until: modalMode === "edit" ? (editingQuote?.valid_until ?? validUntil) : validUntil,
      total_amount: total,
    };

    const quotePayload = {
      client_name: payload.client_name,
      client_email: payload.client_email,
      client_phone: payload.client_phone,
      client_rut: payload.client_rut,
      notes: payload.notes,
      items: items.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        description: item.description || null,
      })),
    };

    if (modalMode === "create") {
      const res = await createQuote(quotePayload);
      if (!res.ok) { setError(res.error); setSaving(false); return; }
      setShowModal(false);
      await fetchQuotes();
    } else if (modalMode === "edit" && editingQuote) {
      const res = await updateQuote(editingQuote.id, {
        ...quotePayload,
        valid_until: editingQuote.valid_until,
      });
      if (!res.ok) { setError(res.error); setSaving(false); return; }
      setShowModal(false);
      await fetchQuotes();
    }

    setSaving(false);
  }

  async function handleDownloadPdf(quote: Quote) {
    const { data: qItems } = await supabase
      .from("quote_items")
      .select("quantity, unit_price, description, products(name)")
      .eq("quote_id", quote.id);

    downloadQuotePdf({
      quoteNumber: quote.quote_number,
      clientName: quote.client_name,
      clientEmail: quote.client_email,
      clientPhone: quote.client_phone,
      clientRut: quote.client_rut,
      createdAt: quote.created_at,
      validUntil: quote.valid_until,
      notes: quote.notes,
      organizationName: orgName,
      items: (qItems ?? []).map((i) => ({
        name: (i.products as unknown as { name: string } | null)?.name ?? "Producto",
        description: i.description,
        quantity: i.quantity,
        unitPrice: Number(i.unit_price),
      })),
    });
  }

  async function handleSendEmail(quote: Quote) {
    if (!quote.client_email) {
      alert("Esta cotización no tiene email de cliente registrado.");
      return;
    }

    setSendingId(quote.id);

    const { data: qItems } = await supabase
      .from("quote_items")
      .select("quantity, unit_price, description, products(name)")
      .eq("quote_id", quote.id);

    const { quoteToBase64 } = await import("@/lib/pdf/generateQuotePdf");
    const pdfBase64 = quoteToBase64({
      quoteNumber: quote.quote_number,
      clientName: quote.client_name,
      clientEmail: quote.client_email,
      clientPhone: quote.client_phone,
      clientRut: quote.client_rut,
      createdAt: quote.created_at,
      validUntil: quote.valid_until,
      notes: quote.notes,
      organizationName: orgName,
      items: (qItems ?? []).map((i) => ({
        name: (i.products as unknown as { name: string } | null)?.name ?? "Producto",
        description: i.description,
        quantity: i.quantity,
        unitPrice: Number(i.unit_price),
      })),
    });

    // I1: Use getUser() to validate the session server-side, not getSession()
    const { data: { user: emailUser } } = await supabase.auth.getUser();
    if (!emailUser) {
      alert("Tu sesión expiró. Inicia sesión nuevamente.");
      setSendingId(null);
      return;
    }
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
      await fetchQuotes();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(`Error al enviar: ${err.error ?? res.statusText}`);
    }
    setSendingId(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cotizaciones</h1>
          <p className="text-muted-foreground mt-1">
            Genera y envía cotizaciones profesionales desde tu catálogo
          </p>
        </div>
        {canWrite && (
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" />
            Nueva Cotización
          </Button>
        )}
      </div>

      {error && !showModal && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N°</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-center">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : quotes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <p className="text-muted-foreground text-sm">No hay cotizaciones creadas.</p>
                  </TableCell>
                </TableRow>
              ) : (
                quotes.map((quote) => {
                  const cfg = STATUS_CFG[quote.status] ?? STATUS_CFG.DRAFT;
                  const isSending = sendingId === quote.id;
                  return (
                    <TableRow key={quote.id} className="group">
                      <TableCell className="font-mono text-muted-foreground">
                        #{String(quote.quote_number ?? "—").padStart(4, "0")}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{quote.client_name}</p>
                        {quote.client_email && (
                          <p className="text-xs text-muted-foreground">{quote.client_email}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ${cfg.color}`}>
                          {cfg.label}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">
                        {Number(quote.total_amount).toLocaleString("es-CL", { style: "currency", currency: "CLP" })}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(quote.created_at).toLocaleDateString("es-CL")}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.push(`/dashboard/quotes/${quote.id}`)}
                            title="Ver detalle"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {canWrite && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEdit(quote)}
                              title="Editar"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}
                          {canWrite && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(quote)}
                              title="Eliminar"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDownloadPdf(quote)}
                            title="Descargar PDF"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleSendEmail(quote)}
                            disabled={isSending || !quote.client_email}
                            title={quote.client_email ? "Enviar por email" : "Sin email registrado"}
                          >
                            {isSending ? (
                              <span className="w-4 h-4 border border-current border-t-transparent rounded-full animate-spin inline-block" />
                            ) : (
                              <Mail className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-[700px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {modalMode === 'create' ? 'Nueva Cotización' : 'Editar Cotización'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6 py-4">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-4 p-4 rounded-xl bg-muted/30 border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Datos del cliente</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1 space-y-2">
                  <Label>Nombre *</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      name="client_name"
                      defaultValue={editingQuote?.client_name ?? ""}
                      required
                      placeholder="Hospital San Juan"
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="col-span-2 sm:col-span-1 space-y-2">
                  <Label>RUT</Label>
                  <Input
                    name="client_rut"
                    defaultValue={editingQuote?.client_rut ?? ""}
                    placeholder="76.123.456-7"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      name="client_phone"
                      defaultValue={editingQuote?.client_phone ?? ""}
                      placeholder="+56 9 1234 5678"
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <div className="relative">
                    <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      name="client_email"
                      defaultValue={editingQuote?.client_email ?? ""}
                      type="email"
                      placeholder="contacto@cliente.cl"
                      className="pl-9"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Vigencia se calcula automáticamente: 15 días desde la fecha de emisión */}

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Productos *</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addItem}
                  className="h-8 gap-1 text-primary"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Agregar línea
                </Button>
              </div>

              {items.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm border border-dashed rounded-xl">
                  <FileText className="w-6 h-6 mx-auto mb-2 opacity-50" />
                  Agrega productos para generar la cotización
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item, idx) => (
                    <div key={idx} className="rounded-xl bg-muted/20 border p-3 space-y-3">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                        <Select
                          value={item.product_id}
                          onValueChange={(val) => updateItem(idx, "product_id", val as string)}
                        >
                          <SelectTrigger className="flex-1 min-w-[200px]">
                            <SelectValue placeholder="Seleccionar producto...">
                              {(val: string | null) => {
                                if (!val) return "Seleccionar producto...";
                                const p = products.find((pr) => pr.id === val);
                                return p ? p.name : val;
                              }}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                            className="w-20 text-center"
                            placeholder="Cant."
                          />
                          <Input
                            type="number"
                            step="1"
                            value={item.unit_price}
                            onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                            className="w-28 text-right"
                            placeholder="Precio"
                          />
                          <span className="text-sm font-medium w-28 text-right shrink-0">
                            {(item.quantity * item.unit_price).toLocaleString("es-CL", { style: "currency", currency: "CLP" })}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(idx)}
                            className="text-muted-foreground hover:text-destructive shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      <Input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateItem(idx, "description", e.target.value)}
                        placeholder="Descripción adicional (opcional)"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {items.length > 0 && (
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 space-y-1.5">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Neto (sin IVA)</span>
                  <span>{subtotal.toLocaleString("es-CL", { style: "currency", currency: "CLP" })}</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>IVA incluido (19%)</span>
                  <span>{iva.toLocaleString("es-CL", { style: "currency", currency: "CLP" })}</span>
                </div>
                <div className="flex justify-between text-base font-bold pt-1 border-t border-primary/10 mt-2">
                  <span>Total (IVA incluido)</span>
                  <span>{total.toLocaleString("es-CL", { style: "currency", currency: "CLP" })}</span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <StickyNote className="w-4 h-4" /> Notas u observaciones
              </Label>
              <Textarea
                name="notes"
                defaultValue={editingQuote?.notes ?? ""}
                rows={2}
                placeholder="Plazo de entrega, condiciones especiales..."
                className="resize-none"
              />
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                {modalMode === 'create' ? 'Crear Cotización' : 'Guardar Cambios'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
