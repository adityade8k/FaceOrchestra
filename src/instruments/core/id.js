let fallbackSequence = 0;

export function normalizeIdPrefix(prefix = "entity") {
  const normalized = String(prefix)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "entity";
}

export function createStableId(prefix = "entity", { randomUUID = getRandomUUID() } = {}) {
  const normalizedPrefix = normalizeIdPrefix(prefix);
  if (typeof randomUUID === "function") {
    return `${normalizedPrefix}-${randomUUID()}`;
  }

  fallbackSequence += 1;
  const timestamp = Date.now().toString(36);
  const sequence = fallbackSequence.toString(36).padStart(4, "0");
  return `${normalizedPrefix}-${timestamp}-${sequence}`;
}

export function createIdFactory(prefix = "entity", options = {}) {
  return () => createStableId(prefix, options);
}

export function assertStableId(id, label = "ID") {
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return id;
}

function getRandomUUID() {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID.bind(globalThis.crypto)
    : null;
}
