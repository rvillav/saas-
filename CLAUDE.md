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
│   └── requests/page.tsx       Solicitudes de producto
└── actions/
    ├── auth.ts
    ├── sales.ts
    ├── quotes.ts
    ├── rentals.ts
    ├── products.ts
    └── movements.ts
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
- Migraciones en `supabase/migrations/`. Nunca modificar SQL directamente en prod sin migración.

## Convenciones de código

- **Server Actions**: validar input con Zod antes de cualquier operación DB.
- **Errores**: usar `src/lib/errors.ts`. Errores inesperados capturar con `Sentry.captureException`.
- **PDF**: generadores en `src/lib/pdf/`. No mezclar lógica de negocio con generación PDF.
- **Componentes UI**: usar exclusivamente los de `src/components/ui/` (shadcn/ui).
- **Clases CSS**: usar `cn()` de `src/lib/utils.ts` (tailwind-merge + clsx).
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

## Módulos pendientes / en desarrollo

- Paginación en listas (sales, quotes, rentals, movements) — actualmente sin límite.
- Deploy: GitHub privado → Vercel → dominio custom + CI/CD con GitHub Actions.
- Sentry DSN pendiente de configurar en `.env.local`.
