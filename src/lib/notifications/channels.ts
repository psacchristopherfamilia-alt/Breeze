/**
 * Qué canales de recordatorio se ofrecen al cliente. Solo se promete lo que de verdad se envía:
 * hoy el correo (Resend); WhatsApp se enciende con NEXT_PUBLIC_WHATSAPP_REMINDERS=on cuando haya remitente
 * y plantillas aprobadas. Es una variable PÚBLICA (se lee en el navegador).
 */
export const WHATSAPP_REMINDERS = process.env.NEXT_PUBLIC_WHATSAPP_REMINDERS === "on";
