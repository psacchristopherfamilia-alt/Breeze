"use client";

/**
 * Último recurso: falla el diseño raíz. No hay proveedor de idioma ni estilos de la app,
 * así que el texto va en los dos idiomas y con estilos propios.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", background: "#eefbfa", color: "#0b2e36", fontFamily: "system-ui, sans-serif", textAlign: "center", padding: 24 }}>
        <main style={{ maxWidth: 380 }}>
          <p style={{ fontSize: 44, fontWeight: 800, color: "#2bb3b1", margin: 0 }}>Breeze</p>
          <h1 style={{ fontSize: 22, margin: "12px 0 6px" }}>Something went wrong on our side</h1>
          <p style={{ margin: 0, opacity: 0.75 }}>Algo falló de nuestro lado. Your data is safe · Tus datos están a salvo.</p>
          <button onClick={reset} style={{ marginTop: 22, width: "100%", padding: "13px 16px", border: 0, borderRadius: 16, background: "#0e7c86", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
            Try again · Intentar de nuevo
          </button>
        </main>
      </body>
    </html>
  );
}
