# watchWfriends

Aplicação Next.js para criar uma sala por link e transmitir tela com áudio para um pequeno grupo de amigos. A mídia usa WebRTC e segue diretamente do navegador do anfitrião para os espectadores; o Supabase Realtime é usado somente para sinalização e presença.

## O que já está incluído

- criação de salas com códigos aleatórios e difíceis de adivinhar;
- link limpo de convite — quem cria permanece como anfitrião apenas naquela aba/sessão;
- captura de aba, janela ou monitor com áudio quando o navegador oferece suporte;
- transmissão WebRTC P2P para vários espectadores;
- contador de participantes com Supabase Presence;
- reconexão automática e orientação quando um servidor TURN é necessário;
- ativação manual de áudio quando a política de autoplay do navegador bloquear o som;
- interface responsiva, tela cheia e estados completos de espera/erro/fim da sessão.

## Rodar localmente

Requer Node.js 20.9 ou superior.

```bash
npm install
Copy-Item .env.example .env.local
npm run dev
```

Abra `http://localhost:3000`.

## Configurar o Supabase

Não é necessário criar tabelas ou executar SQL.

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No projeto, abra **Connect** e copie a **Project URL** e a **Publishable key** (`sb_publishable_...`).
3. Em **Realtime > Settings**, mantenha o serviço habilitado e a opção de canais públicos permitida.
4. Preencha `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUA_CHAVE
```

As duas variáveis são públicas por projeto e foram criadas para uso no navegador. Nunca coloque uma `secret key` ou `service_role` em uma variável `NEXT_PUBLIC_*`.

## Deploy na Vercel

1. Envie este diretório para um repositório GitHub, GitLab ou Bitbucket.
2. Na Vercel, escolha **New Project** e importe o repositório.
3. Adicione `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` em **Environment Variables**.
4. Clique em **Deploy**. O preset de Next.js e o comando `npm run build` são detectados automaticamente.

Também é possível executar `npx vercel` na raiz do projeto.

## TURN — recomendado antes de divulgar

O STUN padrão funciona para muitas redes domésticas. Algumas redes corporativas, móveis ou com NAT restrito exigem TURN. Contrate um serviço TURN ou hospede `coturn` e configure:

```env
NEXT_PUBLIC_TURN_URLS=turn:turn.exemplo.com:3478,turns:turn.exemplo.com:5349
NEXT_PUBLIC_TURN_USERNAME=usuario
NEXT_PUBLIC_TURN_CREDENTIAL=credencial
```

Essas credenciais chegam ao navegador por necessidade do protocolo. Em produção com acesso mais amplo, prefira credenciais TURN temporárias emitidas por uma API protegida.

## Limitações do MVP

- O modo atual é P2P em estrela: o anfitrião envia uma cópia do vídeo a cada espectador. Foi pensado para aproximadamente 2–6 amigos, dependendo do upload do anfitrião.
- Compartilhar uma **aba do Chrome ou Edge no computador** e marcar **Compartilhar áudio** oferece o resultado mais previsível.
- O suporte a áudio do monitor inteiro varia por navegador e sistema operacional.
- Plataformas com DRM podem bloquear a captura ou exibir tela preta.
- As salas não exigem login. O código longo funciona como segredo do convite, mas a sinalização usa um canal público. Para um produto aberto ao público, migre para autenticação e canais privados com políticas do Supabase.
- WebRTC criptografa a mídia em trânsito, mas isso não substitui autorização dos participantes nem o respeito a direitos autorais e aos termos do conteúdo transmitido.

## Arquitetura

```text
Vercel / Next.js  ── entrega a interface
        │
        └── Supabase Realtime ── ofertas, respostas, ICE e presença

Anfitrião ═════════ WebRTC criptografado ═════════ Espectador
          ╚════════ WebRTC criptografado ═════════ Espectador
```

## Comandos

```bash
npm run dev
npm run lint
npm run build
npm run start
```
