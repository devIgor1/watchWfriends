const ROOM_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const ROOM_SEGMENTS = 3;
const SEGMENT_LENGTH = 4;

export function createRoomId() {
  const values = crypto.getRandomValues(
    new Uint8Array(ROOM_SEGMENTS * SEGMENT_LENGTH),
  );
  const characters = Array.from(
    values,
    (value) => ROOM_ALPHABET[value % ROOM_ALPHABET.length],
  );

  return Array.from({ length: ROOM_SEGMENTS }, (_, segment) =>
    characters
      .slice(segment * SEGMENT_LENGTH, (segment + 1) * SEGMENT_LENGTH)
      .join(""),
  ).join("-");
}

export function normalizeRoomId(input: string) {
  const rawValue = input.trim();
  let candidate = rawValue;

  try {
    const url = new URL(rawValue);
    const parts = url.pathname.split("/").filter(Boolean);
    const roomIndex = parts.findIndex((part) => part === "room");
    candidate = roomIndex >= 0 ? parts[roomIndex + 1] ?? "" : parts.at(-1) ?? "";
  } catch {
    candidate = rawValue.split("?")[0].split("#")[0];
  }

  return candidate
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 40);
}

export function isValidRoomId(roomId: string) {
  return /^[a-z0-9](?:[a-z0-9-]{4,38}[a-z0-9])$/.test(roomId);
}

export function formatRoomId(roomId: string) {
  return roomId.toUpperCase();
}
