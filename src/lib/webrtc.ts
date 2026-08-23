export type SignalKind =
  | "join"
  | "host-ready"
  | "offer"
  | "answer"
  | "ice-candidate"
  | "stream-stopped"
  | "viewer-left"
  | "host-left";

export type SignalMessage = {
  data?: RTCIceCandidateInit | RTCSessionDescriptionInit | null;
  kind: SignalKind;
  senderId: string;
  sentAt: number;
  targetId?: string;
};

type ExtendedDisplayMediaOptions = DisplayMediaStreamOptions & {
  preferCurrentTab?: boolean;
  selfBrowserSurface?: "exclude" | "include";
  surfaceSwitching?: "exclude" | "include";
  systemAudio?: "exclude" | "include";
};

export function createClientId() {
  return crypto.randomUUID();
}

export function getRtcConfiguration(): RTCConfiguration {
  const iceServers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
  ];
  const turnUrls = (process.env.NEXT_PUBLIC_TURN_URLS ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);

  if (turnUrls.length > 0) {
    iceServers.push({
      urls: turnUrls,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME?.trim(),
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL?.trim(),
    });
  }

  return {
    bundlePolicy: "max-bundle",
    iceCandidatePoolSize: 10,
    iceServers,
  };
}

export async function captureDisplay() {
  const options: ExtendedDisplayMediaOptions = {
    audio: {
      autoGainControl: false,
      echoCancellation: false,
      noiseSuppression: false,
    },
    preferCurrentTab: true,
    selfBrowserSurface: "exclude",
    surfaceSwitching: "include",
    systemAudio: "include",
    video: {
      frameRate: { ideal: 30, max: 30 },
      height: { ideal: 1080 },
      width: { ideal: 1920 },
    },
  };

  return navigator.mediaDevices.getDisplayMedia(options);
}

export function isSessionDescription(
  data: SignalMessage["data"],
): data is RTCSessionDescriptionInit {
  return Boolean(data && "type" in data && "sdp" in data);
}

export function isIceCandidate(
  data: SignalMessage["data"],
): data is RTCIceCandidateInit {
  return Boolean(data && "candidate" in data);
}
