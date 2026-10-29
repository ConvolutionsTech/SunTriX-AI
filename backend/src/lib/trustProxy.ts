/**
 * Value for Express "trust proxy". req.ip (rate-limit keys, contract signer IP)
 * comes from X-Forwarded-For only when the hop is trusted. TRUST_PROXY is the
 * number of proxies in front of the app (e.g. 1), "loopback", or a CIDR list.
 * Unset/"false" trusts nothing, so a client can't spoof its IP by sending the header.
 */
export function parseTrustProxy(value: string | undefined): boolean | number | string {
  if (!value || value === "false") return false;
  if (value === "true") return true;
  return /^\d+$/.test(value) ? Number(value) : value;
}
