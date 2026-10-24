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

- **Autenticação & Sessão**: Cadastro de conta, login com geração de tokens JWT e Refresh Tokens persistentes no MySQL, encerramento de sessão e recuperação de senha.
- **Foto de Perfil com MinIO (S3)**: Upload de foto de perfil pelo usuário com validação client-side e server-side de tipo de arquivo (`JPG`, `PNG`, `WEBP`, `GIF`) e tamanho máximo (até 5MB). O arquivo é armazenado no bucket `avatars` no MinIO e a referência da URL é salva no banco de dados.
- **Página de Perfil do Usuário**: Painel para visualização da conta, upload/alteração/remoção da foto de perfil e edição de bio curta (até 250 caracteres).
- **Auditoria de Eventos com Redis**: Microserviço de logs que consome eventos em tempo real (`XADD` / `XREAD`) via Redis Streams para auditoria de logins, logouts e exceções.
- **Documentação de API OpenAPI/Swagger**: Interface Swagger interativa para o microserviço de autenticação.

---

## 🔒 Permissões por Tipo de Usuário (Roles)

### Usuário Comum (`USER`)
- **Foto de Perfil**: Realizar upload, alterar ou remover sua imagem de perfil armazenada no MinIO.
- **Editar Bio**: Adicionar ou modificar sua bio curta no perfil.
- **Sessão**: Criar conta, realizar login, renovar sessão, encerrar sessão e redefinir senha.

### Administrador (`ADMIN`)
Possui **todas as permissões do Usuário Comum (`USER`)**, com os seguintes privilégios adicionais:
- **Auditoria de Logs**: Consulta aos registros de eventos do sistema via microserviço de logs.

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

## ⚙️ Configuração de Variáveis de Ambiente

Crie o arquivo `.env` no diretório raiz conforme o modelo abaixo:

```env
# Banco de Dados MySQL
DATABASE_URL="mysql://usuario:senha@host:3306/nome_banco"
DATABASE_HOST="host"
DATABASE_USER="usuario"
DATABASE_PASSWORD="senha"
DATABASE_NAME="nome_banco"
DATABASE_PORT="3306"

# Segredo de Autenticação
JWT_SECRET="seu_jwt_secret_super_seguro"

# Frontend
VITE_API_BASE_URL=/api

# Configurações MinIO (Object Storage S3)
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin123
MINIO_BUCKET_NAME=avatars

# Redis Streams & Serviços
REDIS_URL=redis://redis:6379
AUTH_SERVICE_URL=http://auth-service:3334
FRONTEND_URL=http://localhost:8209
```

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

### Autenticação & Sessão (`auth-service`)
- `POST /api/create`: Cadastra um novo usuário.
- `POST /api/auth`: Realiza login, gera JWT e Refresh Token.
- `POST /api/auth/refresh`: Renova o token de acesso JWT expirado.
- `POST /api/auth/logout`: Invalida o token e encerra a sessão.
- `POST /api/auth/reset`: Solicita redefinição de senha por e-mail.
- `POST /api/auth/reset/confirm`: Confirma e altera a senha.
- `GET /auth/apidocs`: Documentação interativa Swagger UI do `auth-service`.

### Perfil do Usuário & MinIO Avatar (`backend`)
- `GET /api/user/profile`: Retorna o perfil completo do usuário autenticado.
- `PUT /api/user/profile`: Atualiza nome e bio do usuário.
- `POST /api/user/avatar`: Faz o upload da foto de perfil para o MinIO e salva a referência no MySQL.
- `GET /api/user/avatar/:filename`: Serve a imagem de perfil armazenada no MinIO.
- `DELETE /api/user/avatar`: Remove a foto de perfil do MinIO e limpa a referência no banco.

### Auditoria de Logs (`log-service`)
- `GET /api/logs`: Consulta o histórico de eventos e logs de auditoria via Redis Stream (`ADMIN`).

---

## 👨‍💻 Autor

Desenvolvido por **Guilherme Dias** como parte da disciplina de Introdução à Computação em Nuvem, sob orientação do professor [@siriani](https://github.com/siriani).
