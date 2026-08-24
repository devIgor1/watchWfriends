"use client";

import {
  AudioLines,
  Check,
  CircleAlert,
  Copy,
  Edit3,
  Expand,
  Film,
  Lock,
  LockOpen,
  LogOut,
  MessageCircle,
  Mic,
  MicOff,
  MonitorUp,
  PictureInPicture2,
  Radio,
  ScreenShareOff,
  Send,
  Settings2,
  SmilePlus,
  Theater,
  UserRoundX,
  UsersRound,
  Volume2,
  VolumeX,
  Wifi,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { formatRoomId } from "@/lib/room";
import {
  avatarOptions,
  createDefaultProfile,
  defaultRoomState,
  isProfile,
  isRoomEvent,
  reactionOptions,
  sanitizeNickname,
  sanitizeSessionTitle,
  type ChatMessage,
  type FloatingReaction,
  type Participant,
  type Profile,
  type Role,
  type RoomEvent,
  type RoomState,
} from "@/lib/room-social";
import { getBrowserSupabaseClient, getSupabaseConfiguration } from "@/lib/supabase";
import {
  captureDisplay,
  createClientId,
  getRtcConfiguration,
  isIceCandidate,
  isSessionDescription,
  type SignalKind,
  type SignalMessage,
} from "@/lib/webrtc";

type ExperienceStatus =
  | "config-error"
  | "connecting"
  | "ended"
  | "error"
  | "ready"
  | "sharing"
  | "waiting"
  | "watching";

type HostPeer = {
  iceQueue: RTCIceCandidateInit[];
  peer: RTCPeerConnection;
  pendingNegotiation: boolean;
  relayedSenders: Map<string, RTCRtpSender>;
};

type PresencePayload = Partial<Participant> & { clientId?: string };

const statusCopy: Record<ExperienceStatus, string> = {
  "config-error": "Configuração necessária",
  connecting: "Conectando à sala",
  ended: "Sessão encerrada",
  error: "Falha ao compartilhar",
  ready: "Sala pronta",
  sharing: "Transmitindo agora",
  waiting: "Aguardando transmissão",
  watching: "Assistindo ao vivo",
};

const subscribeToHydration = () => () => undefined;
const maxChatMessages = 100;

export function RoomExperience({ roomId }: { roomId: string }) {
  const router = useRouter();
  const isHydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const role: Role | null = isHydrated
    ? sessionStorage.getItem(`watchwfriends:host:${roomId}`) === "true"
      ? "host"
      : "viewer"
    : null;
  const isHost = role === "host";
  const isSupabaseConfigured = getSupabaseConfiguration().isConfigured;

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remotePlaybackStreamRef = useRef<MediaStream | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const microphoneTrackRef = useRef<MediaStreamTrack | null>(null);
  const clientIdRef = useRef("");
  const profileRef = useRef<Profile | null>(null);
  const roomStateRef = useRef<RoomState>(defaultRoomState);
  const micEnabledRef = useRef(false);
  const isTalkingRef = useRef(false);
  const volumeRef = useRef(1);
  const accessMessageRef = useRef("");
  const joinedAtRef = useRef(Date.now());
  const sendSignalRef = useRef<
    ((kind: SignalKind, data?: SignalMessage["data"], targetId?: string) => Promise<void>) | null
  >(null);
  const sendRoomEventRef = useRef<((event: RoomEvent) => Promise<void>) | null>(null);
  const updatePresenceRef = useRef<
    ((overrides?: Partial<Participant>) => Promise<void>) | null
  >(null);
  const connectViewersRef = useRef<(() => void) | null>(null);
  const closeHostPeersRef = useRef<(() => void) | null>(null);
  const attachMicrophoneRef = useRef<
    ((track: MediaStreamTrack, stream: MediaStream) => Promise<void>) | null
  >(null);
  const detachMicrophoneRef = useRef<
    ((track: MediaStreamTrack) => Promise<void>) | null
  >(null);
  const kickParticipantRef = useRef<((clientId: string) => void) | null>(null);

  const [status, setStatus] = useState<ExperienceStatus>(
    isSupabaseConfigured ? "connecting" : "config-error",
  );
  const [statusDetail, setStatusDetail] = useState(
    isSupabaseConfigured
      ? "Preparando o canal da sala…"
      : "Adicione as variáveis do Supabase para ativar as salas.",
  );
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileDraft, setProfileDraft] = useState<Profile | null>(null);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [roomState, setRoomState] = useState<RoomState>(defaultRoomState);
  const [titleDraft, setTitleDraft] = useState(defaultRoomState.title);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [socialTab, setSocialTab] = useState<"chat" | "people">("people");
  const [isStarting, setIsStarting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [hasSharedAudio, setHasSharedAudio] = useState(false);
  const [needsPlayback, setNeedsPlayback] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [copied, setCopied] = useState(false);
  const [signalingConnected, setSignalingConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState(false);
  const [microphoneMode, setMicrophoneMode] = useState<"open" | "push">("open");
  const [isTalking, setIsTalking] = useState(false);
  const [voiceStreams, setVoiceStreams] = useState<Record<string, MediaStream>>({});
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [isPictureInPicture, setIsPictureInPicture] = useState(false);
  const [accessMessage, setAccessMessage] = useState("");

  const profileReady = Boolean(profile);
  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/room/${roomId}`;
  }, [roomId]);

  useEffect(() => {
    if (!isHydrated) return;
    const hydrationTimer = window.setTimeout(() => {
      const clientStorageKey = `watchwfriends:client:${roomId}`;
      const storedClientId = sessionStorage.getItem(clientStorageKey);
      clientIdRef.current = storedClientId ?? createClientId();
      sessionStorage.setItem(clientStorageKey, clientIdRef.current);

      const storedTitle = sessionStorage.getItem(`watchwfriends:title:${roomId}`);
      if (role === "host" && storedTitle) {
        const nextState = { ...defaultRoomState, title: storedTitle };
        roomStateRef.current = nextState;
        setRoomState(nextState);
        setTitleDraft(storedTitle);
      }

      const rawProfile = localStorage.getItem("watchwfriends:profile");
      if (rawProfile) {
        try {
          const parsed: unknown = JSON.parse(rawProfile);
          if (isProfile(parsed)) {
            profileRef.current = parsed;
            setProfile(parsed);
            setProfileDraft(parsed);
            return;
          }
        } catch {
          localStorage.removeItem("watchwfriends:profile");
        }
      }

      const generatedProfile = createDefaultProfile();
      setProfileDraft(generatedProfile);
      setShowProfileEditor(true);
    }, 0);

    return () => window.clearTimeout(hydrationTimer);
  }, [isHydrated, role, roomId]);

  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { roomStateRef.current = roomState; }, [roomState]);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, socialTab]);

  useEffect(() => {
    const video = isHost ? localVideoRef.current : remoteVideoRef.current;
    if (!video) return;
    const handleEnter = () => setIsPictureInPicture(true);
    const handleLeave = () => setIsPictureInPicture(false);
    video.addEventListener("enterpictureinpicture", handleEnter);
    video.addEventListener("leavepictureinpicture", handleLeave);
    return () => {
      video.removeEventListener("enterpictureinpicture", handleEnter);
      video.removeEventListener("leavepictureinpicture", handleLeave);
    };
  }, [isHost]);

  const stopSharing = useCallback(async () => {
    const stream = localStreamRef.current;
    localStreamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
    closeHostPeersRef.current?.();
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setIsSharing(false);
    setHasSharedAudio(false);
    setStatus("ready");
    setStatusDetail("Escolha uma tela quando quiser começar.");
    await sendSignalRef.current?.("stream-stopped");
  }, []);

  const startSharing = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setStatus("error");
      setErrorMessage("Este navegador não oferece compartilhamento de tela. Use Chrome ou Edge no computador.");
      return;
    }
    setIsStarting(true);
    setErrorMessage("");
    try {
      const stream = await captureDisplay();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = stream;
      setHasSharedAudio(stream.getAudioTracks().length > 0);
      setIsSharing(true);
      setStatus("sharing");
      setStatusDetail("Sua tela está sendo enviada aos participantes.");
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        await localVideoRef.current.play().catch(() => undefined);
      }
      stream.getVideoTracks()[0]?.addEventListener("ended", () => void stopSharing(), { once: true });
      connectViewersRef.current?.();
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setStatus("ready");
        setStatusDetail("O compartilhamento foi cancelado ou não autorizado.");
      } else if (error instanceof DOMException && error.name === "NotReadableError") {
        setStatus("error");
        setErrorMessage("O sistema bloqueou a captura. Feche outro aplicativo que esteja compartilhando a tela e tente novamente.");
      } else if (error instanceof DOMException && error.name === "InvalidStateError") {
        setStatus("error");
        setErrorMessage("Volte para esta aba e clique novamente no botão de compartilhar.");
      } else {
        setStatus("error");
        setErrorMessage("O navegador não conseguiu iniciar a captura. Atualize a página e tente compartilhar outra aba.");
      }
    } finally {
      setIsStarting(false);
    }
  }, [stopSharing]);

  const tryRemotePlayback = useCallback(async (withAudio = true) => {
    const video = remoteVideoRef.current;
    if (!video) return;
    video.muted = !withAudio;
    video.volume = volumeRef.current;
    setIsMuted(!withAudio);
    try {
      await video.play();
      setNeedsPlayback(false);
    } catch {
      video.muted = true;
      setIsMuted(true);
      await video.play().catch(() => undefined);
      setNeedsPlayback(true);
    }
  }, []);

  const addFloatingReaction = useCallback((reaction: FloatingReaction) => {
    setFloatingReactions((current) => [...current.slice(-11), reaction]);
    window.setTimeout(() => {
      setFloatingReactions((current) => current.filter((item) => item.id !== reaction.id));
    }, 3_400);
  }, []);

  useEffect(() => {
    if (!role || !profileReady) return;
    const activeRole = role;
    const supabase = getBrowserSupabaseClient();
    const { isConfigured } = getSupabaseConfiguration();
    if (!isConfigured || !supabase) return;

    let disposed = false;
    const clientId = clientIdRef.current;
    const hostPeers = new Map<string, HostPeer>();
    const knownViewers = new Set<string>();
    const blockedViewers = new Set<string>();
    const viewerIceQueue: RTCIceCandidateInit[] = [];
    const voiceTracks = new Map<string, MediaStreamTrack>();
    let viewerPeer: RTCPeerConnection | null = null;
    let hostId: string | null = null;
    let viewerConnected = false;

    const channel = supabase.channel(`watchwfriends:${roomId}`, {
      config: { broadcast: { ack: true, self: false }, presence: { key: clientId } },
    });

    async function sendSignal(kind: SignalKind, data: SignalMessage["data"] = null, targetId?: string) {
      if (disposed) return;
      await channel.send({
        type: "broadcast",
        event: "signal",
        payload: { data, kind, senderId: clientId, sentAt: Date.now(), targetId } satisfies SignalMessage,
      });
    }
    sendSignalRef.current = sendSignal;

    async function sendRoomEvent(event: RoomEvent) {
      if (!disposed) await channel.send({ type: "broadcast", event: "room-event", payload: event });
    }
    sendRoomEventRef.current = sendRoomEvent;

    async function updatePresence(overrides: Partial<Participant> = {}) {
      const currentProfile = profileRef.current;
      if (!currentProfile || disposed) return;
      await channel.track({
        ...currentProfile,
        clientId,
        isTalking: isTalkingRef.current,
        joinedAt: joinedAtRef.current,
        micEnabled: micEnabledRef.current,
        role: activeRole,
        ...overrides,
      } satisfies Participant);
    }
    updatePresenceRef.current = updatePresence;

    function closeViewerPeer() {
      viewerPeer?.close();
      viewerPeer = null;
      viewerConnected = false;
      remotePlaybackStreamRef.current?.getTracks().forEach((track) => track.stop());
      remotePlaybackStreamRef.current = null;
    }

    function removeVoiceSource(sourceId: string) {
      voiceTracks.delete(sourceId);
      setVoiceStreams((current) => {
        const next = { ...current };
        delete next[sourceId];
        return next;
      });
      hostPeers.forEach((hostPeer, viewerId) => {
        const sender = hostPeer.relayedSenders.get(sourceId);
        if (!sender) return;
        hostPeer.peer.removeTrack(sender);
        hostPeer.relayedSenders.delete(sourceId);
        void negotiateHostPeer(viewerId);
      });
    }

    function closeHostPeer(viewerId: string) {
      hostPeers.get(viewerId)?.peer.close();
      hostPeers.delete(viewerId);
      removeVoiceSource(viewerId);
    }

    function closeAllHostPeers() {
      hostPeers.forEach(({ peer }) => peer.close());
      hostPeers.clear();
      voiceTracks.clear();
      setVoiceStreams({});
    }
    closeHostPeersRef.current = closeAllHostPeers;

    async function negotiateHostPeer(viewerId: string) {
      const hostPeer = hostPeers.get(viewerId);
      if (!hostPeer || hostPeer.peer.connectionState === "closed") return;
      if (hostPeer.peer.signalingState !== "stable") {
        hostPeer.pendingNegotiation = true;
        return;
      }
      hostPeer.pendingNegotiation = false;
      const offer = await hostPeer.peer.createOffer();
      await hostPeer.peer.setLocalDescription(offer);
      await sendSignal("offer", hostPeer.peer.localDescription?.toJSON() ?? offer, viewerId);
    }

    function relayVoiceTrack(sourceViewerId: string, track: MediaStreamTrack) {
      if (voiceTracks.get(sourceViewerId)?.id === track.id) return;
      voiceTracks.set(sourceViewerId, track);
      setVoiceStreams((current) => ({ ...current, [sourceViewerId]: new MediaStream([track]) }));
      hostPeers.forEach((hostPeer, targetViewerId) => {
        if (targetViewerId === sourceViewerId || hostPeer.relayedSenders.has(sourceViewerId)) return;
        const sender = hostPeer.peer.addTrack(track, new MediaStream([track]));
        hostPeer.relayedSenders.set(sourceViewerId, sender);
        void negotiateHostPeer(targetViewerId);
      });
      track.addEventListener("ended", () => removeVoiceSource(sourceViewerId), { once: true });
    }

    async function connectHostToViewer(viewerId: string) {
      const stream = localStreamRef.current;
      if (!stream || disposed || blockedViewers.has(viewerId)) return;
      const existing = hostPeers.get(viewerId)?.peer;
      if (existing && !["closed", "failed", "disconnected"].includes(existing.connectionState)) return;

      closeHostPeer(viewerId);
      const peer = new RTCPeerConnection(getRtcConfiguration());
      const hostPeer: HostPeer = {
        iceQueue: [], peer, pendingNegotiation: false, relayedSenders: new Map(),
      };
      hostPeers.set(viewerId, hostPeer);
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      const microphoneTrack = microphoneTrackRef.current;
      const microphoneStream = microphoneStreamRef.current;
      if (microphoneTrack && microphoneStream) peer.addTrack(microphoneTrack, microphoneStream);
      voiceTracks.forEach((track, sourceViewerId) => {
        if (sourceViewerId === viewerId) return;
        const sender = peer.addTrack(track, new MediaStream([track]));
        hostPeer.relayedSenders.set(sourceViewerId, sender);
      });
      if (peer.getTransceivers().every((transceiver) => transceiver.receiver.track.kind !== "audio")) {
        peer.addTransceiver("audio", { direction: "recvonly" });
      }
      peer.onicecandidate = ({ candidate }) => {
        if (candidate) void sendSignal("ice-candidate", candidate.toJSON(), viewerId);
      };
      peer.ontrack = ({ track }) => {
        if (track.kind === "audio") relayVoiceTrack(viewerId, track);
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "connected") {
          const audience = knownViewers.size;
          setStatusDetail(audience === 1 ? "1 pessoa está recebendo sua tela." : `${audience} pessoas estão recebendo sua tela.`);
        }
        if (["failed", "closed"].includes(peer.connectionState)) closeHostPeer(viewerId);
      };
      await negotiateHostPeer(viewerId);
    }

    connectViewersRef.current = () => {
      knownViewers.forEach((viewerId) => void connectHostToViewer(viewerId));
    };

    function createViewerPeer(nextHostId: string) {
      closeViewerPeer();
      hostId = nextHostId;
      const peer = new RTCPeerConnection(getRtcConfiguration());
      viewerPeer = peer;
      remotePlaybackStreamRef.current = new MediaStream();
      peer.onicecandidate = ({ candidate }) => {
        if (candidate) void sendSignal("ice-candidate", candidate.toJSON(), nextHostId);
      };
      peer.ontrack = ({ track }) => {
        const playbackStream = remotePlaybackStreamRef.current ?? new MediaStream();
        remotePlaybackStreamRef.current = playbackStream;
        if (!playbackStream.getTracks().some((currentTrack) => currentTrack.id === track.id)) playbackStream.addTrack(track);
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = playbackStream;
        if (track.kind === "video") {
          setHasRemoteVideo(true);
          setStatus("watching");
          setStatusDetail("Transmissão recebida em tempo real.");
          void tryRemotePlayback(true);
        } else {
          setHasSharedAudio(true);
        }
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "connected") {
          viewerConnected = true;
          setSignalingConnected(true);
        }
        if (["failed", "disconnected"].includes(peer.connectionState)) {
          viewerConnected = false;
          setStatus("waiting");
          setStatusDetail("Reconectando à transmissão…");
        }
      };
      return peer;
    }

    async function attachMicrophone(track: MediaStreamTrack, stream: MediaStream) {
      if (activeRole === "host") {
        hostPeers.forEach((hostPeer, viewerId) => {
          if (!hostPeer.peer.getSenders().some((sender) => sender.track?.id === track.id)) {
            hostPeer.peer.addTrack(track, stream);
            void negotiateHostPeer(viewerId);
          }
        });
        return;
      }
      if (!viewerPeer || !hostId) return;
      if (!viewerPeer.getSenders().some((sender) => sender.track?.id === track.id)) viewerPeer.addTrack(track, stream);
      if (viewerPeer.signalingState !== "stable") return;
      const offer = await viewerPeer.createOffer();
      await viewerPeer.setLocalDescription(offer);
      await sendSignal("viewer-offer", viewerPeer.localDescription?.toJSON() ?? offer, hostId);
    }
    attachMicrophoneRef.current = attachMicrophone;

    async function detachMicrophone(track: MediaStreamTrack) {
      if (activeRole === "host") {
        hostPeers.forEach((hostPeer, viewerId) => {
          const sender = hostPeer.peer.getSenders().find((candidate) => candidate.track?.id === track.id);
          if (sender) {
            hostPeer.peer.removeTrack(sender);
            void negotiateHostPeer(viewerId);
          }
        });
        return;
      }
      if (!viewerPeer || !hostId) return;
      const sender = viewerPeer.getSenders().find((candidate) => candidate.track?.id === track.id);
      if (sender) viewerPeer.removeTrack(sender);
      if (viewerPeer.signalingState !== "stable") return;
      const offer = await viewerPeer.createOffer();
      await viewerPeer.setLocalDescription(offer);
      await sendSignal("viewer-offer", viewerPeer.localDescription?.toJSON() ?? offer, hostId);
    }
    detachMicrophoneRef.current = detachMicrophone;

    async function handleSignal(message: SignalMessage) {
      if (disposed || message.senderId === clientId || (message.targetId && message.targetId !== clientId)) return;
      try {
        if (activeRole === "host") {
          if (message.kind === "join") {
            if (blockedViewers.has(message.senderId)) return;
            if (roomStateRef.current.isLocked && !knownViewers.has(message.senderId)) {
              await sendRoomEvent({ kind: "room-state", state: roomStateRef.current, targetId: message.senderId });
              return;
            }
            knownViewers.add(message.senderId);
            await sendSignal("host-ready", null, message.senderId);
            await sendRoomEvent({ kind: "room-state", state: roomStateRef.current, targetId: message.senderId });
            if (localStreamRef.current) await connectHostToViewer(message.senderId);
            return;
          }
          if (message.kind === "viewer-left") {
            knownViewers.delete(message.senderId);
            closeHostPeer(message.senderId);
            return;
          }
          const hostPeer = hostPeers.get(message.senderId);
          if (!hostPeer) return;
          if (message.kind === "answer" && isSessionDescription(message.data)) {
            await hostPeer.peer.setRemoteDescription(message.data);
            for (const candidate of hostPeer.iceQueue.splice(0)) await hostPeer.peer.addIceCandidate(candidate);
            if (hostPeer.pendingNegotiation) void negotiateHostPeer(message.senderId);
          }
          if (message.kind === "viewer-offer" && isSessionDescription(message.data)) {
            if (hostPeer.peer.signalingState === "have-local-offer") {
              await hostPeer.peer.setLocalDescription({ type: "rollback" });
              hostPeer.pendingNegotiation = true;
            }
            await hostPeer.peer.setRemoteDescription(message.data);
            const answer = await hostPeer.peer.createAnswer();
            await hostPeer.peer.setLocalDescription(answer);
            await sendSignal("host-answer", hostPeer.peer.localDescription?.toJSON() ?? answer, message.senderId);
          }
          if (message.kind === "ice-candidate" && isIceCandidate(message.data)) {
            if (hostPeer.peer.remoteDescription) await hostPeer.peer.addIceCandidate(message.data);
            else hostPeer.iceQueue.push(message.data);
          }
          return;
        }
        if (message.kind === "host-ready") {
          hostId = message.senderId;
          if (!viewerConnected) {
            setStatus("waiting");
            setStatusDetail("O anfitrião está na sala. Aguardando a tela…");
          }
          await sendSignal("join", null, message.senderId);
          return;
        }
        if (message.kind === "host-left") {
          closeViewerPeer();
          setHasRemoteVideo(false);
          setStatus("ended");
          setStatusDetail("O anfitrião saiu da sala.");
          return;
        }
        if (message.kind === "stream-stopped") {
          closeViewerPeer();
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
          setHasRemoteVideo(false);
          setHasSharedAudio(false);
          setStatus("waiting");
          setStatusDetail("O anfitrião pausou o compartilhamento.");
          return;
        }
        if (message.kind === "offer" && isSessionDescription(message.data)) {
          const peer = viewerPeer && hostId === message.senderId ? viewerPeer : createViewerPeer(message.senderId);
          hostId = message.senderId;
          if (peer.signalingState === "have-local-offer") await peer.setLocalDescription({ type: "rollback" });
          await peer.setRemoteDescription(message.data);
          const microphoneTrack = microphoneTrackRef.current;
          const microphoneStream = microphoneStreamRef.current;
          if (microphoneTrack && microphoneStream && !peer.getSenders().some((sender) => sender.track?.id === microphoneTrack.id)) {
            peer.addTrack(microphoneTrack, microphoneStream);
          }
          for (const candidate of viewerIceQueue.splice(0)) await peer.addIceCandidate(candidate);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          await sendSignal("answer", peer.localDescription?.toJSON() ?? answer, message.senderId);
          return;
        }
        if (message.kind === "host-answer" && isSessionDescription(message.data) && viewerPeer) {
          await viewerPeer.setRemoteDescription(message.data);
          return;
        }
        if (message.kind === "ice-candidate" && isIceCandidate(message.data)) {
          hostId = message.senderId;
          if (viewerPeer?.remoteDescription) await viewerPeer.addIceCandidate(message.data);
          else viewerIceQueue.push(message.data);
        }
      } catch {
        if (!disposed) {
          setStatus("error");
          setStatusDetail("Não foi possível concluir a conexão WebRTC.");
          setErrorMessage("A conexão direta falhou. Um servidor TURN pode ser necessário para esta rede.");
        }
      }
    }

    async function handleRoomEvent(event: RoomEvent) {
      if ("targetId" in event && event.targetId && event.targetId !== clientId) return;
      if (event.kind === "chat") setMessages((current) => [...current.slice(-(maxChatMessages - 1)), event.message]);
      if (event.kind === "reaction") {
        addFloatingReaction({
          emoji: event.emoji,
          id: event.id,
          left: 12 + Math.floor(Math.random() * 74),
          senderName: event.senderName,
        });
      }
      if (event.kind === "request-room-state" && activeRole === "host") {
        await sendRoomEvent({ kind: "room-state", state: roomStateRef.current, targetId: event.senderId });
      }
      if (event.kind === "room-state") {
        roomStateRef.current = event.state;
        setRoomState(event.state);
        setTitleDraft(event.state.title);
        if (event.targetId && event.state.isLocked && activeRole === "viewer" && !viewerConnected) {
          accessMessageRef.current = "Esta sala está trancada pelo anfitrião.";
          setAccessMessage("Esta sala está trancada pelo anfitrião.");
          setStatus("ended");
          setStatusDetail("A entrada de novos participantes foi pausada.");
          await channel.untrack();
        }
      }
      if (event.kind === "kick" && event.targetId === clientId) {
        accessMessageRef.current = "Você foi removido desta sessão pelo anfitrião.";
        setAccessMessage("Você foi removido desta sessão pelo anfitrião.");
        setStatus("ended");
        setStatusDetail("Sua participação nesta sessão foi encerrada.");
        closeViewerPeer();
        await channel.untrack();
      }
      if (event.kind === "session-ended" && activeRole === "viewer") {
        accessMessageRef.current = "O anfitrião encerrou a sessão para todos.";
        setAccessMessage("O anfitrião encerrou a sessão para todos.");
        setStatus("ended");
        setStatusDetail("Obrigado por assistir com a galera.");
        closeViewerPeer();
        await channel.untrack();
      }
      if (event.kind === "mic-state" && activeRole === "host" && !event.enabled) removeVoiceSource(event.senderId);
    }

    kickParticipantRef.current = (targetId) => {
      if (activeRole !== "host" || targetId === clientId) return;
      blockedViewers.add(targetId);
      knownViewers.delete(targetId);
      closeHostPeer(targetId);
      setParticipants((current) => current.filter((participant) => participant.clientId !== targetId));
      void sendRoomEvent({ kind: "kick", targetId });
    };

    channel
      .on("broadcast", { event: "signal" }, ({ payload }) => void handleSignal(payload as SignalMessage))
      .on("broadcast", { event: "room-event" }, ({ payload }) => {
        if (isRoomEvent(payload)) void handleRoomEvent(payload);
      })
      .on("presence", { event: "sync" }, () => {
        const presence = channel.presenceState() as Record<string, PresencePayload[]>;
        const nextParticipants = Object.entries(presence)
          .flatMap(([presenceKey, members]) => {
            const member = members.at(-1);
            if (!member?.nickname || !member.avatar || !member.color || !member.role) return [];
            const participant: Participant = {
              avatar: member.avatar,
              clientId: member.clientId ?? presenceKey,
              color: member.color,
              isTalking: Boolean(member.isTalking),
              joinedAt: member.joinedAt ?? 0,
              micEnabled: Boolean(member.micEnabled),
              nickname: member.nickname,
              role: member.role,
            };
            return blockedViewers.has(participant.clientId) ? [] : [participant];
          })
          .sort((a, b) => (a.role === b.role ? a.joinedAt - b.joinedAt : a.role === "host" ? -1 : 1));
        setParticipants(nextParticipants);
        if (activeRole === "host") {
          const liveViewerIds = new Set(nextParticipants.filter((member) => member.role === "viewer").map((member) => member.clientId));
          knownViewers.forEach((viewerId) => {
            if (!liveViewerIds.has(viewerId)) {
              knownViewers.delete(viewerId);
              closeHostPeer(viewerId);
            }
          });
        }
      })
      .subscribe(async (subscriptionStatus) => {
        if (disposed) return;
        if (subscriptionStatus === "SUBSCRIBED") {
          setSignalingConnected(true);
          await updatePresence();
          if (activeRole === "host") {
            setStatus(localStreamRef.current ? "sharing" : "ready");
            setStatusDetail("Sala aberta. Convide seus amigos para entrar.");
          } else {
            setStatus("waiting");
            setStatusDetail("Aguardando o anfitrião iniciar a transmissão…");
            await sendRoomEvent({ kind: "request-room-state", senderId: clientId });
            await sendSignal("join");
          }
        }
        if (["CHANNEL_ERROR", "TIMED_OUT"].includes(subscriptionStatus)) {
          setSignalingConnected(false);
          setStatus("error");
          setStatusDetail("O canal da sala não respondeu.");
          setErrorMessage("Confira as variáveis do Supabase e sua conexão com a internet.");
        }
      });

    const joinTimer = window.setInterval(() => {
      if (activeRole === "viewer" && !viewerConnected && !accessMessageRef.current) void sendSignal("join", null, hostId ?? undefined);
    }, 4_000);
    function announceDeparture() {
      void sendSignal(activeRole === "host" ? "host-left" : "viewer-left", null, hostId ?? undefined);
    }
    window.addEventListener("beforeunload", announceDeparture);

    return () => {
      window.clearInterval(joinTimer);
      window.removeEventListener("beforeunload", announceDeparture);
      announceDeparture();
      disposed = true;
      closeViewerPeer();
      closeAllHostPeers();
      void supabase.removeChannel(channel);
      sendSignalRef.current = null;
      sendRoomEventRef.current = null;
      updatePresenceRef.current = null;
      connectViewersRef.current = null;
      closeHostPeersRef.current = null;
      attachMicrophoneRef.current = null;
      detachMicrophoneRef.current = null;
      kickParticipantRef.current = null;
    };
  }, [addFloatingReaction, profileReady, role, roomId, tryRemotePlayback]);

  useEffect(() => {
    if (!isMicrophoneEnabled || microphoneMode !== "push") return;
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.code !== "Space" || target?.matches("input, textarea, [contenteditable='true']")) return;
      event.preventDefault();
      if (!event.repeat) setPushToTalk(true);
    }
    function handleKeyUp(event: KeyboardEvent) {
      if (event.code === "Space") setPushToTalk(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  });

  useEffect(() => () => {
    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_800);
    } catch {
      setErrorMessage("Não foi possível copiar automaticamente. Copie o endereço do navegador.");
    }
  }

  function shareOnWhatsApp() {
    const text = `Vem assistir “${roomState.title}” comigo no watchWfriends: ${inviteUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profileDraft) return;
    const nickname = sanitizeNickname(profileDraft.nickname);
    if (!nickname) return;
    const nextProfile = { ...profileDraft, nickname };
    localStorage.setItem("watchwfriends:profile", JSON.stringify(nextProfile));
    profileRef.current = nextProfile;
    setProfile(nextProfile);
    setProfileDraft(nextProfile);
    setShowProfileEditor(false);
    void updatePresenceRef.current?.(nextProfile);
  }

  function sendChatMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const currentProfile = profileRef.current;
    const body = messageDraft.replace(/\s+/g, " ").trim().slice(0, 500);
    if (!body || !currentProfile) return;
    const message: ChatMessage = {
      avatar: currentProfile.avatar,
      body,
      color: currentProfile.color,
      id: crypto.randomUUID(),
      senderId: clientIdRef.current,
      senderName: currentProfile.nickname,
      sentAt: Date.now(),
    };
    setMessages((current) => [...current.slice(-(maxChatMessages - 1)), message]);
    setMessageDraft("");
    void sendRoomEventRef.current?.({ kind: "chat", message });
  }

  function sendReaction(emoji: string) {
    const currentProfile = profileRef.current;
    if (!currentProfile) return;
    const id = crypto.randomUUID();
    addFloatingReaction({ emoji, id, left: 12 + Math.floor(Math.random() * 74), senderName: currentProfile.nickname });
    void sendRoomEventRef.current?.({ emoji, id, kind: "reaction", senderId: clientIdRef.current, senderName: currentProfile.nickname });
  }

  function saveSessionTitle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isHost) return;
    const title = sanitizeSessionTitle(titleDraft) || defaultRoomState.title;
    const nextState = { ...roomState, title };
    roomStateRef.current = nextState;
    setRoomState(nextState);
    setTitleDraft(title);
    setIsEditingTitle(false);
    sessionStorage.setItem(`watchwfriends:title:${roomId}`, title);
    void sendRoomEventRef.current?.({ kind: "room-state", state: nextState });
  }

  function toggleRoomLock() {
    if (!isHost) return;
    const nextState = { ...roomState, isLocked: !roomState.isLocked };
    roomStateRef.current = nextState;
    setRoomState(nextState);
    void sendRoomEventRef.current?.({ kind: "room-state", state: nextState });
  }

  async function endSession() {
    if (!isHost) return;
    await sendRoomEventRef.current?.({ kind: "session-ended" });
    await sendSignalRef.current?.("host-left");
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
    sessionStorage.removeItem(`watchwfriends:host:${roomId}`);
    router.push("/");
  }

  async function toggleMute() {
    const video = remoteVideoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
    if (!video.muted) await tryRemotePlayback(true);
  }

  function updateVolume(nextVolume: number) {
    volumeRef.current = nextVolume;
    setVolume(nextVolume);
    const video = remoteVideoRef.current;
    if (!video) return;
    video.volume = nextVolume;
    video.muted = nextVolume === 0;
    setIsMuted(video.muted);
  }

  async function togglePictureInPicture() {
    const video = isHost ? localVideoRef.current : remoteVideoRef.current;
    if (!video || !("pictureInPictureEnabled" in document)) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {
      setErrorMessage("O modo picture-in-picture não está disponível neste navegador.");
    }
  }

  function setPushToTalk(active: boolean) {
    if (microphoneMode !== "push" || !microphoneTrackRef.current) return;
    microphoneTrackRef.current.enabled = active;
    isTalkingRef.current = active;
    setIsTalking(active);
    void updatePresenceRef.current?.({ isTalking: active });
  }

  async function enableMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("Este navegador não oferece acesso ao microfone.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { autoGainControl: true, echoCancellation: true, noiseSuppression: true },
      });
      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error("Microphone track unavailable");
      track.enabled = microphoneMode === "open";
      microphoneStreamRef.current = stream;
      microphoneTrackRef.current = track;
      micEnabledRef.current = true;
      isTalkingRef.current = track.enabled;
      setIsMicrophoneEnabled(true);
      setIsTalking(track.enabled);
      await attachMicrophoneRef.current?.(track, stream);
      await updatePresenceRef.current?.({ isTalking: track.enabled, micEnabled: true });
      await sendRoomEventRef.current?.({ enabled: true, kind: "mic-state", senderId: clientIdRef.current });
      track.addEventListener("ended", () => void disableMicrophone(), { once: true });
    } catch {
      setErrorMessage("Não foi possível ativar o microfone. Revise a permissão do navegador.");
    }
  }

  async function disableMicrophone() {
    const track = microphoneTrackRef.current;
    if (!track) return;
    microphoneTrackRef.current = null;
    microphoneStreamRef.current = null;
    micEnabledRef.current = false;
    isTalkingRef.current = false;
    setIsMicrophoneEnabled(false);
    setIsTalking(false);
    await detachMicrophoneRef.current?.(track);
    track.stop();
    await updatePresenceRef.current?.({ isTalking: false, micEnabled: false });
    await sendRoomEventRef.current?.({ enabled: false, kind: "mic-state", senderId: clientIdRef.current });
  }

  function changeMicrophoneMode(mode: "open" | "push") {
    setMicrophoneMode(mode);
    const track = microphoneTrackRef.current;
    if (!track) return;
    const talking = mode === "open";
    track.enabled = talking;
    isTalkingRef.current = talking;
    setIsTalking(talking);
    void updatePresenceRef.current?.({ isTalking: talking });
  }

  function leaveRoom() {
    void disableMicrophone();
    if (isHost) {
      sessionStorage.removeItem(`watchwfriends:host:${roomId}`);
      void sendSignalRef.current?.("host-left");
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
    } else {
      void sendSignalRef.current?.("viewer-left");
    }
    router.push("/");
  }

  const activeVideo = isSharing || hasRemoteVideo;
  const currentProfile = profile ?? profileDraft;

  return (
    <main className={`room-shell ${isTheaterMode ? "theater-mode" : ""}`}>
      <div className="room-grain" aria-hidden="true" />
      <header className="room-header">
        <Link className="wordmark" href="/" aria-label="Voltar ao início">
          <span className="wordmark-mark" aria-hidden="true"><span /></span>watchWfriends
        </Link>
        <button className="room-code" onClick={copyInvite} aria-label="Copiar link da sala">
          <span>SALA</span><strong>{formatRoomId(roomId)}</strong>{copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
        <div className="room-header-actions">
          {currentProfile ? (
            <button className="header-profile" onClick={() => setShowProfileEditor(true)} aria-label="Editar seu perfil">
              <ParticipantAvatar participant={currentProfile} size="small" /><span>{currentProfile.nickname}</span>
            </button>
          ) : null}
          <button className="leave-button" onClick={leaveRoom}><span>Sair</span><LogOut size={17} aria-hidden="true" /></button>
        </div>
      </header>

      <div className="room-layout">
        <section className="broadcast-column">
          <div className="broadcast-meta">
            <div className={`broadcast-state state-${status}`} aria-live="polite"><i />{statusCopy[status]}</div>
            {isEditingTitle && isHost ? (
              <form className="session-title-form" onSubmit={saveSessionTitle}>
                <input value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} maxLength={56} autoFocus />
                <button type="submit" aria-label="Salvar nome da sessão"><Check size={15} /></button>
                <button type="button" onClick={() => setIsEditingTitle(false)} aria-label="Cancelar"><X size={15} /></button>
              </form>
            ) : (
              <button className="session-title" onClick={() => isHost && setIsEditingTitle(true)} disabled={!isHost}>
                <Film size={14} /><span>{roomState.title}</span>{isHost ? <Edit3 size={12} /> : null}
              </button>
            )}
          </div>

          <div className={`video-stage ${activeVideo ? "stage-active" : ""}`} ref={stageRef}>
            <div className="stage-grid" aria-hidden="true" />
            {isHost ? (
              <video ref={localVideoRef} className={`stream-video ${isSharing ? "visible" : ""}`} autoPlay muted playsInline />
            ) : (
              <video
                ref={remoteVideoRef}
                className={`stream-video ${hasRemoteVideo ? "visible" : ""}`}
                autoPlay
                playsInline
              />
            )}

            {!role || !profileReady ? (
              <StageMessage icon={<Radio />} title="Preparando seu lugar…" detail="Escolha como você quer aparecer na sala." />
            ) : status === "config-error" ? (
              <StageMessage icon={<Settings2 />} title="Conecte o Supabase" detail="Copie .env.example para .env.local e preencha a URL e a chave publicável do projeto." />
            ) : accessMessage ? (
              <StageMessage icon={<Lock />} title="Acesso encerrado" detail={accessMessage} />
            ) : isHost && !isSharing ? (
              <div className="stage-message host-ready-message">
                <span className="stage-icon"><MonitorUp size={27} /></span>
                <span className="stage-label">SALA PRONTA / {formatRoomId(roomId)}</span>
                <h1>O que vamos assistir?</h1>
                <p>Compartilhe uma aba para transmitir também o áudio do vídeo.</p>
                <button className="button button-primary share-button" onClick={startSharing} disabled={isStarting || status === "connecting"}>
                  <MonitorUp size={19} />{isStarting ? "Abrindo seletor…" : "Compartilhar tela e áudio"}
                </button>
              </div>
            ) : !isHost && !hasRemoteVideo ? (
              <StageMessage
                icon={status === "ended" ? <ScreenShareOff /> : <Radio />}
                title={status === "ended" ? "A sessão terminou" : "Aguardando a tela"}
                detail={statusDetail}
                animated={status !== "ended"}
              />
            ) : null}

            {needsPlayback && hasRemoteVideo ? (
              <button className="playback-gate" onClick={() => tryRemotePlayback(true)}><span><Volume2 size={24} /></span>Clique para ativar o áudio</button>
            ) : null}

            {activeVideo ? (
              <div className="live-corner">
                <span><i /> AO VIVO</span>
                <span>{hasSharedAudio ? <AudioLines size={14} /> : <VolumeX size={14} />} {hasSharedAudio ? "COM ÁUDIO" : "SEM ÁUDIO"}</span>
              </div>
            ) : null}

            <div className="reaction-layer" aria-live="polite">
              {floatingReactions.map((reaction) => (
                <div className="floating-reaction" key={reaction.id} style={{ left: `${reaction.left}%` }}>
                  <span>{reaction.emoji}</span><small>{reaction.senderName}</small>
                </div>
              ))}
            </div>

            {activeVideo ? (
              <>
                <div className="reaction-dock" aria-label="Reações rápidas">
                  {reactionOptions.map((emoji) => <button key={emoji} onClick={() => sendReaction(emoji)}>{emoji}</button>)}
                </div>
                <div className="stage-controls">
                  {isHost ? (
                    <button onClick={() => void stopSharing()}><ScreenShareOff size={17} /><span>Parar</span></button>
                  ) : (
                    <div className="volume-control">
                      <button onClick={() => void toggleMute()} aria-label={isMuted ? "Ativar som" : "Silenciar"}>{isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
                      <input type="range" min="0" max="1" step="0.05" value={isMuted ? 0 : volume} onChange={(event) => updateVolume(Number(event.target.value))} aria-label="Volume da transmissão" />
                    </div>
                  )}
                  <button className={`icon-control ${isMicrophoneEnabled ? "control-active" : ""}`} onClick={() => void (isMicrophoneEnabled ? disableMicrophone() : enableMicrophone())} aria-label={isMicrophoneEnabled ? "Desativar microfone" : "Ativar microfone"}>
                    {isMicrophoneEnabled ? <Mic size={18} /> : <MicOff size={18} />}
                  </button>
                  <button className={`icon-control ${isTheaterMode ? "control-active" : ""}`} onClick={() => setIsTheaterMode((current) => !current)} aria-label="Modo cinema"><Theater size={18} /></button>
                  <button className={`icon-control ${isPictureInPicture ? "control-active" : ""}`} onClick={() => void togglePictureInPicture()} aria-label="Picture-in-picture"><PictureInPicture2 size={18} /></button>
                  <button className="icon-control" onClick={() => void stageRef.current?.requestFullscreen().catch(() => undefined)} aria-label="Tela cheia"><Expand size={18} /></button>
                </div>
              </>
            ) : null}

            {isMicrophoneEnabled ? (
              <div className="microphone-mode">
                <div className="mic-mode-tabs">
                  <button className={microphoneMode === "open" ? "selected" : ""} onClick={() => changeMicrophoneMode("open")}>Aberto</button>
                  <button className={microphoneMode === "push" ? "selected" : ""} onClick={() => changeMicrophoneMode("push")}>Apertar para falar</button>
                </div>
                {microphoneMode === "push" ? (
                  <button
                    className={`push-talk-button ${isTalking ? "talking" : ""}`}
                    onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) => { event.currentTarget.setPointerCapture(event.pointerId); setPushToTalk(true); }}
                    onPointerUp={() => setPushToTalk(false)}
                    onPointerCancel={() => setPushToTalk(false)}
                  ><Mic size={16} />{isTalking ? "Falando…" : "Segure para falar"}</button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="broadcast-caption">
            <p>{statusDetail}</p>
            <span>{hasSharedAudio ? "Faixa de áudio detectada" : "Dica: marque “Compartilhar áudio” no seletor do navegador"}</span>
          </div>
        </section>

        <aside className="room-sidebar">
          <div className="sidebar-session-head">
            <div><span className="sidebar-label">Sessão atual</span><strong>{roomState.title}</strong></div>
            <span className={`connection-dot ${signalingConnected ? "online" : ""}`} title={signalingConnected ? "Conectado" : "Conectando"} />
          </div>

          <div className="invite-actions">
            <button className="button button-primary" onClick={copyInvite}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copiado" : "Copiar link"}</button>
            <button className="whatsapp-button" onClick={shareOnWhatsApp} aria-label="Compartilhar no WhatsApp"><span>WA</span></button>
          </div>

          {isHost ? (
            <div className="host-controls">
              <button onClick={toggleRoomLock}>{roomState.isLocked ? <Lock size={15} /> : <LockOpen size={15} />}{roomState.isLocked ? "Sala trancada" : "Trancar sala"}</button>
              <button className="end-session-button" onClick={() => void endSession()}><ScreenShareOff size={15} />Encerrar</button>
            </div>
          ) : roomState.isLocked ? (
            <div className="locked-room-note"><Lock size={13} />Sala trancada para novas entradas</div>
          ) : null}

          <div className="social-tabs" role="tablist" aria-label="Painel social">
            <button className={socialTab === "people" ? "active" : ""} onClick={() => setSocialTab("people")} role="tab"><UsersRound size={15} />Pessoas <span>{participants.length}</span></button>
            <button className={socialTab === "chat" ? "active" : ""} onClick={() => setSocialTab("chat")} role="tab"><MessageCircle size={15} />Chat {messages.length ? <span>{messages.length}</span> : null}</button>
          </div>

          {socialTab === "people" ? (
            <div className="participants-panel" role="tabpanel">
              <div className="participant-stack" aria-hidden="true">
                {participants.slice(0, 5).map((participant) => <ParticipantAvatar key={participant.clientId} participant={participant} size="small" />)}
              </div>
              <p className="participants-summary">{participants.length === 1 ? "Só você por enquanto" : `${participants.length} pessoas na sessão`}</p>
              <div className="participants-list">
                {participants.map((participant) => (
                  <div className="participant-row" key={participant.clientId}>
                    <ParticipantAvatar participant={participant} />
                    <div className="participant-name">
                      <strong>{participant.nickname}{participant.clientId === clientIdRef.current ? " (você)" : ""}</strong>
                      <span>{participant.role === "host" ? "Anfitrião" : participant.isTalking ? "Falando agora" : "Na sessão"}</span>
                    </div>
                    <span className={`participant-mic ${participant.isTalking ? "talking" : ""}`}>{participant.micEnabled ? <Mic size={14} /> : <MicOff size={14} />}</span>
                    {isHost && participant.role === "viewer" ? (
                      <button className="kick-button" onClick={() => kickParticipantRef.current?.(participant.clientId)} aria-label={`Remover ${participant.nickname}`}><UserRoundX size={15} /></button>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="connection-summary"><Wifi size={14} />{signalingConnected ? "Canal conectado" : "Conectando ao canal"}</div>
            </div>
          ) : (
            <div className="chat-panel" role="tabpanel">
              <div className="chat-messages" aria-live="polite">
                {messages.length ? messages.map((message) => (
                  <div className={`chat-message ${message.senderId === clientIdRef.current ? "own-message" : ""}`} key={message.id}>
                    <ParticipantAvatar participant={{ avatar: message.avatar, color: message.color }} size="tiny" />
                    <div>
                      <span><strong>{message.senderName}</strong><time>{new Date(message.sentAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time></span>
                      <p>{message.body}</p>
                    </div>
                  </div>
                )) : (
                  <div className="empty-chat"><MessageCircle size={25} /><strong>Puxe assunto</strong><span>O chat começa quando alguém manda a primeira mensagem.</span></div>
                )}
                <div ref={chatEndRef} />
              </div>
              <form className="chat-form" onSubmit={sendChatMessage}>
                <input value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} placeholder="Escreva uma mensagem…" maxLength={500} />
                <button type="submit" disabled={!messageDraft.trim()} aria-label="Enviar mensagem"><Send size={16} /></button>
              </form>
              <div className="sidebar-reactions"><SmilePlus size={14} />{reactionOptions.map((emoji) => <button key={emoji} onClick={() => sendReaction(emoji)}>{emoji}</button>)}</div>
            </div>
          )}
        </aside>
      </div>

      {Object.entries(voiceStreams).map(([participantId, stream]) => <VoiceAudio key={participantId} stream={stream} />)}

      {showProfileEditor && profileDraft ? (
        <div className="profile-modal-backdrop" role="presentation">
          <form className="profile-modal" onSubmit={saveProfile}>
            {profile ? <button className="profile-close" type="button" onClick={() => setShowProfileEditor(false)} aria-label="Fechar"><X size={17} /></button> : null}
            <span className="profile-kicker">SEU LUGAR NA SESSÃO</span>
            <h2>{profile ? "Edite seu perfil" : "Como seus amigos vão te ver?"}</h2>
            <p>Escolha um avatar e um apelido. Você poderá mudar isso depois.</p>
            <div className="avatar-picker" aria-label="Escolha um avatar">
              {avatarOptions.map((option) => (
                <button
                  className={profileDraft.avatar === option.avatar ? "selected" : ""}
                  key={option.avatar}
                  type="button"
                  style={{ "--avatar-color": option.color } as React.CSSProperties}
                  onClick={() => setProfileDraft({ ...profileDraft, avatar: option.avatar, color: option.color })}
                >{option.avatar}</button>
              ))}
            </div>
            <label htmlFor="profile-nickname">Seu apelido</label>
            <input id="profile-nickname" value={profileDraft.nickname} onChange={(event) => setProfileDraft({ ...profileDraft, nickname: event.target.value })} maxLength={24} autoFocus />
            <button className="button button-primary profile-save" type="submit" disabled={!sanitizeNickname(profileDraft.nickname)}><Check size={17} />Entrar na sessão</button>
          </form>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="error-toast" role="alert"><CircleAlert size={18} /><span>{errorMessage}</span><button onClick={() => setErrorMessage("")} aria-label="Fechar aviso">×</button></div>
      ) : null}
    </main>
  );
}

function ParticipantAvatar({ participant, size = "regular" }: {
  participant: Pick<Profile, "avatar" | "color">;
  size?: "regular" | "small" | "tiny";
}) {
  return (
    <span className={`participant-avatar avatar-${size}`} style={{ "--avatar-color": participant.color } as React.CSSProperties}>
      {participant.avatar}
    </span>
  );
}

function VoiceAudio({ stream }: { stream: MediaStream }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.srcObject = stream;
    void audioRef.current.play().catch(() => undefined);
  }, [stream]);
  return <audio ref={audioRef} autoPlay className="voice-audio" />;
}

function StageMessage({ animated = false, detail, icon, title }: {
  animated?: boolean;
  detail: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="stage-message viewer-wait-message">
      <span className={`stage-icon ${animated ? "stage-icon-pulse" : ""}`}>{icon}</span>
      <h1>{title}</h1><p>{detail}</p>
      {animated ? <div className="waiting-line"><span /></div> : null}
    </div>
  );
}
