# BalduCore

Plataforma de gestão e inteligência esportiva para treinadores. Operação inicial: **BalduTraining**.

SPRINT 02: login demonstrativo local para os testes atuais, sessões revogáveis e gestão de alunos persistidos. Integração Google/OIDC preparada para ativação futura. Dashboard continua demonstrativo e identificado, separado dos cadastros reais. Garmin, convites, FIT e IA real entram em sprints posteriores.

## Execução local

Requisitos: Node conforme `.nvmrc` (24), pnpm 11.22.0, Docker/Compose v2 com WSL habilitado e portas 3000/3001/5432 livres. Alternativamente, PostgreSQL 17 acessível pelas URLs configuradas.

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm db:up
pnpm db:deploy
pnpm dev
```

A primeira criação do volume Compose também cria `balducore_test`. Para volume já existente, criar esse banco sem apagar o volume:

```bash
docker compose --env-file .env -f infra/compose.yaml exec postgres createdb -U balducore balducore_test
```

Substituir o usuário se POSTGRES_USER foi alterado. Não usar `down -v` para atualizar o schema: isso apaga dados. `pnpm db:down` para o serviço preservando o volume.

- Interface: http://127.0.0.1:3000 (redireciona para login se não autenticado).
- Alunos: http://127.0.0.1:3000/alunos (protegido).
- API liveness: http://127.0.0.1:3001/health.
- API readiness com banco: http://127.0.0.1:3001/health/ready.
- Swagger local: http://127.0.0.1:3001/docs, desabilitado em produção.

O `.env.example` inicia em modo demonstrativo local. Com AUTH_MODE=google e sem credenciais, a página informa indisponibilidade. `pnpm dev` recompila API/web após alterações. API lê `.env` da raiz, Next encaminha `/api/*` para loopback 3001. Caso altere API_PORT, ajustar destino no next.config e E2E. API_INTERNAL_ORIGIN pode configurar acesso servidor → API, nunca é lido de headers do cliente.

## Login fictício para testar agora

No `.env` local:

```env
AUTH_MODE=demo
APP_ORIGIN=http://127.0.0.1:3000
API_HOST=127.0.0.1
NODE_ENV=development
```

Após iniciar a API e o frontend, abrir http://127.0.0.1:3000 e escolher **Entrar como Treinador Demo 1** ou **Entrar como Treinador Demo 2**. Não precisa de conta Google, senha, cliente OAuth ou credenciais Google. PostgreSQL continua necessário para testar sessões e cadastros persistidos.

As duas contas são fictícias e isoladas. A interface mantém aviso de demonstração e as respostas de sessão/alunos têm isSynthetic=true. Use apenas nomes/e-mails de teste. Cadastros feitos nessas contas permanecem sintéticos mesmo após reiniciar; o issuer específico `urn:balducore:demo` não é vinculado a uma conta Google. Uma sessão demo não é aceita ao trocar para modo Google, e vice-versa.

AUTH_SECRET é opcional em demo: se vazio, a API gera chave efêmera local. Em Google, continuam obrigatórias as credenciais e uma chave válida. AUTH_MODE=demo é rejeitado em NODE_ENV=production, origem pública ou bind de API fora de loopback. Nenhum endpoint permite informar livremente uma identidade; somente as duas contas fixas estão disponíveis. A entrada demonstrativa valida origem e mantém rate limiting, cookie HttpOnly, CSRF nas mutações, expiração e logout.

Para os testes atuais, a configuração e validação Google foram **adiadas por decisão do responsável técnico**. Não é necessário fazê-las para revisar a SPRINT 02 em modo demo. Não publicar esse ambiente local como sistema de acompanhamento real.

## Configurar login Google real — etapa futura

Antes de ativar o fluxo real, definir AUTH_MODE=google. Depois:

1. No Google Cloud, criar/configurar um projeto e sua aplicação OAuth para web, com tela de consentimento e usuários de teste quando exigido pelo estado da aplicação.
2. Registrar exatamente o retorno local `http://127.0.0.1:3000/api/auth/google/callback`. Cadastrar URL HTTPS própria para produção. Não intercambiar localhost e 127.0.0.1 sem ajustar todas as configurações.
3. Preencher GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET somente no `.env` ignorado/secret manager. Gerar AUTH_SECRET como 32 bytes aleatórios codificados em base64, por ferramenta local confiável; não usar segredo de exemplo.
4. Manter APP_ORIGIN como origem pública exata, sem barra final. HTTPS e cookie Secure são obrigatórios quando NODE_ENV=production.
5. Configurar GOOGLE_ALLOWED_EMAILS com os endereços Gmail ou Workspace previamente autorizados, separados por vírgula. A entrada por e-mail exige email_verified e Google como autoridade do endereço. Para conta Google de domínio terceiro sem Workspace, autorizar pelo identificador Google `sub` previamente confirmado em GOOGLE_ALLOWED_SUBJECTS. Não aceitar token enviado pelo usuário como mecanismo de cadastro; confirmar identidade pelo procedimento operacional seguro.
6. Reiniciar a API e entrar com a conta autorizada. A autenticação solicita apenas openid/email/profile. Não solicita Gmail/Drive e não mantém tokens Google após o login.

O primeiro login autorizado cria o perfil; a identidade estável é issuer + subject, nunca uma fusão por e-mail. A lista não vazia não autoriza terceiros. Para bloqueio imediato de treinador já cadastrado, desabilitar seu perfil e revogar suas sessões pelo comando de manutenção abaixo. Remover um e-mail da lista impede novos logins, mas não encerra por si uma sessão já emitida.

Fonte: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect). Smoke com Google real depende das credenciais autorizadas; a validação automatizada usa emissor de teste isolado e não prova aprovação/configuração do projeto Google.

## Sessões e API de alunos

- Cookie HttpOnly, host-only, SameSite=Lax e Secure em produção, com prefixo __Host- produtivo. Em desenvolvimento, o nome é balducore_session; produção usa __Host-balducore_session e não aceita o cookie de desenvolvimento. Sessão opaca aleatória com hash no PostgreSQL, duração absoluta SESSION_HOURS (padrão 8 horas), sem renovação automática.
- Tentativas OAuth duram 10 minutos, vinculadas ao navegador, com state/nonce/PKCE e checks cifrados com AES-GCM. Consumo único antes da troca externa; falhas exigem iniciar novo login.
- `GET /api/auth/session` devolve perfil e CSRF, sem token de sessão. POST/PATCH exigem Origin igual à APP_ORIGIN e X-CSRF-Token. CSRF fica apenas em memória durante a ação, nunca localStorage.
- `POST /api/auth/logout` revoga sessão no servidor e remove cookie; não desconecta a conta Google do navegador.
- `GET /api/athletes`: q, status (pending/active/ended), page e limit (máximo 100).
- `GET /api/athletes/:id`: perfil somente do próprio treinador.
- `POST /api/athletes`: name e email; cria vínculo pending atomicamente.
- `PATCH /api/athletes/:id`: name, email e version; conflito concorrente retorna 409.
- E-mail é normalizado, único por treinador e pode existir para outro treinador. Payload não aceita coachId ou alteração manual de vínculo.
- Perfil indica Garmin não conectada sem inventar uma autorização. Nenhum aceite ou consentimento é registrado pelo coach em nome do aluno.

Dados autenticados não entram em cache público. Logout/expiração/disabled são verificados na API em cada requisição. Rotas SSR consultam sessão sem cache e não acessam banco diretamente. Logs JSON omitem URL, query, headers, corpo e erros brutos; request logging do Next dev foi desativado para não registrar códigos OAuth.

Limites compartilhados no PostgreSQL: 15 inícios de login/minuto, 30 callbacks/minuto por origem/IP e 60 escritas/minuto por treinador/IP. Não confiar em X-Forwarded-For sem configuração explícita de proxy; no piloto via Next, IP efetivo é o loopback e limites de login podem ser compartilhados. Ajustar topologia/limites antes de escala, sem simplesmente confiar em headers enviados pelo cliente.

## Migrations e operação

Migration inicial versionada em `apps/api/prisma/migrations/` com Coach, sessões, tentativas OAuth, Athlete, vínculo, auditoria e buckets de limite. Constraints compostas impedem referências entre treinadores; auditoria mínima não guarda nomes, e-mails ou payloads.

```bash
pnpm db:deploy
pnpm --filter @balducore/api maintenance cleanup-auth
pnpm --filter @balducore/api maintenance disable-coach ID_DO_COACH
```

Executar limpeza de registros expirados regularmente pelo operador; esta sprint não cria scheduler. Ela não apaga alunos nem auditoria. Auditoria/retencão esportiva e políticas legais completas continuam pendentes antes de dados reais no piloto. Alterar AUTH_SECRET invalida tentativas pendentes; não revoga automaticamente todas as sessões opacas. Em incidente, revogar sessões e bloquear contas conforme necessário.

Para nova mudança aprovada: alterar schema, `pnpm db:migrate --name nome`, revisar SQL e versionar a migration. Não usar migrate dev em produção. Client Prisma e next-env.d.ts são gerados e ignorados no Git.

## Testes e checks

Usar TEST_DATABASE_URL **diferente** de DATABASE_URL. Banco de testes separado é obrigatório; fixtures não são sementes para o sistema operacional. Para um PostgreSQL externo, criar o banco de testes antes de aplicar migrations.

```bash
pnpm db:test:deploy
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:e2e:demo
```

Integração valida criptografia, assinatura JWT, issuer/audience/nonce, PKCE, callback/replay/expiração, rate limit, CSRF, dois coaches, FKs, duplicidade e concorrência. E2E inicia entrypoint exclusivo com emissor OIDC local e JWTs assinados para cadastro/lista/perfil/logout, além de proteger rotas anônimas e preservar temas/responsividade. Não reutiliza servidores existentes para evitar testes contra processos errados; portas devem estar livres. Nenhuma variável ativa o emissor OIDC de teste no main. O modo local demo usa identidades próprias e não esse emissor. O servidor E2E recusa NODE_ENV=production. Resultados/screenshots ficam em test-results e são ignorados no Git. Dados sintéticos podem permanecer apenas no banco de testes.

## Estrutura e identidade visual

- apps/web: páginas públicas/protegidas, componentes, tokens e fixtures do dashboard.
- apps/api: Nest modular Auth/Athletes, Prisma, operação e testes.
- infra: Compose, inicialização do banco de testes e modelo de CI.
- docs: arquitetura, domínio, decisões, roadmap e oito PNGs originais.

Referências em docs/design/references são a fonte visual. Cor #EF3338, dark/light, sidebar e cards preservados; Arial/Helvetica e símbolo genérico permanecem provisórios. Novas telas seguem esses componentes. Apenas a preferência visual persiste no localStorage; nunca sessão ou dados dos alunos.

## Pendências externas

Docker indisponível no WSL usado durante a entrega: testes locais usaram PostgreSQL 17.7 temporário, sem alegar execução de Compose. Google real foi adiado; sua configuração não bloqueia os testes locais com login fictício. Sem deploy público nesta sprint.

CI pronto em `infra/github-actions-ci.yml`, ainda inativo: OAuth App do GitHub não possui escopo workflow para publicar em `.github/workflows/`. Com credencial autorizada, mover para esse destino via PR. Modelo atualizado com migrations do banco de testes; nenhum resultado de Actions é alegado.

Veja [ADR-002](docs/decisions/adr-002-auth-athletes.md) e [roadmap](docs/roadmap.md). SPRINT 03 e merge somente com autorização.
