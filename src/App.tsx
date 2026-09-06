import { MapCanvas } from "./map/MapCanvas";

/**
 * Shell mínimo do Markfield Web.
 *
 * Fase 0: apenas o mapa base ocupando a tela, com uma barra de topo. As
 * ferramentas de edição (M2), o painel de projeto e o copiloto (M5) entram
 * nas fases seguintes, cada um como uma região desta shell.
 */
export function App() {
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          <span className="spark">◆</span> Markfield Web
        </span>
        <span className="phase-tag">Fase 0 · fundação</span>
      </header>
      <main className="workspace">
        <MapCanvas />
      </main>
    </div>
  );
}
