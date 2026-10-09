import { BDGD_CAMADAS, BDGD_FONTES, BDGD_FONTES_DISPONIVEIS } from "../map/bdgd";

interface Props {
  fonteId: string | null;
  ativas: Set<string>;
  carregando: boolean;
  onToggle: (id: string) => void;
  onCarregar: () => void;
  onChangeFonte: (id: string) => void;
  onFechar: () => void;
}

export function PainelCamadas({ fonteId, ativas, carregando, onToggle, onCarregar, onChangeFonte, onFechar }: Props) {
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

      <button
        className="pc-carregar-btn"
        onClick={onCarregar}
        disabled={!temUrls || carregando}
      >
        {carregando ? "Carregando…" : "Carregar rede nesta área"}
      </button>
    </div>
  );
}
