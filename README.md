# Markfield Web

Ferramenta de escritório do ecossistema **Markfield**: importa o trabalho de
campo do app Android, o projetista refina no mapa e conversa com um copiloto IA
que conduz o projeto e gera os entregáveis de aprovação (DXF, prancha PDF,
memorial, lista de materiais, orçamento) no padrão da concessionária.

Este repositório é o **Markfield Web** (o lado de escritório). O app de campo é
um projeto separado. A ponte entre os dois é o formato `.mkf`.

## Stack

- **React + TypeScript** (Vite)
- **MapLibre GL** para o editor de mapa sobre satélite
- Testes com **Vitest**

Decisões de arquitetura no DRS (documento de requisitos) e no documento-mestre
de estado, no projeto MarkField.

## Rodando localmente

```bash
npm install
npm run dev        # abre em http://localhost:5173
```

Outros comandos:

```bash
npm run build      # build de produção (dist/)
npm run preview    # serve o build
npm run typecheck  # checagem de tipos
npm run test       # testes
npm run lint       # lint
```

## Estrutura

```
src/
  domain/          # o coração: modelo do projeto e contrato .mkf
    model.ts       # Ponto, Trecho, LinhaLivre, Foto, Referencia, Projeto (COM IDs)
    mkf.ts         # esquema .mkf (manifest + projeto.json) + leitura/escrita
    ids.ts         # geração de IDs estáveis
  io/              # parsers (KML, DXF, ZIP…) e escrita de entregáveis — a construir
  map/             # editor de mapa
    MapCanvas.tsx  # mapa base MapLibre (satélite, pan/zoom)
  App.tsx          # shell da aplicação
  main.tsx         # ponto de entrada
```

## Arquitetura (3 camadas)

1. **Motor determinístico** — cálculos (queda de tensão, esforços,
   dimensionamento). Nunca IA. Números reproduzíveis.
2. **Domain Packs** — dados por concessionária (blocos DXF, carimbo, simbologia,
   regras, materiais, preços). Piloto: Neoenergia.
3. **Copiloto IA** — orquestrador que conversa com o projetista, invoca o motor
   e os renderizadores, e gera os entregáveis.

**Renderizadores** = código programático (não IA) que gera os arquivos finais.
A IA decide o *conteúdo*; o código *renderiza*.

## Contratos que não se quebra sem alinhar com o app

- **`.mkf`**: ZIP com `manifest.json` + `projeto.json` (modelo com IDs) +
  `fotos/`. Ver `src/domain/mkf.ts`.
- **Coordenadas**: UTM SIRGAS 2000 / WGS84, com fidelidade na ida-e-volta.
- **`postePropostoo`** (dois "o") é grafia intencional do app — não "corrigir".

## Roadmap (fases)

- **Fase 0** — fundação: repositório, modelo + `.mkf`, mapa base. ✅
- **Fase 1** — importar e reconstruir o projeto sobre satélite (ZIP/KML). ← *estado atual*
- **Fase 2** — editor com mouse (arraste, snap, coordenada exata).
- **Fase 3** — domain pack + DXF no padrão da distribuidora.
- **Fase 4** — motor determinístico (materiais, orçamento, validador, cálculos).
- **Fase 5** — copiloto IA (chat, entregáveis, memorial, prancha PDF).
- **Fase 6** — colaboração, histórico e versões.
