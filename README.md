# BalduCore

Plataforma de gestão e inteligência esportiva para treinadores. Operação inicial: **BalduTraining**.

SPRINT 01: fundação local e dashboard **inteiramente demonstrativo**, sem autenticação, dados pessoais, integração Garmin ou IA real. Não disponibilizar como sistema operacional de acompanhamento antes das sprints de segurança e negócio.

## Requisitos

- Node conforme `.nvmrc` (linha 24).
- pnpm 11.22.0 (`corepack enable` e `corepack prepare pnpm@11.22.0 --activate`, ou instalação equivalente).
- Docker Engine/Desktop com Compose v2; no Windows, habilitar integração com a distribuição WSL utilizada.
- Portas locais 3000 (web), 3001 (API) e 5432 (PostgreSQL).

## Primeira execução

Na raiz:

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm db:up
pnpm db:generate
pnpm dev
```

Acessos:

- Dashboard: http://127.0.0.1:3000
- Liveness: http://127.0.0.1:3001/health
- Readiness com banco: http://127.0.0.1:3001/health/ready
- OpenAPI/Swagger local: http://127.0.0.1:3001/docs
- Mesma API via web: http://127.0.0.1:3000/api/health/ready

A API lê `.env` da raiz. Next encaminha `/api/*` ao backend local, sem expor conexão do banco ao browser. O backend escuta somente loopback por padrão. O dashboard é servido mesmo com API/banco indisponíveis porque nesta sprint contém apenas fixtures; readiness indica separadamente a saúde real.

API_PORT é configurável; se mudar, ajustar o destino em `apps/web/next.config.ts` e a configuração de E2E. Se mudar usuário, senha ou porta do banco, atualizar também DATABASE_URL. Senhas com caracteres especiais devem ser percent-encoded na URL. Credenciais do exemplo são exclusivamente locais.

`pnpm dev` observa alterações TypeScript da API e do Next. `pnpm db:down` para o banco sem remover os dados. Não usar `down -v` sem intenção explícita de apagar o volume.

## Estrutura

- `apps/web`: App Router, componentes, tokens, sidebar, temas e fixtures isoladas.
- `apps/api`: Nest ESM, configuração validada, Prisma e endpoints operacionais.
- `infra/compose.yaml`: PostgreSQL com volume persistente e healthcheck.
- `tests/e2e`: interface responsiva e fluxo proxy/API/banco.
- `docs`: produto, arquitetura, decisões, roadmap e referências originais.

## Validação

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Integração exige PostgreSQL acessível pela DATABASE_URL. Não usa banco em memória nem ignora silenciosamente a ausência do banco. E2E exige build prévio, inicia API/web automaticamente e verifica o PostgreSQL real pelo proxy. Screenshots dos temas em desktop/tablet/mobile ficam em `test-results/` (ignoradas no Git; modelo de CI prevê upload após ativação). Testes de API usam portas efêmeras e não modificam dados. O modelo de CI também provisiona PostgreSQL, mas ainda não está ativo.

Produção local de teste após build: `pnpm --filter @balducore/api start` e `pnpm --filter @balducore/web start` em terminais separados. Isso não é um plano de deploy do MVP completo.

## Prisma e migrations

Schema configurado sem tabelas artificiais de domínio. Nesta sprint, Prisma faz `SELECT 1` para readiness, usando adapter PostgreSQL da linha 7. O client é gerado, não versionado. Os tipos next-env.d.ts também são gerados pelo Next e ignorados no Git; as regras do agente ficam no AGENTS.md da raiz. Não existe migration de negócio nesta etapa.

Quando uma sprint exigir persistência: adicionar apenas os modelos aprovados, executar `pnpm db:migrate --name nome_da_mudanca`, revisar SQL e versionar `apps/api/prisma/migrations/`. Em implantação, aplicar migrations existentes com `pnpm db:deploy`; não usar migrate dev em produção. Backup e restauração serão ensaiados antes do piloto.

## Design e demonstração

Fonte de verdade: oito PNGs em `docs/design/references/`. Cor principal #EF3338; temas com tokens semânticos. Arial/Helvetica/system sans-serif é provisória; símbolo Activity e marca textual são substitutos explícitos até receber assets originais. Não são o logotipo recuperado dos PNGs.

A demonstração fixa sua referência temporal em 15/11/2026; filtros 7/30/90 dias alteram somente fixtures. Estados de conexão exibidos nos cards dos alunos são simulados, sem tokens ou contas reais. Insights são texto sintético fixo, sem chamada de IA. Navegação futura indica “Em breve” ou “MVP 2” e não cria rotas vazias. Tema é a única informação persistida no localStorage; não contém sessão ou dados pessoais.

## Segurança e limites

Sem endpoints de alunos, convites ou Garmin nesta entrega. Health não autentica usuários e não deve ser usado como substituto de autorização. Logs JSON registram correlationId gerado no servidor, método, status e duração; não registram URL/query/headers/body nem erros brutos que possam conter credenciais. Swagger é habilitado apenas fora de produção. Env e resultados locais não são versionados.

Veja [roadmap](docs/roadmap.md), [arquitetura](docs/architecture/overview.md) e [ADR-001](docs/decisions/adr-001-stack.md). Trabalho por branch de sprint e PR para main; próxima sprint somente após autorização.

## Ativação do CI — pendente

O workflow pronto está em `infra/github-actions-ci.yml`. O push para `.github/workflows/ci.yml` foi recusado pelo GitHub porque a credencial OAuth disponível não possui escopo `workflow`. Por isso ele é entregue como modelo, sem execução automática. Após configurar uma credencial autorizada, mover esse arquivo para `.github/workflows/ci.yml` em uma branch e abrir PR; a movimentação requer o escopo correspondente. Os testes locais relatados foram executados e não dependem da ativação do CI.
