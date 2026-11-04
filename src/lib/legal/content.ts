import type { LegalDocId } from "./config";

/**
 * Textos legales (BORRADOR). `{company}`, `{email}` y `{law}` se sustituyen con LEGAL (config.ts).
 * Describen lo que Breeze hace HOY; si cambia el producto (analítica, nuevos proveedores…), hay que actualizarlos.
 */
export interface LegalSection {
  id: string;
  heading: string;
  body: string[];
}
export interface LegalDoc {
  title: string;
  intro: string;
  sections: LegalSection[];
}
type Locale = "en" | "es";

export const DRAFT_NOTICE: Record<Locale, string> = {
  en: "Draft: pending legal review. Items in [brackets] will be completed before launch.",
  es: "Borrador: pendiente de revisión legal. Los datos entre [corchetes] se completarán antes del lanzamiento.",
};

export const LEGAL_LABELS: Record<Locale, { updated: string; contents: string; others: string; docs: Record<LegalDocId, string> }> = {
  en: { updated: "Last updated", contents: "Contents", others: "Other documents", docs: { privacy: "Privacy Policy", terms: "Terms of Use", "business-terms": "Business Terms" } },
  es: { updated: "Última actualización", contents: "Contenido", others: "Otros documentos", docs: { privacy: "Política de privacidad", terms: "Términos de uso", "business-terms": "Términos para negocios" } },
};

const privacy: Record<Locale, LegalDoc> = {
  en: {
    title: "Privacy Policy",
    intro: "Breeze is a booking platform for barbershops, salons and spas in the Turks and Caicos Islands, operated by {company} (\"Breeze\", \"we\"). This policy explains what personal data we handle, why, and what your choices are.",
    sections: [
      { id: "data", heading: "1. What data we collect", body: [
        "If you book as a client (with or without an account): your first and last name, mobile number, email (optional), preferred language, whether you accept WhatsApp reminders, and the details of your bookings (business, service, professional, date and time, price).",
        "If you create an account: your email and a password (we never see it in clear text), plus the details above.",
        "If you register a business or join a team: your name, email, mobile number, role, and the business information you enter (name, address, phone, services, prices, working hours). We also keep billing records (invoices and payments) for the plan.",
        "Businesses may add notes or no-show records to their own client records.",
      ] },
      { id: "why", heading: "2. Why we use it", body: [
        "To create, show, change and cancel bookings; to send confirmations and reminders by SMS, WhatsApp or email; to run your account and your business's agenda; to prevent fake bookings and abuse; and to bill businesses for their plan.",
        "We do not sell personal data and we do not use it for advertising.",
      ] },
      { id: "sharing", heading: "3. Who sees it", body: [
        "The business you book with sees your name, phone, email and booking history with them. Businesses cannot see your bookings with other businesses.",
        "Breeze Live (the screen in a salon) shows only your first name and the initial of your last name, the service and the time. Never your phone number or email.",
        "Public booking pages show professionals as first name plus the initial of their last name.",
      ] },
      { id: "providers", heading: "4. Service providers", body: [
        "We use trusted providers to run Breeze: Supabase (database and sign-in), Vercel (hosting), Twilio (SMS and WhatsApp), Resend (email) and Cloudflare Turnstile (security check on guest bookings). They process data only to provide their service to us. Some of them may process data outside the Turks and Caicos Islands.",
      ] },
      { id: "device", heading: "5. Cookies and your device", body: [
        "We use only what is needed for Breeze to work: a sign-in session if you have an account, your language choice, and, if you book as a guest, a private booking link saved on your device so you can see \"My bookings\". At the time of writing we do not use advertising or analytics trackers.",
        "Clearing your browser data removes the saved guest bookings from that device (you can still use the private link we send you).",
      ] },
      { id: "messages", heading: "6. Messages and WhatsApp", body: [
        "We send booking confirmations, reminders and notices about changes or cancellations. WhatsApp reminders are sent only if you accept them when booking; you can stop them at any time by replying STOP or telling the business or us.",
      ] },
      { id: "keep", heading: "7. How long we keep it", body: [
        "While your account or your relationship with a business is active, and as long as needed for bookings, billing and legal obligations. If a business closes its account, its data is kept for a reasonable period and then deleted or anonymised. You can ask us to delete your data at any time.",
      ] },
      { id: "rights", heading: "8. Your rights", body: [
        "You can ask to access, correct, export or delete your personal data, and to withdraw your consent to messages. Write to {email}. We may need to verify your identity first. Where a business is the one that decided to collect your data as its client, we will also pass your request on to it.",
      ] },
      { id: "security", heading: "9. Security", body: [
        "We use encrypted connections and access controls so each business only sees its own data. No system is perfectly secure; if something affects your data we will tell you as required by law.",
      ] },
      { id: "children", heading: "10. Children", body: ["Breeze is not directed at children under 16. If you are a parent and believe a child has given us data, contact us."] },
      { id: "changes", heading: "11. Changes and contact", body: ["We may update this policy; the date above shows the latest version, and we will give notice of important changes. Questions: {email}."] },
    ],
  },
  es: {
    title: "Política de privacidad",
    intro: "Breeze es una plataforma de reservas para barberías, salones y spas en Turks and Caicos, operada por {company} («Breeze», «nosotros»). Esta política explica qué datos personales tratamos, para qué y qué puedes decidir tú.",
    sections: [
      { id: "data", heading: "1. Qué datos recogemos", body: [
        "Si reservas como cliente (con o sin cuenta): tu nombre y apellido, móvil, correo (opcional), idioma, si aceptas recordatorios por WhatsApp y los datos de tus citas (negocio, servicio, profesional, fecha y hora, precio).",
        "Si creas una cuenta: tu correo y una contraseña (nunca la vemos en claro), además de lo anterior.",
        "Si registras un negocio o te unes a un equipo: tu nombre, correo, móvil, rol y la información del negocio que escribas (nombre, dirección, teléfono, servicios, precios, horarios). También guardamos los registros de facturación (facturas y pagos) del plan.",
        "Los negocios pueden añadir notas o registros de ausencias a las fichas de sus propios clientes.",
      ] },
      { id: "why", heading: "2. Para qué los usamos", body: [
        "Para crear, mostrar, cambiar y cancelar citas; enviar confirmaciones y recordatorios por SMS, WhatsApp o correo; gestionar tu cuenta y la agenda de tu negocio; evitar reservas falsas y abusos; y cobrar a los negocios su plan.",
        "No vendemos datos personales ni los usamos para publicidad.",
      ] },
      { id: "sharing", heading: "3. Quién los ve", body: [
        "El negocio donde reservas ve tu nombre, teléfono, correo y tu historial de citas con él. Los negocios no ven tus citas en otros negocios.",
        "Breeze Live (la pantalla del salón) muestra solo tu nombre y la inicial del apellido, el servicio y la hora. Nunca tu teléfono ni tu correo.",
        "Las páginas públicas de reserva muestran a los profesionales con su nombre y la inicial del apellido.",
      ] },
      { id: "providers", heading: "4. Proveedores de servicio", body: [
        "Usamos proveedores de confianza para que Breeze funcione: Supabase (base de datos y acceso), Vercel (alojamiento), Twilio (SMS y WhatsApp), Resend (correo) y Cloudflare Turnstile (comprobación de seguridad en reservas de invitado). Tratan los datos solo para prestarnos su servicio. Algunos pueden tratarlos fuera de Turks and Caicos.",
      ] },
      { id: "device", heading: "5. Cookies y tu dispositivo", body: [
        "Usamos solo lo necesario para que Breeze funcione: una sesión si tienes cuenta, tu idioma y, si reservas como invitado, un enlace privado de tu cita guardado en tu dispositivo para mostrarte «Mis citas». A fecha de hoy no usamos rastreadores de publicidad ni de analítica.",
        "Si borras los datos del navegador se pierden las citas de invitado guardadas en ese dispositivo (sigues pudiendo usar el enlace privado que te enviamos).",
      ] },
      { id: "messages", heading: "6. Mensajes y WhatsApp", body: [
        "Enviamos confirmaciones, recordatorios y avisos de cambios o cancelaciones. Los recordatorios por WhatsApp solo se envían si los aceptas al reservar; puedes dejar de recibirlos cuando quieras respondiendo STOP o avisando al negocio o a nosotros.",
      ] },
      { id: "keep", heading: "7. Cuánto tiempo los guardamos", body: [
        "Mientras tu cuenta o tu relación con un negocio esté activa, y el tiempo necesario para las citas, la facturación y las obligaciones legales. Si un negocio cierra su cuenta, guardamos sus datos un tiempo razonable y luego los borramos o anonimizamos. Puedes pedirnos que borremos tus datos cuando quieras.",
      ] },
      { id: "rights", heading: "8. Tus derechos", body: [
        "Puedes pedir acceder a tus datos, corregirlos, exportarlos o borrarlos, y retirar tu consentimiento a los mensajes. Escribe a {email}. Podemos pedirte antes que verifiques tu identidad. Si es un negocio quien decidió recoger tus datos como cliente suyo, también le trasladaremos tu solicitud.",
      ] },
      { id: "security", heading: "9. Seguridad", body: [
        "Usamos conexiones cifradas y controles de acceso para que cada negocio vea solo sus datos. Ningún sistema es perfecto; si algo afecta a tus datos te lo diremos como exige la ley.",
      ] },
      { id: "children", heading: "10. Menores", body: ["Breeze no está dirigido a menores de 16 años. Si eres madre, padre o tutor y crees que un menor nos dio datos, contáctanos."] },
      { id: "changes", heading: "11. Cambios y contacto", body: ["Podemos actualizar esta política; la fecha de arriba indica la última versión y avisaremos de los cambios importantes. Dudas: {email}."] },
    ],
  },
};

const terms: Record<Locale, LegalDoc> = {
  en: {
    title: "Terms of Use",
    intro: "These terms apply when you use Breeze to find and book appointments. By booking or creating an account you accept them and our Privacy Policy.",
    sections: [
      { id: "what", heading: "1. What Breeze is", body: ["Breeze is a platform that connects clients with independent businesses (barbershops, salons, spas). The service you receive is provided by the business, not by Breeze. Your agreement for that service is with the business."] },
      { id: "bookings", heading: "2. Bookings and cancellations", body: [
        "You can book as a guest or with an account. Each business sets its own cancellation window, shown when you book. You can change or cancel online until that window closes; after that, please call the business.",
        "Businesses may restrict online booking for clients who repeatedly miss appointments without notice.",
      ] },
      { id: "payment", heading: "3. Payment", body: ["Breeze does not take payments for services. You pay the business directly at the appointment, as shown when you book."] },
      { id: "account", heading: "4. Your account and private link", body: [
        "Give us accurate information. Keep your password and your private booking link safe: anyone who has the link can see, change or cancel that booking.",
        "You can ask us to delete your account at any time.",
      ] },
      { id: "messages", heading: "5. Messages", body: ["We send booking confirmations and reminders by SMS, WhatsApp or email. WhatsApp reminders are optional and you can stop them at any time."] },
      { id: "use", heading: "6. Acceptable use", body: ["Do not make fake or repeated bookings, use bots, try to access other people's data, or interfere with the service. We may block access if you do."] },
      { id: "availability", heading: "7. Availability and liability", body: [
        "Breeze is provided \"as is\". We work to keep it available and accurate, but we do not guarantee it will always be uninterrupted or error-free, and we are not responsible for the services provided by businesses or for a business changing or cancelling an appointment.",
        "To the maximum extent allowed by law, Breeze's liability to you is limited to direct damages and does not cover indirect or consequential losses. Nothing here limits rights you cannot waive by law.",
      ] },
      { id: "changes", heading: "8. Changes, law and contact", body: ["We may update these terms; the date above shows the latest version. These terms are governed by the laws of {law}. Questions: {email}."] },
    ],
  },
  es: {
    title: "Términos de uso",
    intro: "Estos términos se aplican cuando usas Breeze para buscar y reservar citas. Al reservar o crear una cuenta los aceptas, junto con nuestra Política de privacidad.",
    sections: [
      { id: "what", heading: "1. Qué es Breeze", body: ["Breeze es una plataforma que conecta a clientes con negocios independientes (barberías, salones, spas). El servicio lo presta el negocio, no Breeze. Tu acuerdo por ese servicio es con el negocio."] },
      { id: "bookings", heading: "2. Reservas y cancelaciones", body: [
        "Puedes reservar como invitado o con cuenta. Cada negocio fija su propia ventana de cancelación, que ves al reservar. Puedes cambiar o cancelar en línea hasta que se cierre esa ventana; después, llama al negocio.",
        "Los negocios pueden limitar la reserva en línea a clientes que faltan repetidamente sin avisar.",
      ] },
      { id: "payment", heading: "3. Pago", body: ["Breeze no cobra los servicios. Pagas directamente al negocio en la cita, como se indica al reservar."] },
      { id: "account", heading: "4. Tu cuenta y tu enlace privado", body: [
        "Danos información veraz. Guarda bien tu contraseña y tu enlace privado de la cita: quien tenga el enlace puede ver, cambiar o cancelar esa cita.",
        "Puedes pedirnos que borremos tu cuenta cuando quieras.",
      ] },
      { id: "messages", heading: "5. Mensajes", body: ["Enviamos confirmaciones y recordatorios por SMS, WhatsApp o correo. Los recordatorios por WhatsApp son opcionales y puedes dejar de recibirlos cuando quieras."] },
      { id: "use", heading: "6. Uso aceptable", body: ["No hagas reservas falsas o repetidas, no uses robots, no intentes acceder a datos de otras personas ni interfieras con el servicio. Podemos bloquear el acceso si lo haces."] },
      { id: "availability", heading: "7. Disponibilidad y responsabilidad", body: [
        "Breeze se ofrece «tal cual». Trabajamos para que esté disponible y sea preciso, pero no garantizamos que funcione siempre sin interrupciones ni errores, y no respondemos de los servicios que prestan los negocios ni de que un negocio cambie o cancele una cita.",
        "En la medida máxima permitida por la ley, la responsabilidad de Breeze hacia ti se limita a los daños directos y no cubre pérdidas indirectas. Nada de esto limita derechos que la ley no te permita renunciar.",
      ] },
      { id: "changes", heading: "8. Cambios, ley y contacto", body: ["Podemos actualizar estos términos; la fecha de arriba indica la última versión. Se rigen por las leyes de {law}. Dudas: {email}."] },
    ],
  },
};

const business: Record<Locale, LegalDoc> = {
  en: {
    title: "Business Terms",
    intro: "These terms apply to businesses that register on Breeze Negocios (owners, administrators and their teams) and form the agreement between you and {company}. By registering you accept them, the Terms of Use and the Privacy Policy.",
    sections: [
      { id: "service", heading: "1. The service", body: ["Breeze gives you an online booking page, an agenda for your professionals, client reminders and, depending on your plan, Breeze Live for a screen in your premises. You decide your services, prices, working hours and cancellation policy."] },
      { id: "accounts", heading: "2. Accounts and teams", body: ["The person who registers is the owner and is responsible for the account, for who is given access (administrators and professionals) and for keeping credentials secure. Information you give must be accurate and you must be entitled to act for the business."] },
      { id: "plans", heading: "3. Plans, trial and prices", body: [
        "New businesses get a free 14-day trial. Plans and prices (in US dollars) are those shown to you when you register or are invoiced; each plan includes a number of professionals, and extra branches are charged separately. Annual billing is ten times the monthly price. We may change prices with prior notice; the change applies from your next billing period.",
      ] },
      { id: "billing", heading: "4. Invoices and payment", body: [
        "Billing is manual for now: we send you an invoice, you pay by bank transfer or cash using the invoice number as reference, and we record the payment, which activates your plan until the end of the period paid.",
        "If a payment is overdue we will show a notice in your dashboard. 14 days after the due date online booking and Breeze Live are paused (suspended). Your agenda and data are not deleted, and service resumes when payment is recorded.",
      ] },
      { id: "ending", heading: "5. Ending the service", body: ["You may stop using Breeze at any time by telling us at {email}. We do not refund periods already started unless the law requires it. After closing, we keep or delete your data as described in the Privacy Policy, and you can ask us for a copy first."] },
      { id: "data", heading: "6. Your clients' data", body: [
        "You are responsible for how you use your clients' data. For the personal data of your clients, you decide why it is collected and Breeze processes it on your behalf to provide the service. You must have the right to contact them, and must respect their choice about WhatsApp and other messages.",
        "Do not use client data for anything unrelated to the business or share it unlawfully. Breeze's own handling of data is described in the Privacy Policy.",
      ] },
      { id: "messages", heading: "7. Messages", body: ["Reminders by SMS or WhatsApp have a real cost and may be limited by plan. WhatsApp messages depend on third-party rules and approvals, and delivery cannot be guaranteed."] },
      { id: "use", heading: "8. Acceptable use", body: ["Do not use Breeze for unlawful, misleading or abusive purposes, to send spam, or to harm the platform or other users. We may suspend an account that does."] },
      { id: "availability", heading: "9. Availability, support and liability", body: [
        "We make reasonable efforts to keep Breeze running and to give support, but we do not guarantee uninterrupted service. To the maximum extent allowed by law, our liability is limited to the amount you paid in the three months before the event, and does not cover indirect losses such as lost profit.",
      ] },
      { id: "changes", heading: "10. Changes, law and contact", body: ["We may update these terms with notice; continuing to use Breeze after the change means you accept it. These terms are governed by the laws of {law}. Questions: {email}."] },
    ],
  },
  es: {
    title: "Términos para negocios",
    intro: "Estos términos se aplican a los negocios que se registran en Breeze Negocios (dueños, administradores y sus equipos) y forman el acuerdo entre tú y {company}. Al registrarte los aceptas, junto con los Términos de uso y la Política de privacidad.",
    sections: [
      { id: "service", heading: "1. El servicio", body: ["Breeze te da una página de reservas en línea, una agenda para tus profesionales, recordatorios a tus clientes y, según tu plan, Breeze Live para una pantalla en tu local. Tú decides tus servicios, precios, horarios y política de cancelación."] },
      { id: "accounts", heading: "2. Cuentas y equipos", body: ["Quien se registra es el dueño y responde de la cuenta, de a quién da acceso (administradores y profesionales) y de guardar las credenciales con seguridad. La información que des debe ser veraz y debes poder actuar en nombre del negocio."] },
      { id: "plans", heading: "3. Planes, prueba y precios", body: [
        "Los negocios nuevos tienen 14 días de prueba gratis. Los planes y precios (en dólares) son los que se te muestran al registrarte o en tu factura; cada plan incluye un número de profesionales y las sucursales extra se cobran aparte. El pago anual equivale a diez veces el precio mensual. Podemos cambiar los precios avisando antes; el cambio se aplica desde tu siguiente periodo.",
      ] },
      { id: "billing", heading: "4. Facturas y pago", body: [
        "Por ahora la facturación es manual: te enviamos una factura, pagas por transferencia o en efectivo usando el número de factura como referencia, y registramos el pago, que activa tu plan hasta el fin del periodo pagado.",
        "Si un pago está vencido te mostraremos un aviso en tu panel. A los 14 días del vencimiento se pausan la reserva en línea y Breeze Live (suspensión). No se borran tu agenda ni tus datos, y el servicio se reanuda al registrar el pago.",
      ] },
      { id: "ending", heading: "5. Terminar el servicio", body: ["Puedes dejar de usar Breeze cuando quieras avisándonos en {email}. No devolvemos periodos ya empezados salvo que la ley lo exija. Al cerrar, guardamos o borramos tus datos como indica la Política de privacidad, y puedes pedirnos antes una copia."] },
      { id: "data", heading: "6. Los datos de tus clientes", body: [
        "Eres responsable del uso que haces de los datos de tus clientes. Sobre los datos personales de tus clientes, tú decides para qué se recogen y Breeze los trata por encargo tuyo para prestar el servicio. Debes tener derecho a contactarlos y respetar su decisión sobre WhatsApp y otros mensajes.",
        "No uses los datos de clientes para nada ajeno al negocio ni los compartas de forma ilegal. El tratamiento de datos que hace Breeze por su cuenta se describe en la Política de privacidad.",
      ] },
      { id: "messages", heading: "7. Mensajes", body: ["Los recordatorios por SMS o WhatsApp tienen un coste real y pueden estar limitados por plan. Los mensajes de WhatsApp dependen de normas y aprobaciones de terceros y no se puede garantizar su entrega."] },
      { id: "use", heading: "8. Uso aceptable", body: ["No uses Breeze con fines ilegales, engañosos o abusivos, para enviar spam ni para dañar la plataforma o a otros usuarios. Podemos suspender una cuenta que lo haga."] },
      { id: "availability", heading: "9. Disponibilidad, soporte y responsabilidad", body: [
        "Hacemos esfuerzos razonables para que Breeze funcione y para dar soporte, pero no garantizamos un servicio ininterrumpido. En la medida máxima permitida por la ley, nuestra responsabilidad se limita a lo que hayas pagado en los tres meses anteriores al hecho y no cubre pérdidas indirectas como el lucro cesante.",
      ] },
      { id: "changes", heading: "10. Cambios, ley y contacto", body: ["Podemos actualizar estos términos avisando; seguir usando Breeze tras el cambio supone aceptarlo. Se rigen por las leyes de {law}. Dudas: {email}."] },
    ],
  },
};

export const LEGAL_DOCS: Record<LegalDocId, Record<Locale, LegalDoc>> = { privacy, terms, "business-terms": business };

/** Sustituye {company}, {email} y {law}. */
export function fill(text: string, v: { company: string; email: string; law: string }): string {
  return text.replaceAll("{company}", v.company).replaceAll("{email}", v.email).replaceAll("{law}", v.law);
}
