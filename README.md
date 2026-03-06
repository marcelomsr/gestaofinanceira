# Investidor Supabase App

Frontend estatico em `Vite + TypeScript` para gerenciar proventos diretamente no Supabase.

## Scripts

- `npm.cmd run dev`
- `npm.cmd run build`
- `npm.cmd run preview`

## Variaveis de ambiente

Use `.env` ou `.env.local` com:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua_chave_publishable
```

Tambem funciona `VITE_SUPABASE_ANON_KEY` no lugar de `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Estrutura no Supabase

Use o script em `supabase/proventos.sql` para criar a tabela `provento` e as policies iniciais.

## Deploy

Para GitHub Pages, ajuste `VITE_BASE_PATH` se o repositorio for publicado em um subcaminho.

O workflow de deploy esta em `.github/workflows/deploy.yml`.

Antes do primeiro deploy, configure no GitHub:

- `Settings > Pages > Source: GitHub Actions`
- `Settings > Secrets and variables > Actions > Variables`

Crie estas variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
