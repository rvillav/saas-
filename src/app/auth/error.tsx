"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertCircle className="h-6 w-6 text-destructive" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">Error de autenticación</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Hubo un problema durante el proceso de inicio de sesión.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={reset} variant="outline" size="sm">
          Reintentar
        </Button>
        <a
          href="/login"
          className="inline-flex items-center justify-center h-9 px-3 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          Ir al login
        </a>
      </div>
    </div>
  );
}
