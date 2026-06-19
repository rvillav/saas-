@AGENTS.md

# MedStock — SaaS de Gestión Médica

Multi-tenant SaaS para gestión de inventario médico, ventas, cotizaciones y arriendos. Marca: **CPAP Osorno**.

## Stack

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 16.2.3 (App Router) |
| UI | React 19, Tailwind CSS v4, shadcn/ui (base-nova) |
| Backend | Supabase (Auth + Postgres + RLS + SSR 0.10.2) |
| Validación | Zod 4.4.2 |
| Rate limiting | Upstash Redis + @upstash/ratelimit |
| Observability | Sentry (@sentry/nextjs 10.x) |
| PDF | jsPDF + jspdf-autotable |
| Gráficos | recharts 3.x |
| TypeScript | v5, strict mode, alias `@/*` → `./src/*` |

## Arquitectura

- **App Router** con Server Components por defecto. Mutations exclusivamente via **Server Actions** en `src/app/actions/`.
- **Middleware** en `src/proxy.ts` (no `middleware.ts`): maneja sesión Supabase SSR, rate limiting y RBAC.
- **Multi-tenant** con `org_id` en todas las tablas. Aislamiento enforced por RLS en Postgres.
- **Autenticación** por email/password con Supabase Auth. Callback en `src/app/auth/confirm/route.ts`.

## Roles

Definidos en `src/lib/roles.ts`:

```
VIEWER(1) → USER(2) → ADMIN(3) → SUPER_ADMIN(4)
```

- `/dashboard/admin` requiere mínimo ADMIN.
- Redirige a `/dashboard?denied=1` si el rol es insuficiente.
- Usar los helpers de `roles.ts`, nunca comparar valores numéricos directamente.

## Estructura de rutas

```
src/app/
├── page.tsx                    Landing/root
├── login/page.tsx              Login
├── auth/confirm/route.ts       Callback email confirmation
├── api/health/route.ts         Health check
├── dashboard/
│   ├── layout.tsx              Layout protegido
│   ├── page.tsx                Dashboard home
│   ├── admin/page.tsx          Panel admin (ADMIN+)
│   ├── sales/page.tsx          Ventas
│   ├── quotes/page.tsx         Cotizaciones
│   ├── quotes/[id]/page.tsx    Detalle cotización
│   ├── rentals/page.tsx        Arriendos
│   ├── products/page.tsx       Inventario productos
│   ├── movements/page.tsx      Movimientos de inventario
│   ├── cashbox/page.tsx        Caja
│   ├── cashbox/transactions/   Transacciones de caja
│   ├── requests/page.tsx       Solicitudes de producto
│   ├── loans/page.tsx          Préstamos de insumos
│   ├── expenses/page.tsx       Gastos y pagos
│   ├── purchases/page.tsx      Facturas de compra (Client Component)
│   └── reports/                Reportes (Server Component)
│       ├── page.tsx            Resumen mensual + anual por categoría
│       ├── ReportCharts.tsx    Gráficos recharts (Client Component)
│       └── ReportFilters.tsx   Selectores mes/año (Client Component)
└── actions/
    ├── auth.ts
    ├── sales.ts
    ├── quotes.ts
    ├── rentals.ts
    ├── products.ts
    ├── movements.ts
    ├── loans.ts
    └── purchases.ts
```

## Clientes Supabase

- **Browser:** `src/lib/supabase/client.ts` — usar en Client Components.
- **Server:** `src/lib/supabase/server.ts` — usar en Server Components, Server Actions y Route Handlers.
- Nunca crear clientes fuera de estas dos rutas.

## Base de datos

- Moneda: **CLP** (pesos chilenos). IVA: **19%**.
- RLS forzado en todas las tablas (`FORCE ROW LEVEL SECURITY`).
- Políticas UPDATE con `WITH CHECK` para prevenir org_id hijacking.
- RPCs `SECURITY DEFINER` con validación de org ownership:
  - `create_sale()`, `delete_sale()`, `create_rental()`, `return_rental()`
  - `create_loan()`, `return_loan()`
  - `create_purchase_invoice()`, `cancel_purchase_invoice()`
- Migraciones en `supabase/migrations/`. Nunca modificar SQL directamente en prod sin migración.

## Convenciones de código

- **Server Actions**: validar input con Zod antes de cualquier operación DB.
- **Errores**: usar `src/lib/errors.ts`. Errores inesperados capturar con `Sentry.captureException`.
- **PDF**: generadores en `src/lib/pdf/`. No mezclar lógica de negocio con generación PDF.
- **Componentes UI**: usar exclusivamente los de `src/components/ui/` (shadcn/ui).
- **Clases CSS**: usar `cn()` de `src/lib/utils.ts` (tailwind-merge + clsx).
- **Gráficos**: usar recharts 3.x. `ValueType = number | string | ReadonlyArray<number | string>` — los formatters deben manejar el caso array. Para tooltips custom usar `(props: any)` como tipo del componente (incompatibilidad de tipos internos de recharts 3.x con `readonly`).
- No agregar comentarios salvo que el "por qué" sea no obvio.

## Variables de entorno

Ver `.env.example` para la lista completa. Variables clave:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

## Rate limiting (src/proxy.ts)

- Auth paths (`/auth/*`, `/login`): 10 req/min
- Rutas generales: 200 req/min
- Implementado con Upstash Redis.

## Seguridad (CSP)

Configurado en `next.config.ts` con `withSentryConfig`. Incluye dominios Supabase e ingest.sentry.io. En dev permite `unsafe-eval`; en prod no.

## Módulo de Facturas de Compra (`/dashboard/purchases`)

- **Flujo**: crear factura con proveedor + ítems (precio compra IVA inc.) → stock sube automáticamente → en bodega se fija el precio de venta (`products.unit_price`).
- **Tablas**: `purchase_invoices` (cabecera) + `purchase_invoice_items` (líneas). Ambas con RLS por `organization_id`.
- **Campo `products.purchase_price`**: actualizado por el RPC con el último precio de compra unitario; sirve de referencia al fijar el precio de venta en bodega.
- **`create_purchase_invoice()` RPC**: atómico — crea factura, por cada ítem incrementa `current_stock`, actualiza `purchase_price` e inserta movimiento `IN`.
- **`cancel_purchase_invoice()` RPC**: valida stock suficiente antes de revertir, luego decrementa stock e inserta movimientos `OUT`, marca factura como `CANCELLED`.
- **Cálculo IVA**: precios de compra son IVA incluido → neto = `round(total / 1.19, 0)`, IVA = `total - neto`.
- **Roles**: creación USER+, anulación solo ADMIN+.
- **UI**: tabla expandible (click fila → sub-tabla de ítems con desglose IVA), dialog de creación con editor de líneas dinámico, stats mensuales (facturas, monto invertido, unidades).
- **Select `onValueChange`**: en este proyecto retorna `string | null` — usar `v ?? ""` al asignar.

## Módulo de Reportes (`/dashboard/reports`)

- **Filtros**: año y mes via `searchParams` (URL); el Server Component los lee con `await searchParams`.
- **Datos mensuales**: join `sales → sale_items → products` filtrando por `status = COMPLETED` y rango de fechas. Agrupación por `products.category`.
- **Serie de tiempo anual**: misma query con rango año completo; cada punto del array `MonthlyPoint` tiene campos `MASCARILLA | CPAP | TUBO_CALEFACCIONADO | OTROS` (ingresos por categoría calculados desde `item.quantity * item.unit_price`).
- **Categorías de producto**: `MASCARILLA`, `CPAP`, `TUBO_CALEFACCIONADO`, `OTROS` (enum en DB, mismo valor en código).
- **Gráficos**: pie chart distribución, bar chart por categoría, horizontal bars top-5 por categoría, area chart serie anual.
- La columna `total` en la tabla anual usa `sales.total_amount` (valor oficial con IVA); el desglose por categoría usa `item.quantity * item.unit_price` (pueden diferir levemente por redondeo).

## Módulos pendientes / en desarrollo

- Paginación en listas (sales, quotes, rentals, movements) — actualmente sin límite.
- Deploy: GitHub privado → Vercel → dominio custom + CI/CD con GitHub Actions.
- Sentry DSN pendiente de configurar en `.env.local`.
