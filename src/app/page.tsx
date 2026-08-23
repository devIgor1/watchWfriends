"use client";

import {
  ArrowRight,
  AudioLines,
  Link2,
  MonitorUp,
  Radio,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  createRoomId,
  isValidRoomId,
  normalizeRoomId,
} from "@/lib/room";

export default function Home() {
  const router = useRouter();
  const [roomInput, setRoomInput] = useState("");
  const [roomError, setRoomError] = useState("");

  function createSession() {
    const roomId = createRoomId();
    sessionStorage.setItem(`watchwfriends:host:${roomId}`, "true");
    router.push(`/room/${roomId}`);
  }

  function joinSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const roomId = normalizeRoomId(roomInput);

    if (!isValidRoomId(roomId)) {
      setRoomError("Cole um link de convite ou digite um código válido.");
      return;
    }

    setRoomError("");
    router.push(`/room/${roomId}`);
  }

  return (
    <main className="home-shell">
      <div className="home-grain" aria-hidden="true" />
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="watchWfriends, início">
          <span className="wordmark-mark" aria-hidden="true">
            <span />
          </span>
          watchWfriends
        </a>
        <nav aria-label="Navegação principal">
          <a href="#como-funciona">Como funciona</a>
          <span className="nav-signal">
            <i /> WebRTC direto
          </span>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow">
            <Radio size={14} aria-hidden="true" />
            Sua sala está a um clique
          </div>
          <h1>
            Sua tela.
            <span>A sessão de todos.</span>
          </h1>
          <p className="hero-lead">
            Compartilhe uma aba, uma janela ou o monitor inteiro com áudio.
            Seus amigos entram pelo link — sem instalar nada.
          </p>

          <div className="hero-actions">
            <button className="button button-primary button-large" onClick={createSession}>
              <MonitorUp size={19} aria-hidden="true" />
              Criar uma sessão
              <ArrowRight className="button-arrow" size={18} aria-hidden="true" />
            </button>
            <span className="action-note">Grátis para começar · sem cadastro</span>
          </div>

          <form className="join-form" onSubmit={joinSession} noValidate>
            <label htmlFor="room-code">Já recebeu um convite?</label>
            <div className="join-row">
              <div className="join-input-wrap">
                <Link2 size={17} aria-hidden="true" />
                <input
                  id="room-code"
                  value={roomInput}
                  onChange={(event) => {
                    setRoomInput(event.target.value);
                    setRoomError("");
                  }}
                  placeholder="Cole o link ou código da sala"
                  autoComplete="off"
                  aria-describedby={roomError ? "room-error" : undefined}
                  aria-invalid={Boolean(roomError)}
                />
              </div>
              <button className="button button-secondary" type="submit">
                Entrar
              </button>
            </div>
            {roomError ? (
              <p className="form-error" id="room-error" role="alert">
                {roomError}
              </p>
            ) : null}
          </form>
        </div>

        <div className="hero-visual" aria-label="Prévia de uma sessão no watchWfriends">
          <div className="projector-beam" aria-hidden="true" />
          <div className="session-window">
            <div className="window-topbar">
              <div className="window-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <span className="window-room">SALA / K8P4-M2FX</span>
              <span className="live-pill"><i /> AO VIVO</span>
            </div>
            <div className="mock-screen">
              <div className="mock-orbit orbit-one" />
              <div className="mock-orbit orbit-two" />
              <div className="mock-title">
                <span>NOITE DE CINEMA</span>
                <strong>PRONTOS?</strong>
              </div>
              <button className="mock-play" tabIndex={-1} aria-hidden="true">
                <span />
              </button>
              <div className="mock-progress"><span /></div>
            </div>
          </div>

          <div className="viewer-stack">
            <div className="viewer-avatars" aria-hidden="true">
              <span>ML</span>
              <span>GV</span>
              <span>CA</span>
            </div>
            <div>
              <strong>3 amigos assistindo</strong>
              <span>Conexão protegida</span>
            </div>
          </div>

          <div className="audio-card">
            <span className="audio-icon"><AudioLines size={19} /></span>
            <div>
              <strong>Áudio incluído</strong>
              <span>Direto da aba compartilhada</span>
            </div>
            <div className="audio-bars" aria-hidden="true">
              <i /><i /><i /><i /><i />
            </div>
          </div>
        </div>
      </section>

      <section className="how-section" id="como-funciona">
        <div className="section-kicker">01 — 03</div>
        <div className="how-heading">
          <h2>Do link ao play<br />em três movimentos.</h2>
          <p>
            Feito para encontros pequenos, rápidos e privados. A transmissão
            acontece entre os navegadores dos participantes.
          </p>
        </div>
        <div className="steps-row">
          <article>
            <span className="step-number">01</span>
            <MonitorUp size={25} aria-hidden="true" />
            <h3>Crie a sala</h3>
            <p>Um código exclusivo nasce na hora. Nenhuma conta é necessária.</p>
          </article>
          <article>
            <span className="step-number">02</span>
            <Link2 size={25} aria-hidden="true" />
            <h3>Envie o link</h3>
            <p>Seus amigos abrem o convite em um navegador moderno.</p>
          </article>
          <article>
            <span className="step-number">03</span>
            <UsersRound size={25} aria-hidden="true" />
            <h3>Comece a sessão</h3>
            <p>Escolha a aba com áudio e todos assistem em tempo real.</p>
          </article>
        </div>
        <div className="privacy-strip">
          <ShieldCheck size={20} aria-hidden="true" />
          <span><strong>Privacidade por padrão.</strong> O watchWfriends só vê os sinais de conexão; a mídia segue criptografada entre os participantes.</span>
        </div>
      </section>

      <footer className="site-footer">
        <span>WATCHWFRIENDS / ASSISTA PERTO, MESMO DE LONGE.</span>
        <span>Feito com WebRTC</span>
      </footer>
    </main>
  );
}
