import Link from "next/link";
import { ArrowLeft, CircleSlash2 } from "lucide-react";

export default function NotFound() {
  return (
    <main className="not-found-page">
      <span className="stage-icon"><CircleSlash2 size={26} /></span>
      <span className="stage-label">ERRO / 404</span>
      <h1>Essa sala não existe.</h1>
      <p>O código pode estar incompleto ou o link foi digitado incorretamente.</p>
      <Link className="button button-primary" href="/">
        <ArrowLeft size={17} /> Voltar ao início
      </Link>
    </main>
  );
}
