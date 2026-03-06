# Gestao Financeira

Frontend `Vite + TypeScript` para gestao de proventos com Supabase.

## Requisitos

- Node.js 20+
- npm 10+

## Setup rapido

```bash
npm install
cp .env.example .env.local
```

Preencha o `.env.local`:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua_chave_publishable
VITE_SUPABASE_TABLE=provento
# VITE_BASE_PATH=/
```

Tambem funciona `VITE_SUPABASE_ANON_KEY` no lugar de `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Comandos

- `npm run dev`: ambiente local
- `npm run build`: build de producao
- `npm run preview`: validar build local

## Banco de dados

- Execute `supabase/proventos.sql` para criar estrutura inicial.

## Rotina recomendada

```bash
git pull
npm install
npm run dev
```

## Observacoes

- Nao versionar `.env` e `.env.local`.
