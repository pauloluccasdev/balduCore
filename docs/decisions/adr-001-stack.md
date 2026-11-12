# ADR-001 — Stack e topologia inicial

Status: proposto, não implementado. Data: 2026-11-11.

## Problema
Conciliar interface analítica, integrações externas, autorização por treinador e tarefas demoradas, sem antecipar microsserviços ou infraestrutura excessiva.

## Decisão proposta
Monorepo com pnpm workspaces; Next.js App Router, React, TypeScript, Tailwind e Recharts no frontend; NestJS REST, Prisma e PostgreSQL no backend. Um backend modular, banco único e um worker executando o mesmo código de domínio. Docker Compose local para PostgreSQL e processos de aplicação. Fixar versões estáveis compatíveis, runtime Node LTS e lockfile na fundação após verificação das documentações; a matriz abaixo registra candidatos verificados, sem instalar dependências ou afirmar compatibilidade executada.

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
Recomendar OIDC para o treinador, usando biblioteca mantida e sessão opaca revogável no servidor. NestJS é autoridade da sessão; cookie HttpOnly, Secure em produção e SameSite apropriado, proteção CSRF nas mutações e validação de origem. Não armazenar tokens no localStorage. Mapear emissor + subject ao Coach inicialmente; tabela User separada somente se surgir necessidade real; aluno não é principal autenticado do dashboard.

Fornecedor OIDC, custos e configuração de desenvolvimento precisam ser aprovados. OIDC reduz manutenção de senhas/recuperação, mas cria dependência externa. Autenticação local exigiria hashing, recuperação, verificação e defesa contra abuso adicionais. Não implementar autenticação artesanal nem contornar autorização para demonstração.

## Consequências e aceite
Um banco e um repositório, sem barramento externo, Redis, Kubernetes, event sourcing ou microserviços. OIDC, Garmin e IA substituíveis por adapters. Queue e provider de IA só serão selecionados na etapa correspondente. Cada nova dependência deve resolver necessidade aprovada.

Fundação aceita quando instalação, Compose, migration de banco vazio, lint, formatação, tipos, testes e build forem reproduzíveis, sem secrets versionados. Migrações de produção têm execução única controlada e backup/restauração verificados.

## Fontes consultadas
- [Next.js: Backend for Frontend](https://nextjs.org/docs/app/guides/backend-for-frontend): capacidade de endpoints e necessidade de autenticação explícita. A separação proposta é uma decisão deste projeto.
- [Prisma: transações](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions): atomicidade e idempotência; a documentação deve corresponder à versão fixada na implementação.

## Matriz de compatibilidade — consulta em 2026-11-11
Consulta direta ao registro npm (`engines`, `peerDependencies` e versões publicadas). Candidatos para revisão na SPRINT 01, não um lockfile nem teste de instalação:

| Componente | Candidato observado | Compatibilidade e cuidado |
| --- | --- | --- |
| Node.js | Linha 24 LTS, patch suportado a fixar | Atende engines consultados; verificar patch ativo ao instalar. |
| pnpm | 12.18.0 | Registro declara Node >=18; fixar packageManager. |
| Next.js | 16.4.6 | Node >=20.9; React 19 aceito nos peers. |
| React / React DOM | 19.3.1 / 19.3.1 | Manter par alinhado; DOM exige React ^19.3.1. |
| TypeScript | 7.0.2 disponível | Não adotar automaticamente: Nest documenta configuração com TS 6; verificar compilador/decorators, lint e Prisma. Preferir linha estável comum comprovada pelo build, mesmo abaixo da latest. |
| Nest core / common | 12.4.2 / 12.4.2 | Node >=20; mesma major de adapter HTTP, rxjs ^7.1 e reflect-metadata compatível. Nest 12 usa ESM; propor API ESM com configuração validada, sem forçar CommonJS antigo. |
| Prisma CLI / client | 7.10.1 / 7.10.1 estáveis | Engines aceitam Node 24. A tag latest do CLI retornou 8.0.0-rc.33, enquanto client retornou 7.10.1: não combinar latest nem usar RC inadvertidamente. Configuração/driver da linha 7 precisa ser seguida explicitamente. |
| Tailwind | 4.3.5 | Usar integração Next/PostCSS da mesma linha; verificar navegadores-alvo antes da UI. |
| Recharts | 3.10.1 | React 19 aceito; declarar react-is compatível e isolar gráficos em client components. |
| PostgreSQL | Linha 17 proposta | Linha conservadora para desenvolvimento; validar suporte do Prisma escolhido e imagem oficial/patch na SPRINT 01, sem exigir a major mais recente. |

A avaliação confirma interseção declarada de requisitos centrais, não execução conjunta de todos os pacotes. Major de TypeScript, patch do Node/PostgreSQL e dependências de ferramentas ficam sujeitos ao gate de instalação sem conflitos, Prisma generate, typecheck e build de ambas as aplicações. Se demandarem mudança relevante da proposta, apresentar alternativa antes de prosseguir.

Fontes primárias adicionais: [metadados npm do Next](https://registry.npmjs.org/next/latest), [Nest](https://registry.npmjs.org/@nestjs/core/latest), [Prisma CLI](https://registry.npmjs.org/prisma), [Prisma client](https://registry.npmjs.org/@prisma/client), [migração Nest](https://docs.nestjs.com/migration-guide), [requisitos Prisma](https://docs.prisma.io/docs/orm/reference/system-requirements). Documentação online pode já descrever outra major; usar documentação versionada da major fixada.

## Decisões solicitadas
- Aprovar monorepo Next/Nest, backend modular, REST, PostgreSQL/Prisma e banco único, aceitando dois processos de aplicação.
- Aprovar candidatos estáveis com Node 24, API ESM e versões exatas consolidadas por instalação/build, sem RC nem migração automática para major nova.
- Aprovar banco em Compose e apps via pnpm no host para a primeira execução local; alternativa: containers de aplicação com maior custo de configuração/rebuild.
- Aprovar componentes/tokens locais ao web e dashboard demonstrativo na SPRINT 01; pacote de UI independente fica para necessidade real.

OIDC/sessão opaca e fila PostgreSQL permanecem recomendações para SPRINTS 02 e 04, sem escolha/implementação de fornecedor ou biblioteca nesta fundação.
