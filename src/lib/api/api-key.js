/**
 * Remove whitespace, control characters, and non-ASCII noise from an API key.
 * NFKC normalization also converts accidental full-width ASCII characters.
 */
export function sanitizeApiKey(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[^\x21-\x7E]/g, "");
}
