# ADR-001 — Stack e topologia inicial

Status: proposto, não implementado. Data: 2026-11-11.

## Problema
Conciliar interface analítica, integrações externas, autorização por treinador e tarefas demoradas, sem antecipar microsserviços ou infraestrutura excessiva.

## Decisão proposta
Monorepo com pnpm workspaces; Next.js App Router, React, TypeScript, Tailwind e Recharts no frontend; NestJS REST, Prisma e PostgreSQL no backend. Um backend modular, banco único e um worker executando o mesmo código de domínio. Docker Compose local para PostgreSQL e processos de aplicação. Fixar versões estáveis compatíveis, runtime Node LTS e lockfile na fundação após verificação das documentações; este discovery não seleciona números de versão.

Next.js renderiza e organiza a experiência; NestJS concentra regras, autorização, transações e integração. Frontend não importa Prisma nem acessa banco. API e frontend sob uma origem por proxy em produção; desenvolvimento usa proxy equivalente. OpenAPI gera contratos cliente, sem compartilhar entidades persistidas.

## Alternativas e trade-offs
| Escolha | Benefício | Custo e alternativa |
| --- | --- | --- |
| Next + Nest | Limites explícitos, API testável e worker independente do ciclo HTTP | Dois builds/processos, contratos e tracing; Next apenas reduziria operação inicial, mas reuniria UI e domínio de integração. |
| PostgreSQL + Prisma | Integridade relacional, migrations e transações | Agregações analíticas e locks podem exigir SQL parametrizado; índices e plano de consultas precisam de medição. |
| Fila PostgreSQL | Reutiliza persistência existente, sem Redis inicial | Disputa de recursos com OLTP; avaliar biblioteca mantida com transações, leases e retry antes de escolher. BullMQ/Redis apenas se volume ou requisitos justificarem. |
| Worker do mesmo backend | Reinício e escala de tarefas separados sem novo serviço de domínio | Mais um processo a operar; não é microsserviço nem implantação com banco independente. |
| Recharts | Integração React e gráficos interativos | Séries longas exigem redução de pontos apenas para visualização; cálculos usam dados completos e qualidade explícita. |

## Autenticação
Recomendar OIDC para o treinador, usando biblioteca mantida e sessão opaca revogável no servidor. NestJS é autoridade da sessão; cookie HttpOnly, Secure em produção e SameSite apropriado, proteção CSRF nas mutações e validação de origem. Não armazenar tokens no localStorage. Mapear emissor + subject ao Coach; aluno não é principal autenticado do dashboard.

Fornecedor OIDC, custos e configuração de desenvolvimento precisam ser aprovados. OIDC reduz manutenção de senhas/recuperação, mas cria dependência externa. Autenticação local exigiria hashing, recuperação, verificação e defesa contra abuso adicionais. Não implementar autenticação artesanal nem contornar autorização para demonstração.

## Consequências e aceite
Um banco e um repositório, sem barramento externo, Redis, Kubernetes, event sourcing ou microserviços. OIDC, Garmin e IA substituíveis por adapters. Queue e provider de IA só serão selecionados na etapa correspondente. Cada nova dependência deve resolver necessidade aprovada.

Fundação aceita quando instalação, Compose, migration de banco vazio, lint, formatação, tipos, testes e build forem reproduzíveis, sem secrets versionados. Migrações de produção têm execução única controlada e backup/restauração verificados.

## Fontes consultadas
- [Next.js: Backend for Frontend](https://nextjs.org/docs/app/guides/backend-for-frontend): capacidade de endpoints e necessidade de autenticação explícita. A separação proposta é uma decisão deste projeto.
- [Prisma: transações](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions): atomicidade e idempotência; a documentação deve corresponder à versão fixada na implementação.
