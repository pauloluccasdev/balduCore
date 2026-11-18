# Arquitetura inicial

Status: arquitetura-base aprovada; SPRINT 01 mesclada e SPRINT 02 implementada em revisão. Atualização: 2026-11-15. Decisão de stack: [ADR-001](../decisions/adr-001-stack.md).

## Diagnóstico

Na SPRINT 00, o repositório tinha somente documentação e oito PNGs; o PR #1 foi mesclado em main. Na SPRINT 01, a branch `sprint/01-fundacao` adicionou aplicações web/API, configuração Prisma, Compose, testes, README e modelo de CI. Não existem autenticação, tabelas de negócio ou integração externa implementadas. O CI ainda não está ativo: a credencial de publicação não permite criar workflows.

As oito referências em `docs/design/references/` foram relidas nos dois temas: composição, sidebar, cards, gráficos e validação separada de eventos/hipóteses estão registrados no [inventário visual](../product/mvp-01.md). A cor principal é `#EF3338`, conforme contexto mestre.

## Topologia

```mermaid
flowchart LR
  C[Treinador] --> W[Next.js]
  A[Aluno via convite] --> W
  W --> N[NestJS REST / mesma origem]
  O[OIDC] --> N
  G[Garmin oficial] --> N
  N --> P[(PostgreSQL)]
  P --> J[Worker / mesmo backend modular]
  J --> P
  J --> I[Provider IA]
  J --> G
```

Chamadas externas nunca ficam dentro de transações longas. UI não decide autorização. API verifica a sessão, ownership e vínculo em toda leitura/mutação, inclusive exportações, gráficos, IA, monitoramento e seleção de segmentos.

## Estrutura proposta — não criada nesta etapa

```text
apps/
  web/src/
    app/(coach)/
    app/(public)/convite/
    components/
    features/
    lib/
  api/
    src/
      main.ts
      worker.ts
      modules/
        auth/ coaches/ athletes/ invitations/ consents/
        garmin-connections/ activities/ activity-processing/
        sports-analysis/ insights/ ai/ coach-feedback/ monitoring/
      infrastructure/  # banco, fila, auditoria, secrets, logs
    prisma/
      schema.prisma
      migrations/
      seed.ts
    test/
packages/
  api-client/          # gerado de OpenAPI, quando houver API
infra/
  compose.yaml
  env.example
docs/
```

Não criar pastas vazias, pacote de domínio compartilhado com browser ou camadas abstratas sem uso. Organização interna dos módulos cresce conforme casos de uso; infraestrutura implementa portas do domínio. Configuração raiz adicionada na fundação; o modelo de CI aguarda ativação.

## Limites dos módulos

| Módulo             | Responsabilidade e relações                                                         |
| ------------------ | ----------------------------------------------------------------------------------- |
| Auth               | OIDC, sessões e principal; não resolve consentimento esportivo.                     |
| Coaches            | Perfil do treinador e configuração de conta.                                        |
| Athletes           | Cadastro do aluno e vínculo com coach; fonte da autorização do acompanhamento.      |
| Invitations        | Emissão, revogação, expiração e resgate; coordena Athletes e Consents atomicamente. |
| Consents           | Versões de termos, finalidades, aceite e retirada; não representa OAuth Garmin.     |
| GarminConnections  | Credenciais, autorização, estado de sincronização e adapter oficial/mock.           |
| Activities         | Atividade normalizada, amostras, splits e consultas autorizadas.                    |
| ActivityProcessing | Inbox, fila, normalização, retry, deduplicação e orquestração do pipeline.          |
| SportsAnalysis     | Métricas derivadas e eventos determinísticos versionados.                           |
| Insights           | Interpretações com evidências e estados de revisão; sem cálculo básico por LLM.     |
| AI                 | Contexto autorizado, prompts, limites, provider e validação das respostas.          |
| CoachFeedback      | Observações e decisões autorais, revisão de insights e histórico.                   |
| Monitoring         | Projeção de eventos e pendências por coach; não duplica estado de origem.           |

Módulos chamam serviços públicos internos; não chamam controllers de outros módulos nem acessam arbitrariamente tabelas alheias. REST é transporte externo; worker reutiliza casos de uso. Eventos internos duráveis são registros transacionais, não um barramento distribuído. Auditoria é infraestrutura transversal.

## Isolamento e segurança

Proposta MVP: cadastro Athlete pertencente a um coach, sem fusão global por e-mail; vínculo continua entidade separada. Multi-coach para a mesma identidade real depende de decisão futura. Todas as tabelas de acompanhamento carregam coachId; chaves estrangeiras compostas impedem referenciar aluno/atividade de outro tenant. Consultas exigem coachId obtido da sessão, nunca confiado ao corpo da requisição. Jobs carregam tenant e revalidam consentimento/vínculo. Identificadores aleatórios não substituem autorização. RLS é defesa adicional a avaliar após definir conexão/pooling; não é pressuposta como implementada.

Sessões revogáveis, rate limit compartilhado por instância, DTOs validados, limites de payload e allowlists de filtros. Convites/callbacks sem cache público; dados autenticados não entram em cache compartilhado. Referrer-Policy e redação de logs protegem tokens. TLS, criptografia autenticada dos tokens Garmin com chave externa ao banco e rotação, acesso mínimo e backups protegidos. Auditoria registra ator, ação, alvo, tenant, horário e correlação, sem payload sensível ou segredo.

Revogar acompanhamento bloqueia imediatamente leitura e novos jobs; desconectar Garmin bloqueia coleta e inicia revogação externa. Exclusão é fluxo controlado incluindo derivados, IA e backups conforme retenção aprovada; registrar tombstone mínimo para impedir replay de eventos após exclusão. Não prometer exclusão instantânea de backups.

## Operação e testes

Logs JSON com correlationId, jobId e códigos de erro, sem nomes, e-mails ou séries detalhadas. Medir idade de fila, latência, falhas, duplicatas e última ingestão; nunca rotular métricas operacionais com dados pessoais. Health/readiness diferenciam banco, worker e providers. Secrets somente via ambiente/secret manager; exemplo contém nomes e placeholders.

Testes unitários para regras; integração com PostgreSQL real para constraints, concorrência e transações; E2E para coach A/B, convite, callback, revogação e replay. Seeds opcionais, determinísticos e sintéticos, proibidos por padrão em produção. OpenAPI, lint, Prettier, tipos, build e checks em CI. Na SPRINT 00 não havia testes executáveis; os testes da fundação estão descritos abaixo.

## Proteção de dados

Tratar métricas de saúde como potencialmente sensíveis. Validar base legal por finalidade, papéis de controlador/operador, direitos do titular, transferência internacional, contratos e prazos com assessoria jurídica. Consentimento de acompanhamento e permissão Garmin são independentes; aceitar política não substitui definir base legal. Não enviar identidade ou rotas GPS à IA por padrão. Retenção de raw, normalizados, auditoria e backups precisa de tabela aprovada antes de produção.

Fonte jurídica primária: [LGPD, texto atualizado na Câmara](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html). As medidas acima são propostas técnicas, não conclusão de conformidade.

## Plano da SPRINT 01 — aprovado; entrega em revisão

1. Fixar runtime/pacotes estáveis compatíveis, pnpm workspace e scripts de desenvolvimento, build, lint, formatação e tipos.
2. Criar Next.js e NestJS mínimos, configuração validada, logs JSON sem secrets, health de processo e readiness com consulta real ao PostgreSQL via Prisma.
3. Compose inicialmente para banco; frontend/backend executados no host com pnpm, reduzindo custo de rebuild local. Containers de aplicação ficam como alternativa se paridade de ambiente for prioritária. Aprovar essa escolha antes da implementação.
4. Prisma configurado e estratégia de migrations versionadas, sem transformar todas as entidades conceituais em tabelas na fundação. Criar migration somente para persistência realmente necessária; não criar tabela artificial para justificar uma migration.
5. Design system inicial em componentes de `apps/web`, tokens CSS semânticos e Tailwind, cor `#EF3338`, sidebar responsiva e dark/light com preferência persistida. Sem pacote de UI independente por enquanto: menos manutenção, extraível se houver segundo consumidor.
6. Dashboard com fixtures determinísticas explicitamente sintéticas e aviso de demonstração. Nenhuma sessão falsa, conexão real simulada ou API de negócio pública. Itens de futuras sprints claramente indisponíveis/em desenvolvimento. Manter BalduTraining na marca visual e BalduCore na identificação técnica.
7. README, teste de health/readiness com banco real e indisponível, teste em browser de temas/sidebar e screenshots em desktop/tablet/mobile; builds, tipos, lint e formatação como gate.

Critério: frontend, API e banco executáveis localmente, dashboard demonstrativo coerente com referências, navegação acessível e adaptação responsiva. Não incluir autenticação, cadastro, convites, Garmin, upload FIT, IA ou worker funcional nesta sprint.

A fonte tipográfica exata e o asset original do logotipo não estão no ZIP. A alternativa provisória foi aprovada: Arial/Helvetica e marca textual com símbolo genérico, sem apresentar a escolha como fonte ou logotipo originais. Substituir pelos assets fornecidos futuramente.

## Estado implementado da fundação

`apps/web` contém apenas dashboard demonstrativo e componentes necessários; `apps/api` contém módulo Nest com health e acesso Prisma para readiness. A árvore acima é direção evolutiva, não obrigação de criar módulos vazios: Auth/Alunos entram na 02 e worker/fila na 04. Componentes e tokens permanecem locais ao web. Recharts não foi instalado por não existir gráfico na fundação.

API usa Node ESM, TypeScript com decorators/metadata e imports relativos `.js` compilados; Prisma Client gerado via provider `prisma-client`, adapter-pg e pool limitado com timeouts. Liveness não consulta banco; readiness consulta PostgreSQL e retorna 503 sanitizado em falha. Fechamento do app libera o pool via lifecycle hook. Sem tabelas/migrations de domínio nesta etapa.

Next reescreve `/api/*` para backend em loopback. O teste E2E verifica essa fronteira até PostgreSQL real. Dashboard deliberadamente independe dessa API enquanto os dados forem fixtures. Tema persiste somente preferência visual; nenhum token de autenticação existe no frontend. Navegação futura é texto identificado como indisponível, sem endpoints ou páginas decorativas.

O modelo em `infra/github-actions-ci.yml` prevê instalação congelada, formatação, lint, tipos, testes unitários/HTTP/integração, builds e Playwright com PostgreSQL; não está ativo porque a credencial OAuth recusou a criação de workflows. Estado e limitações de execução local estão no [roadmap](../roadmap.md).

## Evolução na SPRINT 02

AuthModule valida Google OIDC e mantém sessão local no Nest; AthletesModule verifica principal e propriedade em cada recurso. Next usa apenas API com cache no-store e cookies repassados no servidor; não acessa Prisma. As páginas /, /alunos e /alunos/:id são dinâmicas e protegidas; /login é pública. Emissor assinado local só é construído pelos entrypoints de teste; sem toggle de mock no main.

Persistência inicial definida pela necessidade: Coach, CoachSession, AuthAttempt, Athlete, CoachAthleteRelationship, AuditLog e RateLimitBucket. TEST_DATABASE_URL é separado do banco de uso. Material PKCE/nonce em tentativas é cifrado; tokens Google não são persistidos. Ver [ADR-002](../decisions/adr-002-auth-athletes.md), README e resultado no roadmap. Partes anteriores deste documento descrevem a sequência da fundação, não ausência atual de autenticação.

## Modo demonstrativo local autorizado em 2026-11-18

AUTH_MODE=demo registra entrada local com identidades fixas e issuer próprio. Reutiliza AuthService para emitir sessões e controlar acesso, sem criar fluxo Google fictício no ambiente normal. Configuração produtiva ou origem/bind públicos são rejeitados; sessões só são aceitas no modo correspondente ao issuer. Web identifica demonstração na entrada e em todas as páginas protegidas; API marca sessão/alunos sintéticos. Google/OIDC permanece preparado e sua ativação foi adiada para etapa futura.
