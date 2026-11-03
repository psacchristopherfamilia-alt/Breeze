export type Channel = "whatsapp" | "sms" | "email";
export type Kind = "confirmation" | "reminder" | "cancellation" | "reschedule";

/** Lo que devuelve claim_notification_jobs() para cada mensaje. */
export interface JobPayload {
  job_id: string;
  kind: Kind;
  channel: Channel;
  locale: "en" | "es";
  attempts: number;
  link_token: string | null;
  customer: { first_name: string; phone: string | null; email: string | null; whatsapp_opt_in: boolean };
  salon: { name: string; slug: string; phone: string | null; address: string | null; cancellation_window_hours: number };
  items: { service_name_en: string; service_name_es: string; starts_at: string; ends_at: string; professional: string }[];
}

export interface RenderedMessage {
  subject: string;
  text: string;
  html: string;
}

export interface Provider {
  /** Nombre que se guarda en notification_jobs.provider (console, resend, twilio). */
  name: string;
  channel: Channel;
  send(to: string, message: RenderedMessage): Promise<{ id: string }>;
}

export type ProviderSet = Partial<Record<Channel, Provider>>;
