# CineHanks - Catálogo de Filmes & Microserviços

Aplicação web fullstack e orientada a microserviços para exploração, avaliação e gerenciamento de filmes do ator Tom Hanks. O sistema integra a API do TMDB (The Movie Database), autenticação distribuída com JWT e Refresh Tokens, armazenamento de imagens de perfil via **MinIO (Object Storage S3)**, mensageria e auditoria em tempo real com **Redis Streams**, e banco de dados relacional MySQL. 

O projeto é utilizado na disciplina de Introdução à Computação em Nuvem, com orquestração de contêineres e deploy gerenciado via **Portainer**.

> 📖 **Documentação Técnica & Reversa**: Para a especificação completa do sistema (visão do usuário/código herdado), diagrama de arquitetura detalhado de todos os serviços (Mermaid) e mapeamento exaustivo das regras de negócio (*"Se X, então Y"*), consulte o arquivo [`documentacao.md`](documentacao.md).

---

## 🚀 Funcionalidades

- **Autenticação & Sessão**: Cadastro de conta, login com geração de tokens JWT e Refresh Tokens persistentes no MySQL, encerramento de sessão e recuperação de senha.
- **Foto de Perfil com MinIO (S3)**: Upload de foto de perfil pelo usuário com validação client-side e server-side de tipo de arquivo (`JPG`, `PNG`, `WEBP`, `GIF`) e tamanho máximo (até 5MB). O arquivo é armazenado no bucket `avatars` no MinIO e a referência da URL é salva no banco de dados.
- **Página de Perfil do Usuário**: Painel para visualização da conta, upload/alteração/remoção da foto de perfil, edição de bio curta (até 250 caracteres) e exibição dos filmes favoritos.
- **Catálogo de Filmes**: Integração com a API do TMDB para exibição completa da filmografia de Tom Hanks (pôster, sinopse, avaliação e ano).
- **Busca & Paginação**: Filtro em tempo real por título, título original, personagem ou ano, com paginação interativa.
- **Favoritos Personalizados**: Adição e remoção de filmes da lista de favoritos com sincronização no MySQL.
- **Sistema de Comentários**: Inclusão e exclusão de comentários em cada filme.
- **Moderação por Administrador (`ADMIN`)**: Painel exclusivo para administradores realizarem busca, visualização global de todos os comentários do sistema e exclusão irrestrita.
- **Auditoria de Eventos com Redis**: Microserviço de logs que consome eventos em tempo real (`XADD` / `XREAD`) via Redis Streams para auditoria de logins, logouts e exceções.
- **Documentação de API OpenAPI/Swagger**: Interface Swagger interativa para o microserviço de autenticação.

---

## 🔒 Permissões por Tipo de Usuário (Roles)

### Usuário Comum (`USER`)
- **Navegação & Busca**: Explorar o catálogo, utilizar filtros por título, personagem ou ano e visualizar detalhes.
- **Foto de Perfil**: Realizar upload, alterar ou remover sua imagem de perfil armazenada no MinIO.
- **Editar Bio**: Adicionar ou modificar sua bio curta no perfil.
- **Favoritos**: Gerenciar sua lista pessoal de favoritos.
- **Comentários**: Publicar comentários e excluir **apenas os seus próprios** comentários.
- **Sessão**: Criar conta, realizar login, renovar sessão, encerrar sessão e redefinir senha.

### Administrador (`ADMIN`)
Possui **todas as permissões do Usuário Comum (`USER`)**, com os seguintes privilégios adicionais:
- **Painel de Moderação**: Acesso ao menu exclusivo **Moderação (ADMIN)** na barra de navegação.
- **Visualização Global de Comentários**: Acesso à lista de todos os comentários publicados na plataforma, com identificação do autor.
- **Exclusão Irrestrita de Comentários**: Capacidade de moderar e apagar qualquer comentário do banco de dados.
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

A tabela abaixo classifica cada componente e serviço utilizado na plataforma **CineHanks** de acordo com os modelos de serviço de Computação em Nuvem:

| Peça / Componente do Sistema | Camada de Serviço | Justificativa |
| :--- | :---: | :--- |
| **Máquina Virtual (VM / Cloud Compute)** | **IaaS** *(Infrastructure as a Service)* | Fornece a infraestrutura bruta de hardware virtualizado (CPU, memória, armazenamento e rede) e o sistema operacional base onde a solução e o Docker são executados. |
| **Contêineres de Aplicação (Docker / Docker Compose)** | **PaaS** *(CaaS - Containers as a Service)* | Oferece a plataforma e o runtime padronizado de execução para os microserviços e proxies (`backend`, `auth-service`, `log-service`, `frontend`, `nginx`, `redis`, `minio`), abstraindo a administração direta do SO da máquina. |
| **Portainer** | **PaaS** *(Platform as a Service)* | Atua como plataforma gerenciada de orquestração visual e controle de ciclo de vida dos contêineres na nuvem, dispensando a operação manual via terminal na VM. |
| **Banco de Dados Relacional (MySQL / DBaaS)** | **PaaS** *(Database as a Service)* | Entrega o serviço gerenciado de banco de dados relacional na nuvem, liberando os desenvolvedores da configuração e manutenção da infraestrutura física e do sistema operacional do banco. |
| **Stripe (Gateway de Pagamentos)** | **SaaS** *(Software as a Service)* | Entrega uma aplicação pronta em nuvem para checkout e cobrança de assinaturas, assumindo toda a conformidade de segurança (PCI-DSS) e processamento financeiro via APIs e Webhooks. |
| **Provedores de E-mail (Brevo / Mailtrap)** | **SaaS** *(Software as a Service)* | Disponibiliza um software completo em nuvem para disparo e monitoramento de e-mails transacionais (ex.: recuperação de senha), consumido diretamente por API sem necessidade de manter servidores SMTP próprios. |
| **API do TMDB (The Movie Database)** | **SaaS** *(Software as a Service)* | Fornece um serviço web pronto com metadados, pôsteres e sinopses do catálogo cinematográfico, acessado diretamente via requisições HTTP REST. |

---

## 📁 Estrutura do Projeto

```text
movie-catalog/
├── auth-service/              # Microserviço de Autenticação & Tokens
│   ├── prisma/
│   │   └── schema.prisma      # Modelagem Usuario, RefreshToken, ResetToken
│   ├── src/
│   │   ├── controller/        # AuthController & ResetController
│   │   ├── swagger.ts         # Especificação OpenAPI / Swagger
│   │   └── server.ts
│   └── Dockerfile
├── backend/                   # Microserviço Principal (Catálogo, Perfil, MinIO)
│   ├── prisma/
│   │   └── schema.prisma      # Modelagem Usuario, Favorito, Comentario
│   ├── src/
│   │   ├── controller/        # UserController, FavoriteController, CommentController
│   │   ├── middlewares/       # AuthMiddleware & AdminMiddleware
│   │   ├── utils/             # minio.ts (S3 Upload/Stream) & prisma.ts
│   │   └── server.ts
│   └── Dockerfile
├── frontend/                  # Aplicação React
│   ├── src/
│   │   ├── api/               # tmdb.ts & backend.ts (Profile, Avatar, Auth, Comments)
│   │   ├── components/        # ProfilePage, Navbar, MovieCard, AuthPage, Modais
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

# Chave API TMDB
VITE_TMDB_API_KEY=sua_chave_api_tmdb
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

### Favoritos (`backend`)
- `GET /api/favorite`: Lista os filmes favoritos do usuário logado.
- `POST /api/favorite`: Adiciona um filme aos favoritos.
- `DELETE /api/favorite/:id`: Remove um filme dos favoritos pelo ID.

### Comentários (`backend`)
- `GET /api/comment/:movieId`: Lista os comentários de um filme.
- `GET /api/comment/admin/all`: Lista todos os comentários do sistema com dados dos autores (`ADMIN`).
- `POST /api/comment`: Publica um novo comentário.
- `DELETE /api/comment/delete/:id`: Remove um comentário (Autor ou `ADMIN`).

### Auditoria de Logs (`log-service`)
- `GET /api/logs`: Consulta o histórico de eventos e logs de auditoria via Redis Stream (`ADMIN`).

---

## 👨‍💻 Autor

Desenvolvido por **Guilherme Dias** como parte da disciplina de Introdução à Computação em Nuvem, sob orientação do professor [@siriani](https://github.com/siriani).
