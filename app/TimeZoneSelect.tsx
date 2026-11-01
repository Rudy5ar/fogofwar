import { useEffect, useState } from "react";
import { Icon } from "./Icon";

// Only used before the page has mounted; visitors start on their device's zone.
export const DEFAULT_TIME_ZONE = "UTC";

// Older ICU builds still report these zones by their former names.
const ALIASES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
};

export function deviceTimeZone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return ALIASES[tz] ?? (tz || DEFAULT_TIME_ZONE);
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

const ZONES: { id: string; label: string }[] = [
  { id: "Europe/Belgrade", label: "Serbia" },
  { id: "Europe/London", label: "UK & Ireland" },
  { id: "Europe/Paris", label: "Central Europe" },
  { id: "Europe/Athens", label: "Eastern Europe" },
  { id: "Europe/Istanbul", label: "Turkey" },
  { id: "Europe/Moscow", label: "Moscow" },
  { id: "Asia/Dubai", label: "Gulf" },
  { id: "Asia/Kolkata", label: "India" },
  { id: "America/New_York", label: "US Eastern" },
  { id: "America/Chicago", label: "US Central" },
  { id: "America/Denver", label: "US Mountain" },
  { id: "America/Los_Angeles", label: "US Pacific" },
  { id: "America/Mexico_City", label: "Mexico" },
  { id: "America/Sao_Paulo", label: "Brazil" },
  { id: "America/Argentina/Buenos_Aires", label: "Argentina" },
  { id: "Asia/Seoul", label: "Korea" },
  { id: "Asia/Shanghai", label: "China" },
  { id: "Asia/Taipei", label: "Taiwan" },
  { id: "Asia/Ho_Chi_Minh", label: "Vietnam" },
  { id: "Asia/Bangkok", label: "Thailand" },
  { id: "Asia/Jakarta", label: "Indonesia" },
  { id: "Asia/Singapore", label: "Singapore & Philippines" },
  { id: "Asia/Tokyo", label: "Japan" },
  { id: "Australia/Sydney", label: "Sydney" },
  { id: "Pacific/Auckland", label: "New Zealand" },
  { id: "UTC", label: "UTC" },
];

function offset(tz: string) {
  const part = new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "shortOffset" })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName");
  // ICU builds disagree on zero ("GMT" vs "GMT+0"), so normalise it.
  const raw = part?.value ?? "GMT";
  return raw === "GMT" ? "UTC+0" : raw.replace("GMT", "UTC");
}

export function TimeZoneSelect({ value, onChange }: { value: string; onChange: (tz: string) => void }) {
  // Device zone and offsets are read after mount: the server's clock and ICU aren't the visitor's,
  // and option text that differs between the two breaks hydration.
  const [device, setDevice] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setDevice(deviceTimeZone());
    setMounted(true);
  }, []);
  const zones = [...ZONES];
  if (device && !zones.some((z) => z.id === device)) zones.push({ id: device, label: "This device" });
  if (!zones.some((z) => z.id === value)) zones.push({ id: value, label: value });

  return (
    <label className="select tz" title="Time zone">
      <span className="sr-only">Time zone</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {zones.map((z) => (
          <option key={z.id} value={z.id}>
            {mounted ? `${z.label} (${offset(z.id)})` : z.label}
          </option>
        ))}
      </select>
      <Icon name="chevron-down" size={14} />
    </label>
  );
}
