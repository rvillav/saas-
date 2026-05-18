# MedStock — SaaS de Gestión Médica Multi-Tenant

Plataforma SaaS para gestión de inventario, ventas, arriendo de equipos y cotizaciones para empresas del rubro médico. Arquitectura multi-tenant con control de acceso por roles.

---

## Estado del Proyecto (checkpoint: 2026-04-17)

### Módulos implementados y funcionales

| Módulo | Ruta | Estado |
|---|---|---|
| Auth (login/signup) | `/login`, `/signup` | Completo |
| Email confirmation | `/auth/confirm` | Completo |
| Dashboard resumen | `/dashboard` | Completo |
| Productos / Inventario | `/dashboard/products` | Completo |
| Movimientos de stock | `/dashboard/movements` | Completo |
| Ventas | `/dashboard/sales` | Completo |
| Cotizaciones | `/dashboard/quotes` | Completo |
| Detalle cotización + PDF | `/dashboard/quotes/[id]` | Completo |
| Arriendos | `/dashboard/rentals` | Completo |
| Panel admin (usuarios) | `/dashboard/admin` | Completo |

### Lo que hace cada módulo

**Dashboard** — 6 tarjetas KPI (productos, movimientos, cotizaciones, arriendos activos, ventas mensuales, stock bajo), lista de movimientos recientes.

**Productos** — CRUD con categorías (Mascarilla, CPAP, Tubo Calefaccionado, Otros), SKU, precio con IVA, stock actual. Indicadores de stock: rojo <5, ámbar <20, verde ≥20.

**Movimientos** — Registro de entradas/salidas de inventario con auditoría (producto, tipo, cantidad, notas, timestamp). Actualiza stock automáticamente.

**Ventas** — Crear ventas multi-ítem, validación de stock, auto-decremento, registro de movimiento OUT. Datos cliente (nombre, RUT, email, teléfono), métodos de pago (efectivo, transferencia, tarjeta, cheque). Calcula subtotal + IVA 19%.

**Cotizaciones** — Crear cotizaciones multi-ítem, preview HTML, descarga PDF (jsPDF), envío por email (Supabase Functions), seguimiento de estado (DRAFT → SENT → ACCEPTED/REJECTED).

**Arriendos** — Gestión de arriendos por día, tarifa diaria, fechas de inicio/devolución esperada, confirmación de devolución (restaura stock), estados (ACTIVE, RETURNED, OVERDUE, CANCELLED).

**Admin** — Gestión de usuarios y roles de la organización, tabla de permisos por rol, búsqueda de usuarios.

---

## Stack Técnico

| Tecnología | Versión | Uso |
|---|---|---|
| Next.js | 16.2.3 | Framework principal (App Router) |
| React | 19.2.4 | UI |
| TypeScript | 5 | Lenguaje |
| Tailwind CSS | 4 | Estilos |
| Supabase | 2.103.0 | DB (PostgreSQL) + Auth |
| @supabase/ssr | 0.10.2 | SSR cookies/session |
| jsPDF | 4.2.1 | Generación PDF |
| jsPDF-AutoTable | 5.0.7 | Tablas en PDF |
| Lucide React | 1.8.0 | Íconos |

---

## Estructura de Archivos

```
src/
├── app/
│   ├── page.tsx                    # Redirige a /dashboard
│   ├── layout.tsx                  # Root layout (Geist fonts, lang=es)
│   ├── globals.css                 # Estilos globales
│   ├── actions/auth.ts             # Server Actions: login, signup, signout
│   ├── auth/confirm/route.ts       # Callback verificación email OTP
│   ├── login/page.tsx              # Formulario login
│   ├── signup/page.tsx             # Formulario registro + org
│   └── dashboard/
│       ├── layout.tsx              # Shell: sidebar + topbar + RoleProvider
│       ├── page.tsx                # Dashboard principal (KPIs + movimientos)
│       ├── products/page.tsx       # CRUD productos
│       ├── movements/page.tsx      # Movimientos de inventario
│       ├── sales/page.tsx          # Ventas
│       ├── quotes/page.tsx         # Listado cotizaciones
│       ├── quotes/[id]/page.tsx    # Detalle + preview + PDF cotización
│       ├── rentals/page.tsx        # Arriendos
│       └── admin/page.tsx          # Panel administrador
├── components/
│   └── RoleProvider.tsx            # Context + useUserRole() + RoleGate + RoleBadge
├── lib/
│   ├── supabase/
│   │   ├── client.ts               # createBrowserClient()
│   │   └── server.ts               # createServerClient() con cookies
│   ├── pdf/
│   │   └── generateQuotePdf.ts     # generateQuotePdf(), downloadQuotePdf(), quoteToBase64()
│   ├── roles.ts                    # AppRole, ROLE_HIERARCHY, hasMinRole(), canWrite(), canManageOrg()
│   └── utils.ts                    # cn() helper (clsx + tailwind-merge)
└── proxy.ts                        # Middleware: protección de rutas por rol
```

---

## Base de Datos (Supabase / PostgreSQL)

### Tablas inferidas

| Tabla | Campos principales |
|---|---|
| `organizations` | id, name |
| `users` | id, full_name, email, role, organization_id, created_at |
| `products` | id, name, sku, description, unit_price, current_stock, category, organization_id |
| `inventory_movements` | id, product_id, organization_id, type (IN/OUT), quantity, user_id, notes, created_at |
| `sales` | id, sale_number, client_name, client_rut, client_email, client_phone, payment_method, subtotal, tax_amount, total_amount, status, notes, organization_id, created_at |
| `sale_items` | sale_id, product_id, quantity, unit_price |
| `quotes` | id, quote_number, client_name, client_rut, client_email, client_phone, status, total_amount, valid_until, notes, organization_id, created_at |
| `quote_items` | quote_id, product_id, quantity, unit_price, description |
| `rentals` | id, product_id, organization_id, client_name, client_rut, client_phone, client_email, quantity, daily_rate, start_date, expected_return_date, actual_return_date, status, notes, created_at, updated_at |

Row Level Security (RLS) activo — políticas filtran por `organization_id`.

---

## Sistema de Roles

```
VIEWER (1) → USER (2) → ADMIN (3) → SUPER_ADMIN (4)
```

| Acción | VIEWER | USER | ADMIN | SUPER_ADMIN |
|---|---|---|---|---|
| Ver datos | ✓ | ✓ | ✓ | ✓ |
| Crear/editar | — | ✓ | ✓ | ✓ |
| Panel admin | — | — | ✓ | ✓ |
| Gestión global | — | — | — | ✓ |

Helpers en `src/lib/roles.ts`: `hasMinRole()`, `canWrite()`, `canManageOrg()`, `isSuperAdmin()`.

---

## Seguridad

- **Middleware** (`src/proxy.ts`): Protege rutas por rol antes de renderizar. `/dashboard/admin` requiere ADMIN+. Rutas públicas: `/login`, `/signup`, `/auth`.
- **Security Headers** (`next.config.ts`): X-Frame-Options DENY, HSTS 2 años, nosniff, Permissions-Policy.
- **RLS Supabase**: Políticas a nivel de tabla por `organization_id`.

---

## Variables de Entorno

```env
NEXT_PUBLIC_SUPABASE_URL=https://gyygadcndwppgcsfvdwh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ver .env.local>
```

---

## Comandos

```bash
npm run dev      # Servidor de desarrollo en http://localhost:3000
npm run build    # Build de producción
npm start        # Servidor de producción
npm run lint     # ESLint
```

---

## Pendientes / Áreas de mejora conocidas

- Envío de emails (cotizaciones) depende de Supabase Functions — endpoint referenciado pero no mostrado en el código fuente del repo.
- No hay tests automatizados.
- Editar stock directamente en Productos **no** crea movimiento de inventario — solo el módulo Movimientos genera auditoría.
- Multi-tenancy a nivel de aplicación; verificar que RLS esté correctamente configurado en Supabase para cada tabla.
