import { useRef } from "react";
import { BDGD_CAMADAS, BDGD_FONTES, BDGD_FONTES_DISPONIVEIS } from "../map/bdgd";

interface Props {
  fonteId: string | null;
  ativas: Set<string>;
  carregando: boolean;
  erro?: string | null;
  onToggle: (id: string) => void;
  onCarregar: () => void;
  onChangeFonte: (id: string) => void;
  onFechar: () => void;
  /** Nome do arquivo KML/KMZ carregado (undefined = nenhum). */
  kmlRedeNome?: string;
  kmlRedeVisivel?: boolean;
  onAbrirKmlRede?: (file: File) => void;
  onToggleKmlRede?: () => void;
  onLimparKmlRede?: () => void;
  /** Inicia o modo de desenho do bbox da AreaBdgd do projeto. */
  onDefinirAreaBdgd?: () => void;
  /** True quando o projeto já tem um bbox de área definido. */
  temAreaDefinida?: boolean;
}

export function PainelCamadas({
  fonteId, ativas, carregando, erro, onToggle, onCarregar, onChangeFonte, onFechar,
  kmlRedeNome, kmlRedeVisivel, onAbrirKmlRede, onToggleKmlRede, onLimparKmlRede,
  onDefinirAreaBdgd, temAreaDefinida,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fonte = BDGD_FONTES.find((f) => f.id === fonteId) ?? BDGD_FONTES[0];
  const temUrls = !!fonte.urls;

  return (
    <div className="painel-camadas">
      <div className="pc-header">
        <div className="pc-badge-row">
          <span className="pc-uf">{fonte.uf ?? "SP"}</span>
          <span className="pc-nome">{fonte.nome}</span>
        </div>
        <button className="pc-fechar" onClick={onFechar} title="Fechar">✕</button>
      </div>

      {/* Seletor de distribuidora */}
      <div className="pc-seletor">
        <select
          value={fonte.id}
          onChange={(e) => onChangeFonte(e.target.value)}
          className="pc-select"
        >
          <optgroup label="Disponíveis">
            {BDGD_FONTES_DISPONIVEIS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome} ({f.uf})
              </option>
            ))}
          </optgroup>
          <optgroup label="Em breve">
            {BDGD_FONTES.filter((f) => !f.urls).map((f) => (
              <option key={f.id} value={f.id} disabled>
                {f.nome} ({f.uf})
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      <div className="pc-camadas">
        {BDGD_CAMADAS.map((cam) => (
          <label key={cam.id} className="pc-toggle">
            <span className="pc-bolinha" style={{ background: cam.cor }} />
            <span className="pc-label">{cam.label}</span>
            <input
              type="checkbox"
              checked={ativas.has(cam.id)}
              onChange={() => onToggle(cam.id)}
            />
          </label>
        ))}
      </div>

      {!temUrls && (
        <div className="pc-em-breve">⏳ Em breve para esta distribuidora</div>
      )}

      {erro && (
        <div className="pc-erro">{erro}</div>
      )}

      <button
        className="pc-carregar-btn pc-definir-area-btn"
        onClick={onDefinirAreaBdgd}
        disabled={!temUrls}
        title="Arraste um retângulo no mapa para definir a área do projeto e capturar a rede existente"
      >
        {temAreaDefinida ? "🗺️ Redefinir área do projeto" : "🗺️ Definir área do projeto"}
      </button>

      <button
        className="pc-carregar-btn"
        onClick={onCarregar}
        disabled={!temUrls || carregando}
      >
        {carregando ? "Carregando…" : "Carregar rede nesta área"}
      </button>

      {/* ── Rede própria (KML / KMZ) ── */}
      <div className="pc-divisor" />
      <div className="pc-kml-titulo">Rede própria (KML / KMZ)</div>

      {kmlRedeNome ? (
        <div className="pc-kml-carregado">
          <label className="pc-toggle">
            <span className="pc-bolinha" style={{ background: "#3b82f6" }} />
            <span className="pc-label pc-kml-nome" title={kmlRedeNome}>{kmlRedeNome}</span>
            <input
              type="checkbox"
              checked={kmlRedeVisivel ?? true}
              onChange={onToggleKmlRede}
            />
          </label>
          <button className="pc-kml-limpar" onClick={onLimparKmlRede} title="Remover">✕</button>
        </div>
      ) : (
        <button
          className="pc-carregar-btn pc-kml-btn"
          onClick={() => fileInputRef.current?.click()}
        >
          📂 Abrir KML / KMZ
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".kml,.kmz"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onAbrirKmlRede?.(f);
          e.target.value = "";
        }}
      />

    </div>
  );
}
