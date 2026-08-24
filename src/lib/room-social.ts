export type Role = "host" | "viewer";

export type Profile = {
  avatar: string;
  color: string;
  nickname: string;
};

export type Participant = Profile & {
  clientId: string;
  isTalking: boolean;
  joinedAt: number;
  micEnabled: boolean;
  role: Role;
};

export type ChatMessage = {
  avatar: string;
  body: string;
  color: string;
  id: string;
  senderId: string;
  senderName: string;
  sentAt: number;
};

export type FloatingReaction = {
  emoji: string;
  id: string;
  left: number;
  senderName: string;
};

export type RoomState = {
  isLocked: boolean;
  title: string;
};

export type RoomEvent =
  | { kind: "chat"; message: ChatMessage }
  | {
      emoji: string;
      id: string;
      kind: "reaction";
      senderId: string;
      senderName: string;
    }
  | { kind: "room-state"; state: RoomState; targetId?: string }
  | { kind: "request-room-state"; senderId: string }
  | { kind: "kick"; targetId: string }
  | { kind: "session-ended" }
  | { enabled: boolean; kind: "mic-state"; senderId: string };

export const avatarOptions = [
  { avatar: "🦊", color: "#ff8a65" },
  { avatar: "🐼", color: "#78dce8" },
  { avatar: "🐸", color: "#d7ff64" },
  { avatar: "👾", color: "#b89cff" },
  { avatar: "🌙", color: "#ffd166" },
  { avatar: "🪐", color: "#ff82b2" },
  { avatar: "🐙", color: "#ff7c68" },
  { avatar: "⚡", color: "#f4f0e6" },
] as const;

export const reactionOptions = ["🔥", "😂", "😮", "❤️", "👏", "🍿"] as const;

export const defaultRoomState: RoomState = {
  isLocked: false,
  title: "Noite de cinema",
};

export function createDefaultProfile(): Profile {
  const option = avatarOptions[Math.floor(Math.random() * avatarOptions.length)];
  return {
    avatar: option.avatar,
    color: option.color,
    nickname: `Amigo ${Math.floor(100 + Math.random() * 900)}`,
  };
}

export function isProfile(value: unknown): value is Profile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<Profile>;
  return (
    typeof profile.avatar === "string" &&
    typeof profile.color === "string" &&
    typeof profile.nickname === "string" &&
    profile.nickname.trim().length > 0
  );
}

export function sanitizeNickname(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 24);
}

export function sanitizeSessionTitle(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 56);
}

export function isRoomEvent(value: unknown): value is RoomEvent {
  return Boolean(
    value &&
      typeof value === "object" &&
      "kind" in value &&
      typeof (value as { kind?: unknown }).kind === "string",
  );
}
