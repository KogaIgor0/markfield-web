import { useEffect, useState } from "react";

interface SplashProps {
  onDone: () => void;
}

/**
 * Tela de abertura animada do MarkField.
 * Dura ~2.8 s e chama onDone() ao terminar.
 */
export function SplashScreen({ onDone }: SplashProps) {
  const [fase, setFase] = useState<"in" | "hold" | "out">("in");

  useEffect(() => {
    // in → hold: 500 ms
    const t1 = setTimeout(() => setFase("hold"), 500);
    // hold → out: 1800 ms
    const t2 = setTimeout(() => setFase("out"), 1800);
    // out → done: 2800 ms
    const t3 = setTimeout(() => onDone(), 2800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <div className={`splash splash-${fase}`} aria-hidden>
      <div className="splash-inner">
        {/* Logotipo / ícone */}
        <div className="splash-icon">
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Rede elétrica estilizada */}
            <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="1.5" opacity="0.15"/>
            {/* Nó central */}
            <circle cx="24" cy="24" r="4" fill="currentColor" opacity="0.9"/>
            {/* Braços */}
            <line x1="24" y1="20" x2="24" y2="8"  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="24" y1="28" x2="24" y2="40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="20" y1="24" x2="8"  y2="24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="28" y1="24" x2="40" y2="24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            {/* Nós secundários */}
            <circle cx="24" cy="8"  r="2.5" fill="currentColor" opacity="0.7"/>
            <circle cx="24" cy="40" r="2.5" fill="currentColor" opacity="0.7"/>
            <circle cx="8"  cy="24" r="2.5" fill="currentColor" opacity="0.7"/>
            <circle cx="40" cy="24" r="2.5" fill="currentColor" opacity="0.7"/>
            {/* Linhas diagonais */}
            <line x1="21.2" y1="21.2" x2="12" y2="12" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
            <line x1="26.8" y1="21.2" x2="36" y2="12" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
            <line x1="21.2" y1="26.8" x2="12" y2="36" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
            <line x1="26.8" y1="26.8" x2="36" y2="36" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
            <circle cx="12" cy="12" r="2" fill="currentColor" opacity="0.45"/>
            <circle cx="36" cy="12" r="2" fill="currentColor" opacity="0.45"/>
            <circle cx="12" cy="36" r="2" fill="currentColor" opacity="0.45"/>
            <circle cx="36" cy="36" r="2" fill="currentColor" opacity="0.45"/>
          </svg>
        </div>

        {/* Nome */}
        <h1 className="splash-nome">
          <span className="splash-mark">Mark</span>
          <span className="splash-field">Field</span>
        </h1>

        {/* Tagline */}
        <p className="splash-tagline">Topografia de redes elétricas</p>

        {/* Barra de progresso */}
        <div className="splash-bar" aria-hidden>
          <div className={`splash-bar-fill splash-bar-${fase}`} />
        </div>
      </div>
    </div>
  );
}
