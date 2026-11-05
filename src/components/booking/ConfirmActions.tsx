"use client";
import { CalendarPlus, MapPin, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { buildIcs, googleCalendarUrl, mapsUrl, telHref, type CalendarEvent } from "@/lib/booking/calendar";

/** Lo que el cliente necesita para presentarse a la hora: calendario, mapa y teléfono del salón. */
export function ConfirmActions({ event, uid, salonName, address, phone }: { event: CalendarEvent; uid: string; salonName: string; address: string | null; phone: string | null }) {
  const t = useTranslations("booking");
  const [open, setOpen] = useState(false);
  const map = mapsUrl(salonName, address);
  const tel = telHref(phone);

  const downloadIcs = () => {
    const url = URL.createObjectURL(new Blob([buildIcs(event, uid)], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "breeze-booking.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  const btn = "flex min-w-0 flex-col items-center gap-1.5 rounded-2xl bg-white px-1 py-3 text-center text-xs font-bold text-lagoon ring-1 ring-breeze-100 hover:bg-breeze-50";
  return (
    <div className="mt-4 text-left">
      <div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={`${btn} ${open ? "bg-breeze-50" : ""}`}>
          <CalendarPlus className="size-5" /> {t("addToCalendar")}
        </button>
        {map ? (
          <a href={map} target="_blank" rel="noopener noreferrer" className={btn}>
            <MapPin className="size-5" /> {t("directions")}
          </a>
        ) : (
          <span className={`${btn} opacity-40`} aria-disabled><MapPin className="size-5" /> {t("directions")}</span>
        )}
        {tel ? (
          <a href={tel} className={btn}>
            <Phone className="size-5" /> {t("callSalon")}
          </a>
        ) : (
          <span className={`${btn} opacity-40`} aria-disabled><Phone className="size-5" /> {t("callSalon")}</span>
        )}
      </div>
      {open && (
        <div className="mt-2 overflow-hidden rounded-2xl bg-white text-sm font-semibold ring-1 ring-breeze-100">
          <a href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" className="block border-b border-breeze-100 px-4 py-3 hover:bg-breeze-50">
            {t("calGoogle")}
          </a>
          <button type="button" onClick={downloadIcs} className="block w-full px-4 py-3 text-left hover:bg-breeze-50">
            {t("calFile")}
          </button>
        </div>
      )}
      {phone && <p className="mt-2 text-center text-xs text-ink/50">{phone}</p>}
    </div>
  );
}
