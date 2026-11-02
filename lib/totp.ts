// RFC 6238 time-based one-time passwords (the 6-digit codes from Google
// Authenticator, 1Password, Authy, etc.), using Web Crypto HMAC-SHA1.

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;

export function generateTotpSecret(bytes = 20): string {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  return base32Encode(raw);
}

export function base32Encode(data: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Uint8Array {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    value = (value << 5) | BASE32.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(new ArrayBuffer(out.length)).map((_, i) => out[i]);
}

export async function totpCode(secret: string, atMs = Date.now()): Promise<string> {
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  const message = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    message[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const key = await crypto.subtle.importKey("raw", base32Decode(secret) as Uint8Array<ArrayBuffer>, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** Accepts the current code and one step either side for clock drift. */
export async function verifyTotp(secret: string, code: string, atMs = Date.now()): Promise<boolean> {
  const clean = code.replace(/\D/g, "");
  if (!secret || clean.length !== DIGITS) return false;
  for (const drift of [0, -1, 1]) {
    if ((await totpCode(secret, atMs + drift * STEP_SECONDS * 1000)) === clean) return true;
  }
  return false;
}

export function totpUri(secret: string, account: string, issuer = "Philly on the Block"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}
