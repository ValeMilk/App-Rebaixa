# Rebaixa Valemilk

Sistema web para a equipe comercial solicitar **rebaixas** e **ofertas internas** com base no estoque e vencimento dos produtos por loja, integrado a ATIVMOB e ao ERP.

## Stack

- **Frontend**: Next.js 14 (App Router) + Tailwind + Zustand
- **Backend**: Node.js + Express + Mongoose + JWT + node-cron
- **Banco**: MongoDB Atlas
- **Deploy**: Docker / docker-compose

## Identidade visual

- Primaria: `#0056A6`
- Branco: `#FFFFFF`

## Estrutura

```
rebaixa-app/
├── docker-compose.yml
├── backend/    # API Express
└── frontend/   # Next.js
```

## Pre-requisitos

- Node 20+
- Conta MongoDB Atlas (string de conexao)
- Chave da API ATIVMOB

## Setup local (sem docker)

### 1. Backend

```bash
cd backend
cp .env.example .env       # preencher MONGODB_URI etc
npm install
npm run seed:admin         # cria admin inicial
npm run dev
```

API em `http://localhost:4000` • healthcheck `GET /health`

### 2. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

UI em `http://localhost:3000`

Login com o admin criado no seed (email/senha = codigo do .env).

## Setup com Docker (VPS)

1. Preencher `backend/.env` e `frontend/.env`.
2. Subir:
   ```bash
   docker compose up -d --build
   ```
3. Criar admin:
   ```bash
   docker compose exec backend npm run seed:admin
   ```

## Perfis

- **supervisor**: ve apenas as lojas da sua carteira, cria solicitacoes de rebaixa/oferta interna.
- **diretoria**: aprova/rejeita solicitacoes, ve tudo.
- **admin**: gerencia usuarios e sincronizacao manual.

## Sincronizacao

- **Automatica**: via cron (`SYNC_CRON`, default `*/30 * * * *`).
- **Manual**: tela `Admin → Sincronizacao`.
- **Estoque**: busca direto da API ATIVMOB com `event_code=estoque`.
- **Carteira (Loja → Supervisor)**: ERP - implementar `services/erpService.js` quando a query for fornecida.

## Classificacao por validade

| Classe   | Regra            |
|----------|------------------|
| vencido  | data <= hoje     |
| critico  | <= 15 dias       |
| alerta   | <= 30 dias       |
| atencao  | <= 60 dias       |
| ok       | > 60 dias        |

## Endpoints principais

| Metodo | Rota                          | Permissao                |
|--------|-------------------------------|--------------------------|
| POST   | `/api/auth/login`             | publico                  |
| GET    | `/api/auth/me`                | autenticado              |
| GET    | `/api/estoque`                | autenticado              |
| GET    | `/api/estoque/resumo`         | autenticado              |
| POST   | `/api/solicitacoes`           | supervisor / admin       |
| GET    | `/api/solicitacoes`           | autenticado              |
| GET    | `/api/solicitacoes/:id`       | autenticado              |
| POST   | `/api/solicitacoes/:id/decidir` | diretoria / admin      |
| POST   | `/api/solicitacoes/:id/cancelar` | dono / admin           |
| GET    | `/api/users`                  | admin                    |
| POST   | `/api/users`                  | admin                    |
| PUT    | `/api/users/:id`              | admin                    |
| DELETE | `/api/users/:id`              | admin                    |
| GET    | `/api/sync/status`            | admin / diretoria        |
| POST   | `/api/sync/estoque`           | admin / diretoria        |
| POST   | `/api/sync/carteira`          | admin / diretoria        |

## Proximos passos

- Plugar a query SQL do ERP no [erpService.js](backend/src/services/erpService.js).
- Adicionar precos atual e sugerido por produto (vem do ERP tambem).
- Notificacoes para diretoria quando tiver solicitacao pendente.
