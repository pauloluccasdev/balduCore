# Arquitetura inicial

Status: arquitetura-base aprovada; SPRINTS 00–06 mescladas e SPRINT 07 adiada como débito técnico DT-IA-01. Atualização: 2026-11-19. Decisões: [ADR-001](../decisions/adr-001-stack.md) e [ADR-004](../decisions/adr-004-garmin-processing.md).

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

## Evolução na SPRINT 03

InvitationsModule expõe emissão/revogação ao coach dono e uma jornada pública independente. ConsentsService mantém documentos demonstrativos imutáveis e evidências de aceite/retirada. InvitationsService coordena transações de vínculo e consentimentos, usando lock do relacionamento compartilhado com edição do cadastro. Não há provider de e-mail, fila ou integração Garmin antecipados. Controllers demo ausentes no modo Google/produção; restrição local é validada no startup.

Next renderiza `/convite` e `/encerrar` sem layout protegido/sidebar, usando o design system existente, dark/light e estados de confirmação/erro. Links carregam segredo no fragmento, removido no browser antes de resgate explícito. Cookies públicos HttpOnly e CSRF por capability não concedem principal de treinador. Página do perfil obtém cadastro/convites em paralelo via API autenticada, sem Prisma no frontend. Ver [ADR-003](../decisions/adr-003-invitations-consents.md) e README para limites demonstrativos e recuperação.

## Evolução na SPRINT 04

GarminModule concentra conexão, autorização e consultas restritas. ActivityProvider isola DTOs internos do mock; nenhum modelo/protocolo oficial é presumido. IntegrationQueue usa pg-boss 12.38.2/fromPrisma no mesmo PostgreSQL: inbox e job são criados na transação, sem Redis/outbox separado. Worker dedicado executa normalização mínima fora do ciclo HTTP, usando os mesmos casos de uso. SQL e rotas não são gerados por IA. API e worker usam chaves/namespace estáveis, pools separados e encerramento ordenado.

GarminConnection guarda somente credenciais cifradas e hash de conta; attempts têm state/hash de navegador, escopo e geração. Refresh usa lease/versionamento, sem manter lock/transação durante chamada ao provider. IntegrationEvent guarda payload cifrado e estado operacional; pg-boss cuida de reivindicação/expiração/retries. Cada execução tem runToken/leaseUntil; resultado expirado exige retry e resultado antigo não altera uma execução nova. Publicação normalizada revalida geração/vínculo/aceites, usa unicidade/revisão e transação. Consumidor pode repetir após crash: não há promessa exactly-once.

Disconnect transacional limpa credenciais ativas, incrementa geração, invalida tentativas e cancela publicação de atividades; revogação externa usa intenção cifrada própria e retentativas. A retirada pública da 03 chama esse mesmo caso de uso. Mesmo com mock desabilitado, a retirada mantém intenção durável; worker recupera intenções sem job ao ser habilitado. Autorização cancelada durante callback revoga o resultado do provider; falha na compensação gera intenção persistida.

Configurações e perfil mostram processamento e mock; páginas públicas continuam sem sessão de coach. Convite de finalidade Garmin permite reconexão de aluno ativo com nova verificação demo e sem novos consentimentos. Leitura de atividades exige vínculo ativo; a SPRINT 04 expõe só contagem e estados de recebimento, não implementa a experiência de histórico da 05. Biblioteca gerencia seu schema apenas no ambiente mock local; deploy produtivo da fila e contrato oficial aguardam definição.

## Incremento da SPRINT 05 — em revisão

Decisões aprovadas no [ADR-005](../decisions/adr-005-activities-fit.md): métricas resumidas em Activity, amostras/splits relacionais com FK composta e publicação de revisão atômica; conexão opcional para origem manual_fit e vínculo direto obrigatório. FitImport registra hash por coach, staging normalizado temporário, estado/tentativas/fencing e atividade resultante. Consulta e publicação exigem vínculo ativo e aceites vigentes, com isolamento por treinador.

FIT usa SDK oficial em thread limitada, somente demo local/arquivos sintéticos; bruto, GPS e identificadores externos são descartados. Fila existente atende mock e FIT independentemente de autorização Garmin; encerramento cancela importações pendentes, desconexão Garmin não cancela importação manual. Dados ausentes não são estimados. Histórico/detalhes paginados não incluem gráficos, análise determinística de eventos ou IA das próximas sprints. Integração oficial e uso produtivo continuam dependências externas e de revisão.

## Incremento da SPRINT 06 — em revisão

[ADR-006](../decisions/adr-006-sports-analysis.md) aprovado: SportsAnalysis persistido com FK composta, revisão/hash/algoritmo, estado e snapshot validado de métricas/eventos/evidências. Worker/fila existentes fazem processamento após publicação, sem cálculo de métricas por IA. Consultas autorizadas e comparação reaplicam vínculo/aceites; revisão obsoleta e retirada impedem resultado tardio. Gráficos sincronizados usam somente séries recebidas, com redução visual que preserva extremos/lacunas; cálculos usam resolução integral. Seleções não interpolam fronteiras e distinguem cronômetro/decorrido. Regras são heurísticas demonstrativas, sem causa ou diagnóstico. IA, feedback e MVP 2 permanecem fora desta implementação.

## Incremento da SPRINT 08 — aprovado e mesclado

[ADR-008](../decisions/adr-008-coach-feedback.md) aprovado. CoachFeedback representa um diário por atividade; CoachFeedbackRevision mantém snapshots JSONB validados e revisões imutáveis pela API, com autor derivado da sessão, revisão/hash da atividade e análise opcional. FKs compostas impedem associação a outro coach/aluno/atividade; transação com lock do vínculo, elegibilidade, controle otimista, revisão e auditoria evita sobrescrita concorrente e publicação parcial. Contexto antigo fica explícito e não reaplica avaliações silenciosamente. Leitura, histórico e edição exigem vínculo ativo/aceites vigentes; dados continuam demonstrativos.

Tela contextual preserva dark/light, sidebar e cards das referências; resumo real, textos opcionais, pontos com origem explícita e intervalos validados, avaliações dos eventos determinísticos disponíveis e histórico somente leitura. Perfil agrega diários por atividade. Não há nota independente de atividade ou validação de hipótese gerada por IA (DT-IA-01), prescrição, notificações ou envio ao aluno. Exclusão/retencão produtiva permanecem pendentes; histórico não é armazenamento eterno obrigatório. Detalhes de execução e testes no README/roadmap.

## Incremento da SPRINT 09 — aprovado e mesclado

[ADR-009](../decisions/adr-009-monitoring.md) aprovado. MonitoringEvent é projeção persistida com destinatário coach, vínculo e referências tipadas por FKs compostas. Produtores projetam publicação/conclusão/falha/recuperação/feedback na mesma transação; chave estável, assinatura e versão impedem duplicatas e preservam leitura/ordenação quando não há mudança. Consulta SQL parametrizada revalida fonte, contexto, vínculo e consentimentos, com contadores/lista no mesmo escopo. Leitura exige versão atual e não resolve pendência por si.

Central funcional na sidebar, filtros e paginação, atualização manual, contextos obsoletos identificados e eventos agrupados. Ausência de feedback significativo atual gera pendência após análise concluída; salvar resolve, limpar ou mudar revisão pode reabrir. CLI explícita e limitada concilia fontes antigas, sem escrita em GET ou varredura global. Sem dados de IA, envio externo ou dashboard consolidado. Detalhes de operação/testes/limitações no README e roadmap; aceite final pendente.

## SPRINT 10 — dashboard consolidado mesclado

[ADR-010](../decisions/adr-010-dashboard.md) aprovado; implementação aprovada e mesclada no PR #12. Read model calculado de cadastros, vínculos/aceites, conexões, atividades/análises e monitoramento existentes. GET /dashboard usa snapshot Repeatable Read, autorização por recurso, totais completos e prévias limitadas; não cria tabelas, migrations ou contadores persistentes.

Alunos/conexões são atuais, esportes usam início UTC e pendências usam atualização sem modalidade. Volume mantém null/zero, cobertura e proveniência. Atenção exige análise da revisão/hash/algoritmo atuais; conteúdo inválido torna o indicador derivado indisponível. Retirada remove acesso esportivo e conexão, preservando a gestão cadastral autorizada. UI deixa explícitos dados sintéticos, Garmin oficial indisponível, IA adiada e planejamento MVP 2. Detalhes de operação e validação no README/roadmap; SPRINT 11 não iniciada.

## Preparação da SPRINT 11

SPRINT 10 aprovada e mesclada; plano de qualidade no [ADR-011](../decisions/adr-011-pilot-readiness.md). A proposta mantém a arquitetura existente e recomenda piloto técnico local com dados sintéticos. Revisões de autorização/UX/operação, ensaio isolado de recuperação e ativação de CI serão delimitados após aprovação. Google real, Garmin oficial, políticas produtivas e IA DT-IA-01 permanecem pendentes; preparação técnica não equivale a autorização para dados reais/deploy ou entrega integral do MVP 1.

## SPRINT 11 — qualidade em revisão

ADR-011 aprovado para piloto técnico local sintético. Ensaio isolado de migrations/backup/restore, verificação de conteúdo cifrado/fila, medições delimitadas, sanitização de erros e melhorias de foco/tabelas estão implementados em revisão no PR #13. Ver [operação e evidências](../operations/pilot.md). Arquitetura/contratos de domínio preservados, sem fornecedor/dependência/migration nova. CI autorizado tem publicação bloqueada pelo escopo da credencial; template preparado não é CI executado. Nenhum deploy ou uso real autorizado; IA DT-IA-01 e políticas/integrações reais continuam pendentes.
