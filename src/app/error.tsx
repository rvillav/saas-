"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({
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
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertCircle className="h-6 w-6 text-destructive" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">Algo salió mal</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Ocurrió un error inesperado. Por favor, intenta nuevamente.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground/50 mt-2 font-mono">
            Ref: {error.digest}
          </p>
        )}
      </div>
      <Button onClick={reset} variant="outline" size="sm">
        Reintentar
      </Button>
    </div>
  );
}
