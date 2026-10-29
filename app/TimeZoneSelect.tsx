import { useEffect, useState } from "react";
import { Icon } from "./Icon";

export const DEFAULT_TIME_ZONE = "Europe/Belgrade";

const ZONES: { id: string; label: string }[] = [
  { id: "Europe/Belgrade", label: "Serbia" },
  { id: "Europe/London", label: "UK & Ireland" },
  { id: "Europe/Paris", label: "Central Europe" },
  { id: "Europe/Athens", label: "Eastern Europe" },
  { id: "Europe/Moscow", label: "Moscow" },
  { id: "America/New_York", label: "US Eastern" },
  { id: "America/Chicago", label: "US Central" },
  { id: "America/Denver", label: "US Mountain" },
  { id: "America/Los_Angeles", label: "US Pacific" },
  { id: "America/Sao_Paulo", label: "Brazil" },
  { id: "Asia/Seoul", label: "Korea" },
  { id: "Asia/Shanghai", label: "China" },
  { id: "Asia/Taipei", label: "Taiwan" },
  { id: "Asia/Ho_Chi_Minh", label: "Vietnam" },
  { id: "Asia/Tokyo", label: "Japan" },
  { id: "Australia/Sydney", label: "Sydney" },
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
    setDevice(Intl.DateTimeFormat().resolvedOptions().timeZone);
    setMounted(true);
  }, []);
  const zones = [...ZONES];
  if (device && !zones.some((z) => z.id === device)) zones.push({ id: device, label: "This device" });
  if (!zones.some((z) => z.id === value)) zones.push({ id: value, label: value });

  return (
    <label className="select tz" title="Time zone for match times and days">
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
