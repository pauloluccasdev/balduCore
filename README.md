# BalduCore

Plataforma de gestão e inteligência esportiva para treinadores. Operação inicial: **BalduTraining**.

SPRINTS 01–06 mescladas; gráficos, segmentos e análise determinística disponíveis. SPRINT 07 adiada como débito técnico DT-IA-01; IA não implementada. SPRINT 08 mesclada no PR #10: diário e histórico do treinador. SPRINT 09 mesclada no PR #11: Central de Monitoramento. SPRINT 10 mesclada no PR #12, conforme ADR-010 aprovado. SPRINT 11 aprovada e mesclada no PR #13, conforme ADR-011. Próxima atividade: revisão do piloto local sintético. Histórico de atividades, métricas/splits/amostras e FIT de teste disponíveis. Login fictício mantido; Google real e Garmin oficial permanecem adiados/bloqueados. Dashboard consulta dados persistidos autorizados; os registros de demonstração continuam identificados como sintéticos. IA permanece pendente, sem data de retomada.

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

## Testar convites e aceites — SPRINT 03

Somente AUTH_MODE=demo, local e fora de produção. No modo Google, os endpoints de convite/jornada simulada não são registrados. Não há integração de e-mail nesta sprint.

1. Entrar como Treinador Demo 1, cadastrar um aluno fictício e abrir seu perfil.
2. Em **Convites e aceites**, gerar convite de teste. Guardar/copiar o link exibido uma vez e compartilhá-lo manualmente. Validade de 48 horas; gerar outro revoga os anteriores e suas jornadas pendentes.
3. Abrir o link em outro navegador/janela anônima. GET/previews não consomem o convite. O fragmento é removido da barra ao carregar; **Iniciar aceite** consome o convite e cria sessão pública de 30 minutos, separada da sessão do coach.
4. No perfil do treinador, clicar **Atualizar convites** para consultar o código simulado de seis dígitos. O código só aparece para o dono e não foi enviado por e-mail; expira em dez minutos e bloqueia após cinco erros. Código expirado exige novo convite.
5. Na página pública, informar nome/e-mail fictícios, mantendo o destinatário do convite, e verificar o código. Divergência não associa outro aluno. Ler os dois exemplos versionados e marcar separadamente os aceites, inicialmente desmarcados.
6. Confirmar: vínculo fica ativo e Garmin permanece **não conectada**. Recarregar o perfil/lista do coach mostra o estado persistido. O aluno não recebe conta nem dashboard.
7. Guardar o link de encerramento exibido na confirmação (sete dias, uso único). Ele abre revisão e confirmação explícita da retirada dos aceites. Encerrar grava novas evidências e altera o vínculo para encerrado, sem apagar os aceites anteriores. Não existe reabertura nesta etapa.
8. Se perder/expirar esse link, o coach de um vínculo ativo pode **Gerar link de encerramento** e compartilhá-lo manualmente, revogando o anterior e sua sessão. Resgate de encerramento cria sessão de 30 minutos. Abrir o link não encerra automaticamente.

Em erro de rede depois de iniciar, recarregar `/convite` no mesmo navegador retoma a sessão válida. Abrir um link novo e recarregar antes do resgate perde o segredo em memória; solicitar outro convite. Nenhum segredo vai para localStorage. Alterar e-mail do cadastro revoga convites existentes. Convite revogado/expirado/usado não concede acesso; API pública não devolve nome/e-mail do destinatário ou código.

Para persistir códigos entre reinícios, configurar AUTH_SECRET com 32 bytes aleatórios em base64 no `.env` ignorado. Se estiver vazio, a chave demo é efêmera; após reinício, códigos pendentes podem ficar indisponíveis e exigem reemissão. Não usar chave de exemplo nem versionar a chave. Evidências persistidas são sintéticas e não comprovam identidade real, aprovação jurídica ou conexão Garmin. Retenção/exclusão produtiva e documentos reais dependem de definição posterior.

API local (prefixo `/api` no proxy Next):

| Método e caminho                                      | Finalidade                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------- |
| GET/POST `/athletes/:id/invitations`                  | Listar/emitir, com sessão de coach e ownership; emissão exige CSRF. |
| POST `/athletes/:id/invitations/:invitationId/revoke` | Revogar convite do próprio aluno.                                   |
| POST `/athletes/:id/withdrawal-link`                  | Reemitir acesso de encerramento de vínculo ativo.                   |
| POST `/public/invitation/preview`                     | Consultar disponibilidade sem consumir; token no corpo.             |
| POST `/public/invitation/redeem`                      | Resgatar uma única vez e definir cookie de jornada.                 |
| GET `/public/enrollment`                              | Sessão, documentos de exemplo e CSRF públicos restritos.            |
| POST `/public/enrollment/verify`                      | Verificar e-mail esperado e código simulado.                        |
| POST `/public/enrollment/accept`                      | Registrar aceites versionados e ativar vínculo atomicamente.        |
| POST `/public/withdrawal/redeem`                      | Trocar link de encerramento por cookie de finalidade restrita.      |
| GET `/public/withdrawal`                              | Consultar sessão de encerramento e CSRF.                            |
| POST `/public/withdrawal/confirm`                     | Retirar aceites e encerrar vínculo atomicamente.                    |

POST públicos exigem Origin exata; depois do resgate também exigem o CSRF da sessão pública correspondente. Cookies `balducore_enrollment` e `balducore_withdrawal` são distintos do cookie de coach, HttpOnly/SameSite=Lax e exclusivos do demo local. Tokens não aparecem nas respostas de sessão. Respostas usam no-store. Limites: 30 operações por capability válida/minuto/IP/origem, bootstrap de 30/minuto/IP e 120 consultas de sessão; 30 escritas de convite por coach/minuto/IP. O proxy local compartilha IP; revisar topologia antes de escala.

## Garmin mock e processamento — SPRINT 04

Nenhuma conta Garmin real é acessada. A implementação oficial depende de aprovação, credenciais e documentação autorizada; não basta trocar uma variável para ativá-la. A configuração padrão GARMIN_PROVIDER=disabled mantém login/alunos/convites executáveis sem a fila.

Para testar o mock local após aplicar migrations:

```bash
pnpm garmin:setup
pnpm dev
```

`garmin:setup` exige `.env` com AUTH_MODE=demo, origem/bind locais e ambiente fora de produção. Gera chaves de 32 bytes para GARMIN_TOKEN_KEY e GARMIN_MOCK_SIGNING_KEY no `.env` ignorado, preserva chaves existentes válidas e não as imprime. Não altera credenciais Google, não envia dados nem cria autorização real. Reiniciar API/worker após mudar a configuração. Não versionar o `.env` ou compartilhar as chaves.

`pnpm dev` faz um build inicial da API e inicia três processos: Nest, Next e worker do mesmo backend. No demo, o worker também processa FIT quando o mock está desabilitado; fora do demo e sem mock, fica ocioso. Para processos separados, após `pnpm build`:

```bash
pnpm --filter @balducore/api start
pnpm --filter @balducore/web start
pnpm --filter @balducore/api worker
```

Executar cada comando em um terminal. API e worker leem o mesmo `.env`, banco, GARMIN_QUEUE_NAMESPACE e chaves; manter esses valores estáveis. pg-boss 12.38.2 usa schema próprio no mesmo PostgreSQL, sem Redis. Instalação/migração automática do schema da biblioteca é restrita ao demo local; produção oficial exige plano de migração/deploy aprovado. Migrations Prisma continuam versionadas em prisma/migrations. O usuário local do banco precisa criar schema/tabelas da fila.

Fluxo manual:

1. Gerar convite para aluno fictício e completar código/aceites da SPRINT 03.
2. Na confirmação pública, clicar **Simular autorização Garmin**. A tela `/garmin/mock` identifica o simulador BalduCore e permite autorizar/recusar; não pede senha Garmin. State de uso único expira em dez minutos e é vinculado ao navegador/enrollment.
3. Autorizar e abrir/recarregar o perfil do aluno no coach. **Conectada · simulação** é independente do vínculo ativo; ainda não significa atividade recebida.
4. Abrir **Ferramentas de teste local**, selecionar cenário e **Simular evento de teste**. Recebimento fica na fila e o worker processa posteriormente; atualizar integração acompanha o estado e a contagem de atividades sintéticas. O painel atualiza periodicamente enquanto há processamento pendente.
5. Testar entrega repetida/atualização/versão antiga, erro temporário/permanente, dados inválidos, renovação de token e revogação. A duplicata usa entrega fixa, atividade usa externo fixo e revisão determinística para testar idempotência; não gera uma nova corrida real a cada clique.
6. Falha transitória retenta com backoff (até cinco tentativas, atraso inicial de um segundo). Falhas permanentes/exauridas ficam registradas para revisão; **Reprocessar falha** só funciona para o dono e recurso ainda elegível. Dados inválidos continuam inválidos após redrive.
7. Confirmar **Desconectar integração simulada** bloqueia coleta/publicação imediatamente e mantém vínculo esportivo ativo. Revogação fica pendente até o worker concluir; falha externa não reativa acesso. **Falha temporária na revogação** configura duas falhas de teste antes de desconectar. Encerramento pelo link público da 03 também desconecta, além de encerrar o vínculo.
8. Para reconectar após expirar a jornada inicial, coach de vínculo ativo gera **Link para conexão de teste**. Nova verificação por código demonstrativo é obrigatória; propósito Garmin preserva aceites anteriores e não permite reativar vínculo encerrado. Código aparece em **Atualizar convites**. Links anteriores são revogados; retirar acompanhamento continua usando capability de encerramento separada.

Configurações na sidebar mostra conta, integração oficial indisponível, mock/worker e conexões do próprio treinador. Perfil/lista refletem estados persistidos. A SPRINT 05 amplia o envelope mínimo da 04 com histórico, FIT de teste, métricas e séries disponíveis. Insights e IA permanecem futuros.

API (prefixo `/api` no Next):

| Método/caminho                                    | Autorização/finalidade                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| GET `/garmin`                                     | Coach: resumo limitado às próprias conexões (até 100).                 |
| GET `/athletes/:id/garmin`                        | Coach dono: estado, últimas 15 entregas, falhas e contagem autorizada. |
| POST `/athletes/:id/garmin/authorization-link`    | Coach dono + CSRF: convite de conexão de aluno ativo com aceites.      |
| POST `/athletes/:id/garmin/disconnect`            | Coach dono + CSRF: bloqueio imediato e revogação assíncrona.           |
| POST `/athletes/:id/garmin/events/:eventId/retry` | Coach dono + CSRF: redrive de falha elegível.                          |
| POST `/athletes/:id/garmin/mock`                  | Coach dono + CSRF, mock local: cenário estrito.                        |
| GET `/public/garmin`                              | Capability de jornada aceita/verificada, estado e CSRF próprios.       |
| POST `/public/garmin/start`                       | Capability + Origin/CSRF: tentativa vinculada ao aluno/navegador.      |
| POST `/public/garmin/mock/finish`                 | Capability + Origin/CSRF: state e decision approve/deny.               |
| POST `/integrations/garmin-mock/events`           | Entrega mock assinada; não é endpoint Garmin oficial.                  |

Contrato de entrega local documentado em [Garmin](docs/integrations/garmin.md). Header de timestamp, HMAC do corpo bruto, janela de cinco minutos e JSON de até 16 KiB; eventos resolvem conexão por conta conhecida, sem IDs de coach/aluno livres. ACK 202 só confirma inbox/job duráveis. Nenhum segredo de assinatura deve ir ao browser; as ferramentas do coach fazem a geração/validação no backend.

Credenciais/snapshots são AES-GCM com chave externa ao banco; jobs carregam só eventId. Refresh tem lease/versionamento, e publicação tem generation/runToken/leaseUntil. Disconnect/retirada cancelam publicação elegível; reentrega ou worker atrasado não restauram autorização. Payload de atividade é limpo após sucesso/cancelamento e material de revogação após sucesso. Falhas ficam cifradas para revisão; retenção/exclusão produtiva ainda não definida. Não rotacionar chaves ou namespace silenciosamente: jobs pendentes precisam da chave original e de um plano de migração. AUTH_SECRET efêmero continua independente das chaves Garmin.

Readiness HTTP verifica banco; heartbeat do worker tem validade de 15 segundos e aparece separado no perfil/Configurações. API pode receber com worker offline; nesse caso os jobs aguardam. Reiniciar o worker recupera execução expirada (prazo de 30 segundos) e intenção durável sem job. Esta entrega valida um worker operacional por namespace; a fila suporta claims concorrentes e testes exercitam fencing/recuperação, sem antecipar infraestrutura distribuída.

Limites: escritas do coach 30/minuto; mutações públicas por capability válida/IP 30/minuto; leitura pública de estado 120/minuto/IP; entregas mock 120/minuto/IP. O proxy local compartilha IP. A autenticação e as páginas públicas originais preservam controles separados; bootstrap de convite usa 30/minuto/IP e mutações posteriores usam limite por capability válida.

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

Migrations versionadas em `apps/api/prisma/migrations/` com Coach, sessões, tentativas OAuth, Athlete, vínculo, auditoria, buckets de limite e, na SPRINT 03, Invitation, EnrollmentSession, ConsentDocument, ConsentEvidence e WithdrawalAccess. SPRINT 04 acrescenta GarminConnection, GarminAuthorizationAttempt, IntegrationEvent, Activity mínima e WorkerHeartbeat; a 05 amplia Activity e acrescenta ActivitySample, ActivitySplit e FitImport. pg-boss mantém schema próprio. Constraints compostas impedem referências entre treinadores; auditoria mínima não guarda nomes, e-mails ou payloads.

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

Integração também valida convites, resgate/aceite/encerramento concorrentes, replay, expiração, revogação durante jornada, versões de documentos, destinatário e FKs de evidências. E2E demo cobre o fluxo público completo e convite revogado em desktop/tablet/mobile, com capturas dark/light. Integração valida criptografia, assinatura JWT, issuer/audience/nonce, PKCE, callback/replay/expiração, rate limit, CSRF, dois coaches, FKs, duplicidade e concorrência. E2E inicia entrypoint exclusivo com emissor OIDC local e JWTs assinados para cadastro/lista/perfil/logout, além de proteger rotas anônimas e preservar temas/responsividade. Não reutiliza servidores existentes para evitar testes contra processos errados; portas devem estar livres. Nenhuma variável ativa o emissor OIDC de teste no main. O modo local demo usa identidades próprias e não esse emissor. O servidor E2E recusa NODE_ENV=production. Resultados/screenshots ficam em test-results e são ignorados no Git. Dados sintéticos podem permanecer apenas no banco de testes.

## Estrutura e identidade visual

- apps/web: páginas públicas/protegidas, componentes, tokens e dashboard consolidado autorizado.
- apps/api: Nest modular Auth/Athletes/Invitations/Consents/Garmin/Activities/ActivityProcessing, worker, Prisma e testes.
- infra: Compose, inicialização do banco de testes e modelo de CI.
- docs: arquitetura, domínio, decisões, roadmap e oito PNGs originais.

Referências em docs/design/references são a fonte visual. Cor #EF3338, dark/light, sidebar e cards preservados; Arial/Helvetica e símbolo genérico permanecem provisórios. Novas telas seguem esses componentes. Apenas a preferência visual persiste no localStorage; nunca sessão ou dados dos alunos.

## Pendências externas

Docker indisponível no WSL usado durante a entrega: testes locais usaram PostgreSQL 17.7 temporário, sem alegar execução de Compose. Google real foi adiado; sua configuração não bloqueia os testes locais com login fictício. Sem deploy público nesta sprint.

CI pronto em `infra/github-actions-ci.yml`, ainda inativo: OAuth App do GitHub não possui escopo workflow para publicar em `.github/workflows/`. Com credencial autorizada, mover para esse destino via PR. Modelo atualizado com migrations do banco de testes; nenhum resultado de Actions é alegado.

Veja [ADR-002](docs/decisions/adr-002-auth-athletes.md), [ADR-003](docs/decisions/adr-003-invitations-consents.md), [ADR-004](docs/decisions/adr-004-garmin-processing.md) e [roadmap](docs/roadmap.md). SPRINTS 01–06 mescladas; SPRINT 07 adiada como DT-IA-01; ADR-007 permanece proposto, sem aprovação.

## Atividades e FIT de teste — SPRINT 05

1. Entrar como treinador demo, cadastrar aluno e concluir os aceites demonstrativos pelo convite. Vínculo ativo/aceites são obrigatórios, conexão Garmin é independente.
2. No perfil, em **Histórico esportivo**, selecionar FIT sintético, confirmar os dados de teste e **Importar FIT de teste**. Formato binário, até 5 MiB, uma sessão, no máximo 20 mil amostras/2 mil splits. Não enviar arquivo de pessoa real nesta fase.
3. O SDK oficial valida integridade/CRC e decodifica em thread com até 5 s/128 MiB. O bruto é descartado; só métricas permitidas entram no staging normalizado e na fila. GPS, nome de arquivo e identificadores de dispositivo não são persistidos. ACK não significa publicação concluída.
4. **Atualizar processamento** mostra fila, processamento, retry, conclusão/falha/cancelamento. Manter o worker ativo (`pnpm dev` já o inicia). Não exige mock Garmin; com GARMIN_PROVIDER=disabled e AUTH_MODE=demo, a fila FIT permanece disponível usando namespace estável.
5. **Consultar histórico** abre a lista filtrada pelo aluno; sidebar abre o histórico geral do treinador. Filtros por nome/modalidade/origem/período UTC e disponibilidade de séries. Detalhe oferece resumo, tempo de cronômetro/decorrido, splits e amostras paginados. Ausências são —; gráficos/eventos/IA ficam nas sprints seguintes.

Reenvio do mesmo hash/coach retorna a mesma importação. Mesmo arquivo em outro aluno do mesmo coach é rejeitado, sem reassociação. Falha terminal preserva metadados, limpa staging e não reabre o mesmo hash automaticamente. Outro coach é independente. Possível duplicata entre origens com mesmo início/modalidade gera aviso, sem mesclar dados. Encerramento bloqueia consulta/publicação e cancela staging; desconectar Garmin mantém importação manual independente. Prazo de retenção/exclusão produtiva ainda exige definição.

API documentada em /docs: GET /activities (q, athleteId, sport, source, from, to, status, page, limit), GET /activities/:id, /samples e /splits (page/limit), GET/POST /athletes/:id/fit-imports. Upload exige application/octet-stream, sessão/CSRF/Origin e X-Demo-File=true. Lista até 100, séries até 1000 por página; interface usa 20 e 100. Cadência em ciclos/min conforme FIT, sem dobrar automaticamente valores de corrida.

Validação de navegador: `pnpm test:e2e:activities` executa os três formatos em servidor próprio e serialmente, respeitando a quota de upload por coach. `pnpm test:e2e:demo` preserva as regressões de demo/convites/Garmin sem ultrapassar o limite real de login da conta compartilhada. Não desabilitar proteções para acelerar testes.

## Análise esportiva — SPRINT 06

Abrir **Análise Esportiva** na sidebar, **Análises do aluno** no perfil ou **Analisar atividade** no histórico/detalhe. Novas publicações FIT/mock enfileiram análise automaticamente; para atividades anteriores, usar **Solicitar análise**. GET não cria trabalho. **Atualizar análise** acompanha estado e revisão atual; processo é eventual, com worker do mesmo backend. Falhas transitórias retentam até cinco vezes; falha terminal permite nova solicitação explícita do treinador. Não há backfill global.

A tela contém seis métricas recebidas/derivadas, ritmo, FC, cadência e elevação disponíveis, comparação e eventos. Gráficos compartilham cursor/eixo; dois cliques selecionam o trecho A e controles numéricos oferecem alternativa acessível. Clique em split ou **Investigar splits** preenche os controles. Escolha dois intervalos e **Comparar trechos**; **Limpar seleção** remove contexto ativo. Distância na UI em km, tempo em segundos desde início e splits numerados a partir de um. A API usa metros e ordinais de split a partir de zero.

Nenhum limite de km é interpolado: resultados mostram fronteiras efetivamente observadas. Distância incompleta/regressiva desabilita esse eixo e mantém tempo. Ausência e velocidade zero não viram ritmo infinito, médias não viram séries e timer não é rotulado como tempo em movimento. Médias de sensores de trechos são aritméticas das amostras disponíveis, com contagem/lacunas; não são médias temporais. Splits completos agregam ritmo pela razão das somas de duração/distância na mesma base. Dados ausentes/bases divergentes tornam métricas parciais, sem preenchimento artificial.

Até 2000 pontos observados por série são enviados ao gráfico, preservando extremos em buckets e separações por lacuna; cálculos usam todos os dados. Intervalos >30 s, nulos e horários repetidos/regressivos quebram a curva. Marcadores representam início de splits com evento da página carregada; eixo de distância exige amostra no timestamp exato. A localização não prova o instante de uma mudança.

Regras v1 são demonstrativas e fixas: ritmo entre splits comparáveis ≥30 s/km e ≥15%; FC média ≥10 bpm; cadência ≥5 ciclos/min e ≥10%. Elegibilidade e evidências detalhadas no [ADR-006](docs/decisions/adr-006-sports-analysis.md). Sem interpretação de causa, diagnóstico ou sensação do aluno. AI Coach permanece adiado; o painel lateral atual é determinístico e oferece acesso ao feedback da SPRINT 08.

API em /docs: GET /activities/:id/analysis (axis, eventPage, splitPage); POST na mesma rota com objeto vazio; POST /activities/:id/analysis/compare com inputRevision, inputHash e dois segmentos (kind=time|distance|splits, from, to). Comparação de revisão divergente retorna 409; recursos sem autorização não são retornados. Eventos (50) e splits (100) paginados. Snapshots concluídos são imutáveis; não presumir reprocessamento de séries antigas substituídas. Retenção produtiva continua pendente.

`pnpm test:e2e:activities` valida FIT/histórico e análise nos três formatos, serialmente para respeitar a conta compartilhada. `pnpm test:e2e:analysis` executa somente os três cenários de análise. Recharts 3.11.0/react-is 19.3.1 fixados; SDK FIT permanece exclusivo da API. Docker/WSL e ativação do CI continuam pendências ambientais; testes locais usam PostgreSQL temporário.

## Feedback do treinador — SPRINT 08 mesclada

Com vínculo ativo e aceites válidos, abra uma atividade ou sua análise e clique em **Feedback do treinador**. Registre análise da execução, observações e decisões técnicas; adicione pontos com categoria, origem explícita (observação do treinador ou relato do aluno) e contexto. Intervalos usam metros ou segundos decorridos desde o início; quilômetros correspondem a metros (por exemplo, 1000–2000 m). Não há causa ou sensação preenchida automaticamente.

Avalie somente eventos determinísticos disponíveis; hipótese de IA permanece pendente. **Salvar diário** publica uma revisão. Histórico abre versões anteriores somente para leitura com autor, data e contexto. O perfil lista diários do aluno; /alunos/:id/feedback oferece paginação. Se outra sessão editar, o servidor retorna conflito e mantém seu texto local; use **Recarregar versão salva** para conferir o conteúdo persistido, confirmando o descarte das alterações locais. Rascunhos não são persistidos automaticamente e fechar a página sem salvar pode descartá-los.

Uma atividade/análise atualizada não reaproveita avaliações antigas como atuais. Confirme o novo contexto, revise os textos e adicione pontos atuais; as avaliações antigas permanecem na revisão histórica. Encerrar vínculo ou retirar aceites bloqueia consulta e edição de todos os diários desse acompanhamento. Não há portal do aluno ou envio de feedback.

API (sessão de treinador; PUT exige Origin/CSRF): GET/PUT /activities/:id/feedback; GET /activities/:id/feedback/revisions?page=1; GET /activities/:id/feedback/revisions/:version; GET /athletes/:id/feedback?page=1. GET do diário pagina eventos em até 50 por página; demais listas usam 20 itens. PUT exige expectedVersion, inputRevision/inputHash, analysisId opcional nulo, content e confirmContext quando aplicável. Schema e limites estão no Swagger local e [ADR-008](docs/decisions/adr-008-coach-feedback.md).

Aplicar migration com pnpm db:deploy e pnpm db:test:deploy para os respectivos bancos configurados. pnpm test:integration inclui os seis cenários de feedback. Executar E2E específico: pnpm exec playwright test --config playwright.activities.config.ts feedback.spec.ts (build prévio necessário). Nenhuma dependência ou segredo novo. Políticas produtivas de retenção/exclusão e homologação com dados reais continuam pendentes.

## Central de Monitoramento — SPRINT 09 mesclada

Abra **Central de Monitoramento** na sidebar (/monitoramento). A página mostra atividades disponíveis, análises concluídas, eventos esportivos agrupados, falhas terminais e **Sem feedback nesta revisão**. Um texto, ponto ou avaliação salvo no diário atual resolve essa última pendência; isso não valida todas as regras nem gera conclusão técnica automática. Limpar todo o diário pode reabrir a pendência. Nova revisão de atividade exige feedback no contexto atual após sua análise concluir.

Marcar lido/não lido é independente de resolver a pendência. Duplicatas e retries não multiplicam avisos; versão nova pode voltar a não lido. Clique em **Atualizar central** para consultar novamente; sem polling ou sincronização instantânea. Erro de atualização mantém a última consulta válida com aviso, sem apresentar zeros fictícios. Filtros e indicadores usam o mesmo escopo autorizado. O período padrão é de 30 dias UTC, com limite de 90 por consulta; from/to são datas inclusivas YYYY-MM-DD e o limite superior real é a meia-noite do dia seguinte. A ordenação usa atualização do item, não o início da atividade.

A busca de alunos mostra até 20 resultados autorizados por nome; refine a busca para encontrar outros. Os destinos também exigem autorização própria. Dados sintéticos continuam identificados; IA e integração Garmin oficial não aparecem como concluídas. Dados anteriores à migration podem exigir conciliação explícita; ausência na central não significa ausência no histórico esportivo.

API: GET /monitoring (type, athleteId, from, to, read, state, page), GET /monitoring/athletes (q, selected) e PATCH /monitoring/:id/read com { expectedVersion, read }. Sessão do coach em todas; PATCH exige Origin/CSRF. Não enviar coachId pelo cliente. Fonte retirada/inacessível bloqueia listagem/contagens e retorna 404 na marcação; versão antiga retorna 409. GET não cria alertas ou marcas de leitura.

Aplicar a migration com pnpm db:deploy e pnpm db:test:deploy. Para fontes já existentes, executar no ambiente/banco correto:

```sh
pnpm --filter @balducore/api maintenance reconcile-monitoring --coach UUID_DO_COACH --type activity --limit 1000
```

Tipos: activity, analysis, fit, integration ou connection; limite 1..10000 fontes por execução, lotes de até 100. Se nextCursor não for nulo, retomar com --cursor UUID_RETORNADO; uma consulta final vazia pode ser necessária. Resultado scanned/projected conta fontes visitadas/elegíveis, não novos alertas. Repetir é idempotente; não usar timestamp de reconstrução como instante original de falha. Logs/CLI não imprimem payload, nomes ou credenciais.

Testes: pnpm test, pnpm test:integration e pnpm test:e2e:monitoring (build prévio para E2E). A suíte tem servidor próprio para respeitar os limites de login demo, além das suítes base/demo/atividades existentes. Template CI foi atualizado, mas continua inativo até liberar escopo workflow. Decisões em [ADR-009](docs/decisions/adr-009-monitoring.md). Sem serviço externo ou dependência nova; retenção/exclusão produtiva continuam pendentes.

## Dashboard consolidado — SPRINT 10 mesclada

`GET /dashboard?period=30` aceita 7, 30 ou 90 dias UTC inclusivos até hoje e modalidade opcional (`sport`). A API exige sessão, aplica rate limit e devolve um snapshot de leitura Repeatable Read, sem novas tabelas, migrations ou dependências. A composição dark/light preserva as referências; as fixtures fixas foram removidas.

Alunos e conexões são uma fotografia atual. Atividades e volumes usam início da atividade; pendências operacionais usam atualização e não recebem filtro de modalidade. Prévia de cinco atividades/eventos, seis alunos e três pendências não limita os totais. Links preservam os filtros realmente suportados pelo destino.

Volume separa modalidade e proveniência, mostrando valores conhecidos/ausentes: zero conhecido permanece zero e ausência permanece indisponível. Atenção conta atividades distintas com eventos da análise determinística atual; snapshots inválidos deixam esse bloco indisponível, mantendo os indicadores básicos. São validados todos os snapshots atuais em lotes de 100.

Dados esportivos e estado Garmin exigem vínculo ativo e aceites vigentes. Retirada remove o acesso na próxima consulta; cadastro básico continua disponível conforme a gestão de alunos. FIT não comprova conexão Garmin. Conexão é estado local, mock é simulação e integração oficial permanece indisponível. IA continua DT-IA-01 e planejamento continua MVP 2.

Atualização é manual. Falha inicial mostra indisponibilidade; falha ao atualizar preserva o snapshot anterior com aviso e horário. Não há polling, escrita de negócio em GET ou preenchimento com dados fictícios. `pnpm test:e2e:dashboard` exercita dados persistidos, filtros/navegação, erro, isolamento e retirada em desktop/tablet/mobile.

## Qualidade e piloto local — SPRINT 11

[Runbook, checklist e evidências](docs/operations/pilot.md): operação de API/banco/fila/worker, revisão de segurança/UX, métricas delimitadas e bloqueios externos. Piloto permanece local e sintético; IA DT-IA-01 e integrações reais continuam pendentes.

`pnpm db:recovery:drill` exige RECOVERY_ADMIN_URL explícita para postgres em loopback, fora de produção, e pg_dump/pg_restore compatíveis no PATH. Cria somente seus bancos temporários, aplica migrations, gera dados sintéticos, restaura e verifica conteúdo/chave/fila; remove os recursos próprios. Não usa o banco operacional como origem nem aceita destino de restauração fornecido. Não imprimir URLs/segredos ou publicar dumps/traces. Consultar o runbook antes de executar.

Ativação de CI aprovada, porém a publicação do workflow foi recusada por escopo workflow ausente na credencial GitHub. Template atualizado em infra/github-actions-ci.yml; mover para .github/workflows/ci.yml com credencial autorizada por PR. Nenhum resultado de Actions alegado. Não há dependência ou migration nova nesta sprint.
