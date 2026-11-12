# Kreato — sistema de interface "Estúdio"

Fonte da verdade dos valores: `frontend/src/index.css` (`:root`). Este arquivo registra as decisões e os padrões; ao criar ou mudar UI, siga-os em vez de reinventar.

## Direção

O Kreato é a mesa de produção de um criador de conteúdo: papel de estúdio, nanquim de claquete e uma única luz vermelha de REC.

- **Superfícies de papel, texto em tinta.** Tema claro e quente; nada de gradientes decorativos, glow ou blur.
- **REC (`--rec`) só marca o "agora"**: etapa atual, hoje, gravando, o próximo quadro da meta. Nunca para erro, atraso ou limite.
- **Cores semânticas com papel fixo**:
  - `--approved`: publicado, roteiro aprovado, meta cumprida.
  - `--caution`: perto do limite, alterações não salvas, comentários abertos.
  - `--danger`: atraso, erro, excluir.
  - `--brass`: plano pago e dono.
- **Plataformas (TikTok, Instagram, YouTube) são neutras**, sem cores de marca.

## Profundidade e espaçamento

- **Profundidade só com bordas e degraus de tom**: `--sheet` sobre `--paper`, e `--wash`/`--well` para áreas rebaixadas.
- **Sombra só em sobreposições**: menus, modais e tooltips usam `--shadow-overlay`.
- **Ativo/selecionado**: `--sheet` + `box-shadow: 0 0 0 1px var(--line)`.
- **Grade de 4px.** Padding de card: 20px. Gap entre cards: 12–16px. Linhas de lista: 10–12px vertical, separadas por `--line-soft`.
- **Raios**: xs 3 (tags, etiquetas), sm 6 (botões, campos, cards pequenos), md 8 (cards), lg 12 (modais).
- **Movimento**:
  - Transições listam propriedades nomeadas com `var(--dur-ui) var(--ease-out)` (160ms; 240ms para progresso).
  - Clique usa `scale(.94–.98)`.
  - Respeitar `prefers-reduced-motion`.

## Tipografia

- **Archivo** (largura variável) para UI e display.
  - Display/títulos: `font-stretch: var(--stretch-display)` (88%), 700, tracking -0.015 a -0.03em.
  - Rótulos em caixa alta: `--stretch-label` (75%), 11px/700, tracking 0.08em, `--ink-3`.
- **IBM Plex Mono** = código de tempo: datas, horas, contadores, IDs de cena, números de etapa, valores de tabela. Use a classe `.timecode` ou `font-family: var(--font-mono)` com `tabular-nums`.
- **Escala**:

  | Uso | Tamanho |
  |---|---|
  | Título de página | `h1` padrão |
  | Título de card | 17px/700 |
  | KPI | 28–32px |
  | Números heróis | 40–48px |
  | Corpo | 14px |
  | Meta | 12–13px |
  | Mono | 10.5–12px |

- **Datas em formato de claquete** (`utils/dates.ts`):
  - `slateDate` → `QUA 12 NOV`
  - `slateDay` → `QUI 14`
  - `slateTime` → `18:30`
- **Texto sempre em tokens de tinta**, nunca na cor da série/etapa. A cor fica em um marcador ao lado.

## Elementos-assinatura

1. **Claquete** (`ContentCard`):
   - Faixa de tinta de 24px com `CENA 042` em mono (`sceneNumber(id)`). Em Gravação, `rec-dot` + `REC`.
   - Corpo em papel: título 15px/600, linha plataforma · formato, data em mono à direita (atrasado em `--danger`).
2. **Fita de produção** (`ProductionStrip` / `ProductionStepper`):
   - 6 segmentos com gap de 2–4px. Feito = `--ink`, atual = `--rec` (ou `--approved` se publicado), futuro = `--well-deep`.
   - Card: 4px de altura + contador `3/6`.
   - Editor: 6px de altura, botões com número `01`–`06` + rótulo. Rola na horizontal e centraliza a etapa atual.
3. **Rolo da meta semanal** (dashboard):
   - Película em tinta com perfurações em cima e embaixo; um quadro por publicação da meta.
   - Feito = `--on-ink`, próximo = contorno `--rec`, meta cumprida = verde; o excedente aparece como `+N`.
4. **Linha de claquete no cabeçalho da página** (`PageHeader`): workspace + data em mono, 11px, acima do `h1`.
5. **"Próximas no ar"** na sidebar: até 3 agendados, hoje com `rec-dot` + `HOJE`.
6. **Painel-claquete das telas de entrada** (`AuthLayout`):
   - Coluna em tinta com listras diagonais no topo e campos Produção/Cena/Data.
   - Fita de etapas na base. No mobile, vira uma faixa curta só com a logo.

Números de etapa e de ficha (`01`, `IDEIA 012`) e kickers de modal (`NOVA CENA`) também usam mono.

## Padrões de componente

| Componente | Especificação |
|---|---|
| Botão primário | fundo `--ink`, texto `--on-ink`, raio sm; hover `--ink-hover` |
| Campo de formulário (`.form-group`) | 10px 12px · fundo `--paper` · borda `--line` · raio sm · texto `--ink` · placeholder `--ink-4` · foco `--focus-ring` |
| Campo de auth | 44px de altura · ícone à esquerda em 12px · botão de enviar com 46px |
| Card de página (`.home-card`, `.chart-card`, `.team-card`) | `--sheet` · borda `--line` · raio md · padding 20px · gap 16px |
| Faixa de KPIs (`.stat-grid`, `.home-stats`, `.usage-meters`) | uma superfície dividida por fios de 1px (gap 1px sobre `--line-soft`), sem caixas soltas |
| Segmentado (período, abas de auth) | trilho `--well` com padding 3px; opção ativa `--sheet` + anel `--line`; opções em mono quando são valores |
| Abas de lista (`.ideas-tab`) | rótulo em caixa alta condensada; ativa com sublinhado de 2px em `--ink` |
| Coluna do kanban | fundo `--wash`, borda `--line-soft`, número da etapa em mono (`--rec-ink` em Gravação), título em caixa alta condensada, contagem em mono |
| Ficha de ideia | `IDEIA 012` mono · plataforma · badge de status à direita; gancho em citação com fio de 2px em `--ink` |
| Etiqueta/badge (papel, plano, `VOCÊ`) | raio xs, 10–11px, caixa alta condensada, anel interno 1px; dono e plano pago em latão |
| Modal | `--sheet`, raio lg, `--shadow-overlay`, padding 28px; kicker em mono 11px acima do título 24px; fechar transparente 36px |
| Tooltip de gráfico | `--sheet` + `--shadow-overlay`; valores em mono |
| Gráficos (`chartTheme.ts`) | série `#1b1a17`, hover `--rec`, eixos em mono `--ink-3`, grade `rgba(27,26,23,.07)`; eixo Y com no mínimo 64px de largura (fonte mono) |
