# Roadmap técnico incremental

Status: proposto; apenas etapa 0 autorizada nesta interação. Data: 2026-11-11.

Cada etapa começa com problema, solução, decisões/trade-offs e critérios confirmados; implementa apenas o escopo aprovado e encerra com evidências dos testes e pendências. Não há estimativas de prazo sem dimensionamento e acesso às dependências.

| Etapa | Problema e solução / decisões | Critérios de aceitação e validação |
| --- | --- | --- |
| 0 — Discovery | Ausência de código e contratos; registrar seis documentos e proposta de arquitetura. | Seis documentos consistentes; diagnóstico rastreável; inventário das oito referências e decisões abertas explícitas. Discovery documental e inspeção visual concluídos. |
| 1 — Fundação | Criar monorepo, Next/Nest mínimos, PostgreSQL Compose, Prisma, env de exemplo, logs e CI. Dois processos têm custo operacional, mas delimitam UI/domínio. | Instalação limpa, migration em banco vazio, build, lint, format check, tipos e teste de integração do banco. Nenhuma tela funcional ou Garmin real; health e OpenAPI técnicos dentro da etapa aprovada. |
| 2 — Identidade e isolamento | Escolher OIDC, implementar sessão, Coach, Athlete e vínculo com autorização centralizada. | E2E login/logout/expiração/CSRF; coach A não lê/altera recursos de B; FKs impedem referências cruzadas; nenhuma conta dashboard de aluno. |
| 3 — Convite e consentimento | Jornada pública, capacidade restrita, identidade do destinatário e textos versionados; escolher canal de verificação de e-mail. | Expiração, revogação, GET sem consumo, corrida com um vencedor, rejeição de replay, e-mail divergente, retomada e consentimento retirado. Revisão de textos antes de uso real. |
| 4 — Garmin mock e pipeline | Contrato interno, inbox/fila, worker, normalização e estados de conexão, sem depender de aprovação externa. | Duplicata, revisão, erro, crash após persistência, lease expirado, retry/dead-letter, ordem invertida e revogação. Uma atividade lógica e resultado coerente após replay; dados sintéticos identificados em toda saída. |
| 5 — Experiência de acompanhamento | Com referências inspecionadas, construir shell/sidebar/temas, alunos, atividades, dashboard, monitoramento e configurações sobre API autorizada. | Comparação visual das oito referências aplicáveis, navegação, filtros, teclado, contraste, estados vazios/erro e E2E por coach. Não fixar estatísticas fictícias como reais. |
| 6 — Análise determinística e feedback | Métricas, séries/splits quando disponíveis, intervalos, eventos e histórico técnico. | Fixtures conhecidas com unidades, pausas e dados incompletos; métricas verificadas, proveniência e versões; feedback isolado e auditável. |
| 7 — IA contextual | Escolher provider e política de dados, gerar insights e responder perguntas usando evidências. | Avaliações de insuficiência de dados, métrica inventada, acesso cruzado, prompt injection e separação fato/hipótese; falha de IA preserva análise; limites de custo e timeout. |
| 8 — Garmin oficial | Substituir adapter conforme documentação aprovada; pode avançar em paralelo às etapas de UI somente com autorização de escopo. | Testes contratuais autorizados, callback seguro, autenticidade, entrega duplicada, refresh, revogação, limites e atividade real ponta a ponta. Sem aprovação, release continua demonstrativa e não promete integração real. |
| 9 — Prontidão de produção | Revisar privacidade, retenção/exclusão, backup, observabilidade e operação. | E2E convite → autorização → ingestão → análise → feedback; isolamento, restauração, migração e falha/retry ensaiados; termos e fornecedores aprovados; sem seeds/mock em produção. |

## Riscos e decisões pendentes
| Tema | Risco / decisão necessária | Momento limite |
| --- | --- | --- |
| Referências inspecionadas | Oito PNGs localizados e analisados; originais preservados em `docs/design/references/` como fonte de verdade visual; falta obter fonte/logotipo originais. Mobile e telas sem referência requerem adaptação da identidade existente. | Antes da UI. |
| Stack e implantação | Aprovar monorepo Next/Nest e PostgreSQL; definir hospedagem com worker persistente e banco. Não assumir Vercel ou outro provedor. | Antes da fundação/implantação correspondente. |
| Autenticação | Escolher OIDC e política de acesso inicial dos coaches; custos e dependência externa. | Antes da etapa 2. |
| Identidade do aluno | Aprovar cadastro por coach, e-mail esperado e verificação; encaminhamento de link não prova identidade. Definir política para um aluno com vários treinadores. | Antes da etapa 3; compatibilizar com Garmin antes do provider oficial. |
| Consentimentos/LGPD | Bases legais, papéis, textos, menores de idade, retenção, direitos e operadores externos precisam de validação. Sem política para menores, não lançar atendimento desse público. | Antes de dados reais. |
| Garmin | Aprovação, plano, documentação, disponibilidade de séries, histórico e múltiplas conexões podem limitar produto. Iniciar solicitação pelo responsável; não prometer backfill. | Antes da etapa 8. |
| Fila | Selecionar biblioteca PostgreSQL mantida; garantir atomicidade/outbox, leases e retry sem construir scheduler completo artesanal. | Etapa 4. |
| Dados em volume | Séries densas afetam banco e gráficos; medir antes de particionar ou adicionar storage externo. | Etapas 4–6. |
| IA | Provider, contrato, retenção, região, transferência internacional e orçamento; avaliar alucinação e insuficiência de evidências. | Antes da etapa 7 com dados reais. |
| Segurança operacional | Secret manager, chaves/rotação, rate limiting compartilhado, backups e exclusão. | Antes de produção. |

## Estado desta entrega
Criados os seis documentos solicitados e, posteriormente, adicionadas as oito imagens originais em `docs/design/references/` por solicitação do usuário. Não há dependências instaladas, schema, migrations, telas, endpoints ou testes executáveis. Verificação documental cobre arquivos, referências relativas e espaços em branco. Próximo passo: aprovação da arquitetura e do escopo da etapa 1; as oito referências visuais já foram inspecionadas, sem iniciar telas.
