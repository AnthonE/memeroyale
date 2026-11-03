// The "address" every per-address limit, kick and allowlist uses (server/index.ts ipOf, server/admin/auth.ts): IPv4 as
// is (also when IPv6-mapped), IPv6 by its /64. One home or VPS gets a whole /64, so counting single IPv6 addresses would
// hand an attacker billions of fresh "addresses".
export function addrKey(ip: string): string {
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (v4) return v4[1];
  if (!ip.includes(":") || ip === "::1") return ip;
  const [head, tail = ""] = ip.split("%")[0].toLowerCase().split("::");
  const h = head ? head.split(":") : [], t = tail ? tail.split(":") : [];
  const full = ip.includes("::") ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h;
  return full.slice(0, 4).map((x) => x.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}
