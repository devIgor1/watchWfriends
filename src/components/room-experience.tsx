"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  AudioLines,
  Check,
  CircleAlert,
  Copy,
  Expand,
  Link2,
  LogOut,
  MonitorUp,
  Radio,
  ScreenShareOff,
  Settings2,
  UsersRound,
  Volume2,
  VolumeX,
  Wifi,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { formatRoomId } from "@/lib/room";
import {
  getBrowserSupabaseClient,
  getSupabaseConfiguration,
} from "@/lib/supabase";
import {
  captureDisplay,
  createClientId,
  getRtcConfiguration,
  isIceCandidate,
  isSessionDescription,
  type SignalKind,
  type SignalMessage,
} from "@/lib/webrtc";

type Role = "host" | "viewer";
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
};

const statusCopy: Record<ExperienceStatus, string> = {
  "config-error": "Configuração necessária",
  connecting: "Conectando à sala",
  ended: "Sessão encerrada",
  error: "Falha na conexão",
  ready: "Sala pronta",
  sharing: "Transmitindo agora",
  waiting: "Aguardando transmissão",
  watching: "Assistindo ao vivo",
};

const subscribeToHydration = () => () => undefined;

export function RoomExperience({ roomId }: { roomId: string }) {
  const router = useRouter();
  const isHydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const role: Role | null = isHydrated
    ? sessionStorage.getItem(`watchwfriends:host:${roomId}`) === "true"
      ? "host"
      : "viewer"
    : null;
  const isSupabaseConfigured = getSupabaseConfiguration().isConfigured;
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const sendSignalRef = useRef<
    ((kind: SignalKind, data?: SignalMessage["data"], targetId?: string) => Promise<void>) | null
  >(null);
  const connectViewersRef = useRef<(() => void) | null>(null);
  const closeHostPeersRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<ExperienceStatus>(
    isSupabaseConfigured ? "connecting" : "config-error",
  );
  const [statusDetail, setStatusDetail] = useState(
    isSupabaseConfigured
      ? "Preparando o canal seguro…"
      : "Adicione as variáveis do Supabase para ativar as salas.",
  );
  const [viewerCount, setViewerCount] = useState(0);
  const [isStarting, setIsStarting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [hasSharedAudio, setHasSharedAudio] = useState(false);
  const [needsPlayback, setNeedsPlayback] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [signalingConnected, setSignalingConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/room/${roomId}`;
  }, [roomId]);

  const stopSharing = useCallback(async () => {
    const stream = localStreamRef.current;
    localStreamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
    closeHostPeersRef.current?.();

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

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

      stream.getVideoTracks()[0]?.addEventListener(
        "ended",
        () => void stopSharing(),
        { once: true },
      );
      connectViewersRef.current?.();
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setStatus("ready");
        setStatusDetail("O compartilhamento foi cancelado.");
      } else {
        setStatus("error");
        setErrorMessage("Não foi possível capturar sua tela. Revise a permissão do navegador e tente novamente.");
      }
    } finally {
      setIsStarting(false);
    }
  }, [stopSharing]);

  const tryRemotePlayback = useCallback(async (withAudio = true) => {
    const video = remoteVideoRef.current;
    if (!video) return;

    video.muted = !withAudio;
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

  useEffect(() => {
    if (!role) return;

    const supabase = getBrowserSupabaseClient();
    const { isConfigured } = getSupabaseConfiguration();

    if (!isConfigured || !supabase) return;

    let disposed = false;
    const clientId = createClientId();
    const hostPeers = new Map<string, HostPeer>();
    const knownViewers = new Set<string>();
    const viewerIceQueue: RTCIceCandidateInit[] = [];
    let viewerPeer: RTCPeerConnection | null = null;
    let hostId: string | null = null;
    let viewerConnected = false;

    const channel = supabase.channel(`watchwfriends:${roomId}`, {
      config: {
        broadcast: { ack: true, self: false },
        presence: { key: clientId },
      },
    });
    channelRef.current = channel;

    async function sendSignal(
      kind: SignalKind,
      data: SignalMessage["data"] = null,
      targetId?: string,
    ) {
      if (disposed) return;

      await channel.send({
        type: "broadcast",
        event: "signal",
        payload: {
          data,
          kind,
          senderId: clientId,
          sentAt: Date.now(),
          targetId,
        } satisfies SignalMessage,
      });
    }
    sendSignalRef.current = sendSignal;

    function closeViewerPeer() {
      viewerPeer?.close();
      viewerPeer = null;
      viewerConnected = false;
    }

    function closeHostPeer(viewerId: string) {
      hostPeers.get(viewerId)?.peer.close();
      hostPeers.delete(viewerId);
    }

    function closeAllHostPeers() {
      hostPeers.forEach(({ peer }) => peer.close());
      hostPeers.clear();
    }
    closeHostPeersRef.current = closeAllHostPeers;

    async function connectHostToViewer(viewerId: string) {
      const stream = localStreamRef.current;
      if (!stream || disposed) return;

      const existing = hostPeers.get(viewerId)?.peer;
      if (
        existing &&
        !["closed", "failed", "disconnected"].includes(existing.connectionState)
      ) {
        return;
      }

      closeHostPeer(viewerId);
      const peer = new RTCPeerConnection(getRtcConfiguration());
      const hostPeer: HostPeer = { iceQueue: [], peer };
      hostPeers.set(viewerId, hostPeer);
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));

      peer.onicecandidate = ({ candidate }) => {
        if (candidate) {
          void sendSignal("ice-candidate", candidate.toJSON(), viewerId);
        }
      };

      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "connected") {
          setStatusDetail(
            knownViewers.size === 1
              ? "1 pessoa está recebendo sua tela."
              : `${knownViewers.size} pessoas estão recebendo sua tela.`,
          );
        }

        if (["failed", "closed"].includes(peer.connectionState)) {
          closeHostPeer(viewerId);
        }
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await sendSignal("offer", peer.localDescription?.toJSON() ?? offer, viewerId);
    }

    connectViewersRef.current = () => {
      knownViewers.forEach((viewerId) => void connectHostToViewer(viewerId));
    };

    function createViewerPeer(nextHostId: string) {
      closeViewerPeer();
      hostId = nextHostId;
      const peer = new RTCPeerConnection(getRtcConfiguration());
      viewerPeer = peer;

      peer.onicecandidate = ({ candidate }) => {
        if (candidate) {
          void sendSignal("ice-candidate", candidate.toJSON(), nextHostId);
        }
      };

      peer.ontrack = ({ streams }) => {
        const [stream] = streams;
        if (!stream || disposed) return;

        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
        setHasRemoteVideo(true);
        setHasSharedAudio(stream.getAudioTracks().length > 0);
        setStatus("watching");
        setStatusDetail("Transmissão recebida em tempo real.");
        void tryRemotePlayback(true);
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

    async function handleSignal(message: SignalMessage) {
      if (
        disposed ||
        message.senderId === clientId ||
        (message.targetId && message.targetId !== clientId)
      ) {
        return;
      }

      try {
        if (role === "host") {
          if (message.kind === "join") {
            knownViewers.add(message.senderId);
            await sendSignal("host-ready", null, message.senderId);
            if (localStreamRef.current) {
              await connectHostToViewer(message.senderId);
            }
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
            for (const candidate of hostPeer.iceQueue.splice(0)) {
              await hostPeer.peer.addIceCandidate(candidate);
            }
          }

          if (message.kind === "ice-candidate" && isIceCandidate(message.data)) {
            if (hostPeer.peer.remoteDescription) {
              await hostPeer.peer.addIceCandidate(message.data);
            } else {
              hostPeer.iceQueue.push(message.data);
            }
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
          const peer = createViewerPeer(message.senderId);
          await peer.setRemoteDescription(message.data);
          for (const candidate of viewerIceQueue.splice(0)) {
            await peer.addIceCandidate(candidate);
          }
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          await sendSignal("answer", peer.localDescription?.toJSON() ?? answer, message.senderId);
          return;
        }

        if (message.kind === "ice-candidate" && isIceCandidate(message.data)) {
          hostId = message.senderId;
          if (viewerPeer?.remoteDescription) {
            await viewerPeer.addIceCandidate(message.data);
          } else {
            viewerIceQueue.push(message.data);
          }
        }
      } catch {
        if (!disposed) {
          setStatus("error");
          setStatusDetail("Não foi possível concluir a conexão WebRTC.");
          setErrorMessage("A conexão direta falhou. Um servidor TURN pode ser necessário para esta rede.");
        }
      }
    }

    channel
      .on("broadcast", { event: "signal" }, ({ payload }) => {
        void handleSignal(payload as SignalMessage);
      })
      .on("presence", { event: "sync" }, () => {
        const presence = channel.presenceState() as Record<
          string,
          Array<{ role?: Role }>
        >;
        const connectedViewers = Object.values(presence)
          .flat()
          .filter((member) => member.role === "viewer").length;
        setViewerCount(connectedViewers);

        if (role === "host") {
          const liveViewerIds = new Set(
            Object.entries(presence)
              .filter(([, members]) => members.some((member) => member.role === "viewer"))
              .map(([presenceKey]) => presenceKey),
          );
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
          await channel.track({ clientId, joinedAt: Date.now(), role });

          if (role === "host") {
            setStatus(localStreamRef.current ? "sharing" : "ready");
            setStatusDetail("Sala aberta. Convide seus amigos para entrar.");
          } else {
            setStatus("waiting");
            setStatusDetail("Aguardando o anfitrião iniciar a transmissão…");
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
      if (role === "viewer" && !viewerConnected) {
        void sendSignal("join", null, hostId ?? undefined);
      }
    }, 4_000);

    function announceDeparture() {
      void sendSignal(role === "host" ? "host-left" : "viewer-left", null, hostId ?? undefined);
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
      channelRef.current = null;
      sendSignalRef.current = null;
      connectViewersRef.current = null;
      closeHostPeersRef.current = null;
    };
  }, [role, roomId, tryRemotePlayback]);

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_800);
    } catch {
      setErrorMessage("Não foi possível copiar automaticamente. Copie o endereço do navegador.");
    }
  }

  async function toggleMute() {
    const video = remoteVideoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
    if (!video.muted) await tryRemotePlayback(true);
  }

  async function openFullscreen() {
    await stageRef.current?.requestFullscreen().catch(() => undefined);
  }

  function leaveRoom() {
    if (role === "host") {
      sessionStorage.removeItem(`watchwfriends:host:${roomId}`);
      void sendSignalRef.current?.("host-left");
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
    } else {
      void sendSignalRef.current?.("viewer-left");
    }
    router.push("/");
  }

  const isHost = role === "host";

  return (
    <main className="room-shell">
      <div className="room-grain" aria-hidden="true" />
      <header className="room-header">
        <Link className="wordmark" href="/" aria-label="Voltar ao início">
          <span className="wordmark-mark" aria-hidden="true"><span /></span>
          watchWfriends
        </Link>

        <button className="room-code" onClick={copyInvite} aria-label="Copiar link da sala">
          <span>SALA</span>
          <strong>{formatRoomId(roomId)}</strong>
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>

        <button className="leave-button" onClick={leaveRoom}>
          <span>Sair</span>
          <LogOut size={17} aria-hidden="true" />
        </button>
      </header>

      <div className="room-layout">
        <section className="broadcast-column">
          <div className="broadcast-meta">
            <div className={`broadcast-state state-${status}`} aria-live="polite">
              <i />
              {statusCopy[status]}
            </div>
            <div className="broadcast-role">
              {isHost ? "Você é o anfitrião" : "Você é espectador"}
            </div>
          </div>

          <div className={`video-stage ${isSharing || hasRemoteVideo ? "stage-active" : ""}`} ref={stageRef}>
            <div className="stage-grid" aria-hidden="true" />
            {isHost ? (
              <video
                ref={localVideoRef}
                className={`stream-video ${isSharing ? "visible" : ""}`}
                autoPlay
                muted
                playsInline
              />
            ) : (
              <video
                ref={remoteVideoRef}
                className={`stream-video ${hasRemoteVideo ? "visible" : ""}`}
                autoPlay
                playsInline
              />
            )}

            {!role ? (
              <StageMessage icon={<Radio />} title="Abrindo a sala…" detail="Só um instante." />
            ) : status === "config-error" ? (
              <StageMessage
                icon={<Settings2 />}
                title="Conecte o Supabase"
                detail="Copie .env.example para .env.local e preencha a URL e a chave publicável do projeto."
              />
            ) : isHost && !isSharing ? (
              <div className="stage-message host-ready-message">
                <span className="stage-icon"><MonitorUp size={27} /></span>
                <span className="stage-label">SALA PRONTA / {formatRoomId(roomId)}</span>
                <h1>O que vamos assistir?</h1>
                <p>Compartilhe uma aba para transmitir também o áudio do vídeo.</p>
                <button
                  className="button button-primary share-button"
                  onClick={startSharing}
                  disabled={isStarting || status === "connecting"}
                >
                  <MonitorUp size={19} />
                  {isStarting ? "Abrindo seletor…" : "Compartilhar tela e áudio"}
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
              <button className="playback-gate" onClick={() => tryRemotePlayback(true)}>
                <span><Volume2 size={24} /></span>
                Clique para ativar o áudio
              </button>
            ) : null}

            {(isSharing || hasRemoteVideo) && (
              <div className="live-corner">
                <span><i /> AO VIVO</span>
                <span>{hasSharedAudio ? <AudioLines size={14} /> : <VolumeX size={14} />} {hasSharedAudio ? "COM ÁUDIO" : "SEM ÁUDIO"}</span>
              </div>
            )}

            {(isSharing || hasRemoteVideo) && (
              <div className="stage-controls">
                {isHost ? (
                  <button onClick={() => void stopSharing()}>
                    <ScreenShareOff size={17} /> Parar transmissão
                  </button>
                ) : (
                  <button onClick={() => void toggleMute()} aria-label={isMuted ? "Ativar som" : "Silenciar"}>
                    {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    {isMuted ? "Ativar som" : "Silenciar"}
                  </button>
                )}
                <button className="icon-control" onClick={() => void openFullscreen()} aria-label="Tela cheia">
                  <Expand size={18} />
                </button>
              </div>
            )}
          </div>

          <div className="broadcast-caption">
            <p>{statusDetail}</p>
            <span>{hasSharedAudio ? "Faixa de áudio detectada" : "Dica: marque “Compartilhar áudio” no seletor do navegador"}</span>
          </div>
        </section>

        <aside className="room-sidebar">
          <div className="sidebar-heading">
            <span>PAINEL DA SESSÃO</span>
            <i className={signalingConnected ? "online" : ""} />
          </div>

          <div className="invite-panel">
            <span className="sidebar-icon"><Link2 size={19} /></span>
            <div>
              <span className="sidebar-label">Convite da sala</span>
              <strong>Chame seus amigos</strong>
              <p>Quem tiver este link poderá entrar como espectador.</p>
            </div>
            <button className="button button-primary invite-button" onClick={copyInvite}>
              {copied ? <Check size={17} /> : <Copy size={17} />}
              {copied ? "Link copiado" : "Copiar convite"}
            </button>
          </div>

          <div className="stats-list">
            <div>
              <span className="stat-icon"><UsersRound size={18} /></span>
              <span><small>Na sala</small><strong>{viewerCount} {viewerCount === 1 ? "espectador" : "espectadores"}</strong></span>
            </div>
            <div>
              <span className="stat-icon"><Wifi size={18} /></span>
              <span><small>Canal</small><strong>{signalingConnected ? "Conectado" : "Conectando"}</strong></span>
            </div>
            <div>
              <span className="stat-icon"><AudioLines size={18} /></span>
              <span><small>Áudio da tela</small><strong>{hasSharedAudio ? "Ativo" : "Aguardando"}</strong></span>
            </div>
          </div>

          <div className="quality-note">
            <CircleAlert size={17} />
            <p><strong>Melhor resultado</strong>Use Chrome ou Edge no computador e escolha “Aba” com a opção de compartilhar áudio.</p>
          </div>
        </aside>
      </div>

      {errorMessage ? (
        <div className="error-toast" role="alert">
          <CircleAlert size={18} />
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage("")} aria-label="Fechar aviso">×</button>
        </div>
      ) : null}
    </main>
  );
}

function StageMessage({
  animated = false,
  detail,
  icon,
  title,
}: {
  animated?: boolean;
  detail: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="stage-message viewer-wait-message">
      <span className={`stage-icon ${animated ? "stage-icon-pulse" : ""}`}>{icon}</span>
      <h1>{title}</h1>
      <p>{detail}</p>
      {animated ? <div className="waiting-line"><span /></div> : null}
    </div>
  );
}
