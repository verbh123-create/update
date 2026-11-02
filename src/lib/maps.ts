// Turns whatever the admin pastes (address, "lat,lng", Google embed URL, long share URL) into an embeddable map.
export function mapEmbedSrc(input: string, label = ""): string {
  const q = (input || "").trim();
  if (/^https?:\/\//i.test(q)) {
    if (q.includes("/maps/embed") || q.includes("output=embed")) return q;
    const at = q.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (at) return `https://maps.google.com/maps?q=${at[1]},${at[2]}&z=15&output=embed`;
    const place = q.match(/\/place\/([^/@?]+)/);
    if (place) return `https://maps.google.com/maps?q=${place[1]}&z=15&output=embed`;
    const qp = q.match(/[?&]q=([^&]+)/);
    if (qp) return `https://maps.google.com/maps?q=${qp[1]}&z=15&output=embed`;
    return `https://maps.google.com/maps?q=${encodeURIComponent(label || "Bahrain")}&z=15&output=embed`;
  }
  return `https://maps.google.com/maps?q=${encodeURIComponent(q || label || "Manama, Bahrain")}&z=15&output=embed`;
}

export function mapLink(input: string, label = ""): string {
  const q = (input || "").trim();
  if (/^https?:\/\//i.test(q) && !q.includes("/maps/embed") && !q.includes("output=embed")) return q;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label || q || "Manama, Bahrain")}`;
}

export function whatsappLink(n: string): string {
  const d = (n || "").replace(/\D/g, "");
  return `https://wa.me/${d.length === 8 ? `973${d}` : d}`;
}
