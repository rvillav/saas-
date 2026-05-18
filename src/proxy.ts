import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// ── Route → Minimum role mapping ─────────────────────────────
// Roles hierarchy: SUPER_ADMIN(4) > ADMIN(3) > USER(2) > VIEWER(1)
const ROLE_LEVEL: Record<string, number> = {
  SUPER_ADMIN: 4,
  ADMIN: 3,
  USER: 2,
  VIEWER: 1,
};

type ProtectedRoute = {
  /** Path prefix to match (e.g. "/dashboard/admin") */
  path: string;
  /** Minimum role required to access this route */
  minRole: string;
};

/**
 * Define routes that require a role higher than the default (authenticated).
 * Routes not listed here only require authentication.
 */
const PROTECTED_ROUTES: ProtectedRoute[] = [
  { path: "/dashboard/admin", minRole: "ADMIN" },
  // Add more protected routes here as needed:
  // { path: "/dashboard/settings", minRole: "ADMIN" },
];

/**
 * Public paths that don't require authentication.
 */
const PUBLIC_PATHS = ["/login", "/auth"];

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Do not add logic between createServerClient and supabase.auth.getUser().
  // A simple mistake could make it very hard to debug issues with users being randomly logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // ── 1. Unauthenticated → redirect to login (except public paths) ──
  if (!user && !PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // ── 2. Role-based route protection ───────────────────────────────
  if (user) {
    // Check if the current path matches any protected route
    const matchedRoute = PROTECTED_ROUTES.find((route) =>
      pathname.startsWith(route.path)
    );

    if (matchedRoute) {
      // Fetch user role from the database
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();

      const userRole = profile?.role ?? "VIEWER";
      const userLevel = ROLE_LEVEL[userRole] ?? 0;
      const requiredLevel = ROLE_LEVEL[matchedRoute.minRole] ?? 99;

      if (userLevel < requiredLevel) {
        // Insufficient permissions → redirect to dashboard with denied flag
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        url.searchParams.set("denied", "1");
        return NextResponse.redirect(url);
      }
    }
  }

  // IMPORTANT: You *must* return the supabaseResponse object as is.
  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
