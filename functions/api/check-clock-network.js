const ALLOWED_IPV4S = ["84.181.139.221"];
const ALLOWED_IPV6_PREFIXES = ["2003:ee:d737:2300:"];

function normalize(ip) {
  return String(ip || "").trim().toLowerCase();
}

function allowed(ip) {
  const value = normalize(ip);
  if (!value) return false;
  if (ALLOWED_IPV4S.includes(value)) return true;
  return ALLOWED_IPV6_PREFIXES.some(prefix => value.startsWith(prefix.toLowerCase()));
}

export async function onRequest(context) {
  const request = context.request;
  const cfIp = request.headers.get("CF-Connecting-IP");
  const forwarded = request.headers.get("X-Forwarded-For");
  const ip = normalize(cfIp || (forwarded ? forwarded.split(",")[0] : ""));

  const isAllowed = allowed(ip);

  return new Response(JSON.stringify({
    allowed: isAllowed,
    ip,
    allowedIpv4s: ALLOWED_IPV4S,
    allowedIpv6Prefixes: ALLOWED_IPV6_PREFIXES,
    reason: isAllowed ? "Restaurantnetz erkannt" : "Nicht im erlaubten Restaurantnetz"
  }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
