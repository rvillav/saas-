"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalErrorBoundary({
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
    <html lang="es">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#09090b",
          color: "#fafafa",
          padding: "2rem",
          textAlign: "center",
          margin: 0,
        }}
      >
        <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>⚠️</div>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>
          Error crítico
        </h1>
        <p style={{ fontSize: "0.875rem", color: "#a1a1aa", marginBottom: "1.5rem" }}>
          No pudimos cargar la aplicación. Por favor, recarga la página.
        </p>
        {error.digest && (
          <p
            style={{
              fontSize: "0.75rem",
              color: "#52525b",
              fontFamily: "monospace",
              marginBottom: "1.5rem",
            }}
          >
            Ref: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          style={{
            padding: "0.5rem 1.5rem",
            borderRadius: "0.5rem",
            border: "1px solid #27272a",
            background: "transparent",
            color: "#fafafa",
            cursor: "pointer",
            fontSize: "0.875rem",
          }}
        >
          Reintentar
        </button>
      </body>
    </html>
  );
}
