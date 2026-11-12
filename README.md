# Kreato - Central de Gestão & Produção de Conteúdo

> **Tudo o que você precisa para planejar, organizar e acompanhar seus conteúdos em um só lugar.** O Kreato centraliza o fluxo de produção para ajudar criadores a economizar tempo, manter a consistência e melhorar seus resultados.

Aplicação web fullstack e orientada a microserviços desenvolvida para criadores de conteúdo e equipes de criação. O sistema conta com autenticação distribuída com JWT e Refresh Tokens, armazenamento de fotos de perfil via **MinIO (Object Storage S3)**, mensageria e auditoria em tempo real com **Redis Streams**, banco de dados relacional MySQL, além de orquestração de contêineres e deploy gerenciado via **Portainer**.

O projeto é utilizado na disciplina de Introdução à Computação em Nuvem, com orquestração de contêineres e deploy gerenciado via **Portainer**.

> 📖 **Documentação Técnica & Reversa**: Para a especificação completa do sistema (visão do usuário/código herdado), diagrama de arquitetura detalhado de todos os serviços (Mermaid) e mapeamento exaustivo das regras de negócio (*"Se X, então Y"*), consulte o arquivo [`documentacao.md`](documentacao.md).

---

## 🎯 Lean Canvas

| Bloco | Descrição |
| :--- | :--- |
| **1. Problema** | 1. Ideias, roteiros e calendários ficam espalhados em diferentes ferramentas.<br>2. Dificuldade para manter uma frequência consistente de publicações.<br>3. Falta de organização e acompanhamento do processo de produção e dos resultados dos conteúdos.<br><br>**Alternativas atuais:** Notion, Trello, planilhas e anotações. |
| **2. Segmentos de clientes** | Criadores de conteúdo em geral, desde iniciantes até profissionais que publicam em plataformas como TikTok, Instagram, YouTube e outras redes sociais. Inclui influenciadores, produtores de conteúdo digital e pequenas equipes de criação. |
| **3. Proposta única de valor** | Tudo o que você precisa para planejar, organizar e acompanhar seus conteúdos em um só lugar. O Kreato centraliza o fluxo de produção para ajudar criadores a economizar tempo, manter a consistência e melhorar seus resultados. |
| **4. Solução** | 1. Central de ideias e roteiros: registre temas, ganchos, legendas e organize suas ideias.<br>2. Gestão da produção: acompanhe cada conteúdo em um pipeline e planeje publicações com um calendário editorial.<br>3. Acompanhamento de resultados: registre métricas e compare o desempenho dos conteúdos para orientar futuras produções. |
| **5. Canais** | TikTok, Instagram e YouTube para divulgar o produto; parcerias com criadores de conteúdo; comunidades de criadores nas redes sociais; vídeos demonstrativos da plataforma; indicações entre usuários. |
| **6. Fontes de receita** | Modelo freemium com assinatura mensal.<br>• **Gratuito:** funcionalidades básicas com limites de uso.<br>• **Kreato Creator:** R$ 29–39/mês, com mais projetos e recursos de organização.<br>• **Kreato Studio:** R$ 79–129/mês, com colaboração, permissões e ferramentas para equipes.<br><br>*Valores iniciais a validar com potenciais clientes.* |
| **7. Estrutura de custos** | Hospedagem do frontend e backend; banco de dados; domínio e serviços de e-mail; taxas do processador de pagamentos; custos de APIs de IA, caso sejam utilizadas; divulgação, suporte, desenvolvimento e manutenção. |
| **8. Métricas-chave** | Número de usuários cadastrados; usuários ativos semanais; quantidade de conteúdos planejados e publicados; percentual de usuários que concluem o fluxo de produção; conversão de usuários gratuitos para pagos; receita recorrente mensal (MRR); retenção e cancelamento de assinaturas. |
| **9. Vantagem injusta** | Conhecimento sobre os desafios da produção de conteúdo e foco em centralizar o fluxo de trabalho do criador. Com o tempo, a vantagem poderá ser construída por meio de modelos personalizáveis, histórico de desempenho, recomendações adaptadas à rotina dos usuários e uma comunidade de criadores. |

---

## 🔄 Reaproveitamento: O que cada peça atual vira no SaaS

> *Nada da arquitetura vai para o lixo: cada serviço construído ganha um novo papel no modelo de negócio do **Kreato**.*

| Peça do Projeto Atual | O que vira no SaaS | Aplicação no Kreato |
| :--- | :--- | :--- |
| **Microsserviço de login + RBAC** | Papéis do negócio | **Perfis e Permissões**: `ADMIN` (administrador da plataforma), `CREATOR` (criador individual com plano Creator) e `MEMBER`/`STUDIO` (equipe com permissões para roteirista, editor e gestor). |
| **Logs e auditoria (Redis)** | Eventos de negócio | **Rastreamento do Ciclo de Produção**: auditoria em tempo real via Redis Streams para eventos do fluxo (`"ideia criada"`, `"roteiro aprovado"`, `"conteúdo movido no pipeline"`, `"publicação agendada"`, `"métrica atualizada"`). |
| **Upload e perfil (MinIO)** | Arquivos do domínio | **Armazenamento de Mídias e Assets**: foto de perfil do criador/equipe, upload de mídias de apoio aos conteúdos (thumbnails, capas de carrossel, roteiros em anexo, imagens de referência e arquivos brutos). |
| **Plano Premium (Stripe)** | Assinatura | **Monetização Freemium**: plano **Gratuito** (funcionalidades básicas com limites), **Kreato Creator** (R$ 29–39/mês: mais projetos e recursos ilimitados) e **Kreato Studio** (R$ 79–129/mês: colaboração multiusuário e permissões de equipe). |
| **Swagger, CI/CD, observabilidade** | Continuam valendo, pra quem fez as extras | **Infraestrutura e Governança**: documentação OpenAPI/Swagger das APIs de autenticação, conteúdos e métricas; esteira de CI/CD para build/deploy e monitoramento de serviços. |

---

## 🚀 Funcionalidades

- **Banco de Ideias**: captura rápida com gancho, legenda, plataforma, tags e status, com filtros e busca; a ideia vira conteúdo no pipeline com um clique.
- **Pipeline de Produção (Kanban)**: Ideia → Roteiro → Gravação → Edição → Agendado → Publicado, com arrastar e soltar e um editor dedicado para roteiro, legenda e hashtags.
- **Revisão de Roteiro**: comentários por conteúdo, aprovação do roteiro e pedidos de ajuste feitos por gestores.
- **Calendário Editorial**: grade mensal das publicações, com reagendamento arrastando o card.
- **Anexos com MinIO (S3)**: arquivos brutos (vídeos, áudios, imagens, PDFs) ligados a cada conteúdo, no bucket `assets`.
- **Métricas e Análise**: registro de visualizações, curtidas, comentários, compartilhamentos e salvamentos, taxa de engajamento e comparativos por plataforma e formato.
- **Dashboard**: meta semanal de publicações, sequência de semanas cumpridas, agenda e destaques.
- **Equipes e Workspaces**: convites por e-mail, papéis (Dono, Gestor, Roteirista, Editor) e troca entre workspaces.
- **Planos e Assinatura (Stripe)**: Free, Creator e Studio com cobrança mensal recorrente, Checkout, portal do cliente, webhooks e limites por plano aplicados na API (detalhes em [Assinatura com Stripe](#-assinatura-com-stripe)).
- **Painel Administrativo**: usuários por plano, assinaturas ativas, MRR de teste e os últimos eventos do `log-service` (inclusive os webhooks do Stripe).
- **Autenticação & Sessão**: cadastro, login com JWT e Refresh Tokens no MySQL, logout e recuperação de senha por e-mail.
- **Auditoria com Redis Streams**: eventos de uso e segurança enviados com `XADD` e consumidos pelo `log-service`.
- **Documentação OpenAPI/Swagger**: Swagger UI para o backend (`/api/docs`), o `auth-service` e o `log-service`.

---

## 🔒 Permissões

### Role da conta
- **`creator`** (padrão de todo cadastro): usa o Kreato nos workspaces dos quais participa.
- **`admin`**: além disso, acessa o painel administrativo, as métricas da plataforma e os logs de auditoria. É atribuída diretamente no banco.

### Papel no workspace
| Papel | O que pode fazer |
|---|---|
| **Dono** | Tudo, inclusive plano e assinatura; gerencia gestores |
| **Gestor** | Gerencia conteúdos em todas as etapas, aprova roteiros, agenda e publica, convida roteiristas e editores |
| **Roteirista** | Cria e escreve conteúdos nas etapas Ideia e Roteiro |
| **Editor** | Move conteúdos entre Gravação e Edição |

Todos os membros comentam, enviam anexos e registram métricas. Os limites de uso seguem o plano do dono do workspace.

---

## 🛠️ Tecnologias Utilizadas

### Frontend
- **React 19**
- **TypeScript**
- **Vite 6/8**
- **Lucide React** (Ícones)

### Backend & Microserviços
- **Node.js 22 (Alpine)**
- **Express 5**
- **TypeScript**
- **Prisma ORM 7**
- **MinIO JavaScript SDK** (Object Storage S3)
- **Multer** (Gerenciamento de uploads multipart/form-data)
- **JWT (JSON Web Token)** & **Bcryptjs**
- **ioredis** (Redis Streams Client)
- **Swagger UI Express** (Documentação OpenAPI)

### Banco de Dados & Infraestrutura
- **MySQL / MariaDB** (Banco Relacional)
- **MinIO Object Storage** (Armazenamento S3 de Avatares)
- **Redis 7** (Mensageria e Log Streams)
- **Nginx** (Proxy Reverso & Roteamento Unificado)
- **Docker & Docker Compose** (Orquestração de Contêineres)
- **Portainer** (Deploy e Gestão em Nuvem)

---

## 📐 Arquitetura do Sistema

```text
                               ┌─────────────────────────┐
                               │   Navegador / Cliente   │
                               └────────────┬────────────┘
                                            │ :8209
                               ┌────────────▼────────────┐
                               │     Nginx (Proxy)       │
                               └───┬────────┬────────┬───┘
                                   │        │        │
           ┌───────────────────────┘        │        └───────────────────────┐
           │ /                              │ /api/                          │ /api/auth
┌──────────▼──────────┐          ┌──────────▼──────────┐          ┌──────────▼──────────┐
│   frontend (Vite)   │          │   backend (Node)    │          │ auth-service (Node) │
└─────────────────────┘          └─────┬───────────┬───┘          └──────────┬──────────┘
                                       │           │                         │
                               ┌───────▼──────┐  ┌─▼─────────────┐           │
                               │ MinIO (S3)   │  │ MySQL Database│───────────┘
                               └──────────────┘  └───────────────┘
                                                          │ (Log Events)
                                                ┌─────────▼─────────┐
                                                │ Redis Streams     │
                                                └─────────┬─────────┘
                                                          │
                                                ┌─────────▼─────────┐
                                                │ log-service (Node)│
                                                └───────────────────┘
```

---

## ☁️ Classificação dos Serviços em Nuvem (IaaS, PaaS e SaaS)

A tabela abaixo classifica cada componente e serviço utilizado na plataforma **Kreato** de acordo com os modelos de serviço de Computação em Nuvem:

| Peça / Componente do Sistema | Camada de Serviço | Justificativa |
| :--- | :---: | :--- |
| **Máquina Virtual (VM / Cloud Compute)** | **IaaS** *(Infrastructure as a Service)* | Fornece a infraestrutura bruta de hardware virtualizado (CPU, memória, armazenamento e rede) e o sistema operacional base onde a solução e o Docker são executados. |
| **Contêineres de Aplicação (Docker / Docker Compose)** | **PaaS** *(CaaS - Containers as a Service)* | Oferece a plataforma e o runtime padronizado de execução para os microserviços e proxies (`backend`, `auth-service`, `log-service`, `frontend`, `nginx`, `redis`, `minio`), abstraindo a administração direta do SO da máquina. |
| **Portainer** | **PaaS** *(Platform as a Service)* | Atua como plataforma gerenciada de orquestração visual e controle de ciclo de vida dos contêineres na nuvem, dispensando a operação manual via terminal na VM. |
| **Banco de Dados Relacional (MySQL / DBaaS)** | **PaaS** *(Database as a Service)* | Entrega o serviço gerenciado de banco de dados relacional na nuvem, liberando os desenvolvedores da configuração e manutenção da infraestrutura física e do sistema operacional do banco. |
| **Stripe (Gateway de Pagamentos)** | **SaaS** *(Software as a Service)* | Entrega uma aplicação pronta em nuvem para checkout e cobrança de assinaturas, assumindo toda a conformidade de segurança (PCI-DSS) e processamento financeiro via APIs e Webhooks. |
| **Provedores de E-mail (Brevo / Mailtrap)** | **SaaS** *(Software as a Service)* | Disponibiliza um software completo em nuvem para disparo e monitoramento de e-mails transacionais (ex.: recuperação de senha), consumido diretamente por API sem necessidade de manter servidores SMTP próprios. |

---

## 📁 Estrutura do Projeto

```text
kreato/
├── auth-service/              # Microserviço de Autenticação & Tokens
│   ├── prisma/
│   │   └── schema.prisma      # Modelagem Usuario, RefreshToken, ResetToken
│   ├── src/
│   │   ├── controller/        # AuthController & ResetController
│   │   ├── swagger.ts         # Especificação OpenAPI / Swagger
│   │   └── server.ts
│   └── Dockerfile
├── backend/                   # Microserviço Principal (Perfil, MinIO)
│   ├── prisma/
│   │   └── schema.prisma      # Modelagem Usuario
│   ├── src/
│   │   ├── controller/        # UserController
│   │   ├── middlewares/       # AuthMiddleware & AdminMiddleware
│   │   ├── utils/             # minio.ts (S3 Upload/Stream) & prisma.ts
│   │   └── server.ts
│   └── Dockerfile
├── frontend/                  # Aplicação React
│   ├── src/
│   │   ├── api/               # backend.ts (Profile, Avatar, Auth)
│   │   ├── components/        # ProfilePage, Navbar, AuthPage, Modais
│   │   ├── context/           # AuthContext (Gestão de estado da sessão)
│   │   └── index.css          # Estilos globais e componentes da UI
│   └── Dockerfile
├── log-service/               # Microserviço de Logs & Auditoria em Tempo Real
│   ├── src/
│   │   └── server.ts          # Leitor de Redis Streams (XREAD)
│   └── Dockerfile
├── nginx/
│   ├── nginx.conf             # Proxy reverso unificado (/api, /api/auth, /api/logs, /)
│   └── Dockerfile
├── docker-compose.yml         # Orquestração de todos os contêineres
├── .env                       # Variáveis de ambiente
└── README.md
```

---

## 💳 Assinatura com Stripe

O Kreato cobra por assinatura mensal, sempre no **modo de teste** do Stripe. Quem sabe o estado verdadeiro da assinatura é o Stripe; o banco guarda uma cópia (`plano`, `statusAssinatura`, `valorMensalCentavos`, `stripeCustomerId`, `stripeSubscriptionId`) mantida **só pelos webhooks**. O retorno do navegador depois do checkout não muda o plano: a tela apenas espera o webhook chegar.

### Planos (modelo de receita)

| Plano | Preço mensal | Ideias | Conteúdos em produção | Anexos | Histórico de métricas | Membros |
|---|---|---|---|---|---|---|
| **Gratuito** | R$ 0,00 | 50 | 15 | 100 MB | 30 dias | 1 |
| **Kreato Creator** | R$ 29,90 | ilimitadas | ilimitados | 2 GB | completo | 1 |
| **Kreato Studio** | R$ 79,90 | ilimitadas | ilimitados | 10 GB | completo | 5 |

Os limites valem **na API** a cada requisição (o plano é lido do banco). Ao estourar, a API responde `403` com `code: "PLAN_LIMIT_REACHED"`, o limite atingido e como liberar (por exemplo: *"Você atingiu o limite de 15 conteúdos em produção do seu plano. Publique ou exclua conteúdos, ou faça upgrade."*).

### Webhooks tratados (`POST /api/stripe/webhook`)

| Evento | O que muda no banco |
|---|---|
| `checkout.session.completed` | Guarda o customer e a subscription no usuário e libera o plano pago |
| `customer.subscription.updated` | Atualiza plano, status (`active`, `past_due`, `canceled`…) e valor mensal; troca de plano pelo portal muda o plano pelo Price ID |
| `customer.subscription.deleted` | Volta o usuário ao Gratuito |
| `invoice.payment_failed` | Marca a assinatura como inadimplente, suspende o plano pago e avisa o usuário (e-mail e aviso no app) |

- A assinatura de todo evento é validada com `STRIPE_WEBHOOK_SECRET` sobre o corpo bruto.
- O estado da assinatura é sempre buscado no Stripe, então a ordem de chegada dos eventos não importa.
- O `id` de cada evento é gravado (tabela `StripeEvento`) na mesma transação da mudança: um evento reenviado responde `200` sem efeito.
- Cada webhook vira um evento de auditoria (`STRIPE_*`) e aparece em **Últimos eventos** no painel admin.

### Configuração no painel do Stripe (modo de teste)

1. **Produtos**: crie *Kreato Creator* e *Kreato Studio*, cada um com preço **recorrente mensal em BRL** (valores da tabela). O Gratuito pode ser um produto de R$ 0,00 (opcional). Copie os Price IDs para `STRIPE_PRICE_CREATOR` e `STRIPE_PRICE_STUDIO`.
2. **Portal do cliente** (*Settings → Billing → Customer portal*): permita trocar entre Creator e Studio, atualizar a forma de pagamento e cancelar. Para testar na hora, configure o cancelamento **imediato**.
3. **Webhook** (*Developers → Webhooks*): endpoint `https://<seu-domínio>/api/stripe/webhook` com os quatro eventos acima; o *signing secret* vai em `STRIPE_WEBHOOK_SECRET`.
4. **Variáveis**: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_CREATOR` e `STRIPE_PRICE_STUDIO` ficam **só nas variáveis da stack no Portainer**. Nenhuma chave vai para o repositório.

Para testar localmente, a Stripe CLI encaminha os eventos: `stripe listen --forward-to localhost:8209/api/stripe/webhook`. Cartão de teste: `4242 4242 4242 4242`, qualquer data futura e qualquer CVC. Sem `STRIPE_SECRET_KEY`, o app entra em modo simulado (planos ativados sem cartão), que fica desligado sempre que o Stripe está configurado.

---

## ⚙️ Configuração de Variáveis de Ambiente

O modelo com **todos os nomes** está em [`.env.example`](.env.example), sem nenhum valor real. Copie para `.env` no desenvolvimento; em produção, cadastre as mesmas variáveis na stack do Portainer.

```bash
cp .env.example .env
```

Obrigatórias para subir a stack: as do banco, `JWT_SECRET`, `MINIO_ROOT_USER` e `MINIO_ROOT_PASSWORD`. Para e-mails e assinatura: `FRONTEND_URL`, `BREVO_API_KEY` e `BREVO_SENDER_EMAIL` (ou Mailtrap) e as `STRIPE_*`.

---

## 🚀 Como Executar o Projeto

### Opção 1: Utilizando Docker Compose (Recomendado)

1. Certifique-se de ter o **Docker** e o **Docker Compose** instalados.
2. Certifique-se de preencher os valores das variáveis no arquivo `.env`.
3. No diretório raiz do projeto, suba todos os microserviços:

```bash
docker compose up --build -d
```

4. A aplicação estará acessível unificada na porta configurada:
   - **Aplicação Web & API**: `http://localhost:8209`
   - **Documentação Swagger Auth Service**: `http://localhost:8209/auth/apidocs`
   - **Documentação Swagger Log Service**: `http://localhost:8209/log/apidocs`

---

## 🌐 Endpoints da API

A referência completa, com corpos e respostas, está no Swagger de cada serviço. As regras de negócio estão em [`documentacao.md`](documentacao.md).

### Autenticação & Sessão (`auth-service`) · Swagger em `/auth/apidocs`
- `POST /api/create`: cadastra um novo usuário.
- `POST /api/auth`: login; gera JWT e Refresh Token.
- `POST /api/auth/refresh`: renova o JWT.
- `POST /api/auth/logout`: encerra a sessão.
- `POST /api/auth/reset` e `POST /api/auth/reset/confirm`: redefinição de senha por e-mail.

### API principal (`backend`) · Swagger em `/api/docs`
- **Perfil**: `GET/PUT /api/user/profile`, `POST/DELETE /api/user/avatar`, `GET /api/user/usage`.
- **Workspaces e equipe**: `GET /api/workspaces`, `GET/PATCH /api/workspaces/current`, `GET /api/membros`, `PATCH/DELETE /api/membros/:id`, `POST /api/membros/sair`.
- **Convites**: `GET/POST /api/convites`, `POST /api/convites/:id/reenviar`, `DELETE /api/convites/:id`, `GET /api/convites/token/:token`, `POST /api/convites/aceitar`.
- **Ideias**: `GET/POST /api/ideias`, `GET/PATCH/DELETE /api/ideias/:id`, `POST /api/ideias/:id/converter`.
- **Conteúdos**: `GET/POST /api/conteudos`, `GET/PATCH/DELETE /api/conteudos/:id`, `PATCH /api/conteudos/:id/etapa`.
- **Revisão**: `GET/POST /api/conteudos/:id/comentarios`, `PATCH/DELETE /api/comentarios/:id`, `POST /api/conteudos/:id/aprovar-roteiro`, `POST /api/conteudos/:id/solicitar-ajustes`.
- **Anexos**: `GET/POST /api/conteudos/:id/anexos`, `GET /api/anexos/:id/arquivo`, `DELETE /api/anexos/:id`.
- **Métricas e dashboard**: `GET /api/metricas/resumo`, `GET/POST /api/conteudos/:id/metricas`, `DELETE /api/metricas/:id`, `GET /api/dashboard`.
- **Planos (Stripe)**: `GET /api/stripe/plans`, `POST /api/stripe/create-checkout-session`, `POST /api/stripe/verify-session` (só consulta), `POST /api/stripe/portal`, `POST /api/stripe/cancel`, `POST /api/stripe/webhook`.
- **Admin**: `GET /api/admin/metricas` (role `admin`).

### Auditoria (`log-service`) · Swagger em `/log/apidocs`
- `GET /api/logs`: histórico de eventos do Redis Stream (role `admin`).
- `GET /api/logs/stats?dias=30`: estatísticas de uso e segurança por dia (role `admin`).

---

## 👨‍💻 Autor

Desenvolvido por **Guilherme Dias** como parte da disciplina de Introdução à Computação em Nuvem, sob orientação do professor [@siriani](https://github.com/siriani).
