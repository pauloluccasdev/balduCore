# BalduCore — roadmap técnico

Status: SPRINT 00 com entregáveis preparados, aguardando revisão e aprovação da arquitetura. SPRINTS 01–11 não autorizadas. Data: 2026-11-11. Este roadmap substitui a numeração de etapas do discovery inicial.

Uma branch por sprint (`sprint/NN-descricao`), PR para main e nenhuma passagem automática à próxima sprint. Apresentar problema, plano, decisões/trade-offs e aceite antes de implementar. Encerrar com revisão, testes/resultados, limitações e documentação atualizada; merge requer autorização. O PR da SPRINT 00 não equivale a aprovação arquitetural.

| Sprint / estado | Escopo | Aceite e validação |
| --- | --- | --- |
| 00 — Discovery / em revisão | Diagnóstico, oito referências, stack, módulos, domínio, fluxos, riscos, ADR e regras no AGENTS.md. | Arquitetura revisada e aprovada pelo responsável técnico. Entregáveis documentais preparados, sem código de produto. |
| 01 — Fundação / planejada | Monorepo pnpm, Next/React/TS/Tailwind, Nest, PostgreSQL, Prisma, Compose, env, logs, health, design system, sidebar, dark/light, dashboard sintético, testes básicos e README. | Frontend/API/banco locais; instalação reproduzível, build, lint, formatação, tipos, health/readiness real; temas e sidebar em desktop/tablet/mobile. Sem autenticação ou endpoints de negócio. |
| 02 — Auth e alunos / planejada | Autenticação do coach, sessão, rotas protegidas, cadastro/lista/busca/filtros/perfil, estados de vínculo e isolamento. | Treinador administra somente seus alunos; E2E login/logout/expiração e testes A/B em cada recurso, CSRF e integridade relacional. |
| 03 — Convites / planejada | Convite individual, token seguro, expiração/revogação, página responsiva, nome/e-mail, aceites/consentimento, vínculo, confirmação/erros e preparação Garmin; mecanismo seguro de revogação/solicitação de encerramento sem portal. | Convite válido ativa somente seu vínculo; GET não consome, concorrência tem um vencedor, replay/expiração/revogação são rejeitados. Testar identidade e separação do estado Garmin, que não é marcado conectado pelo aceite. |
| 04 — Garmin / planejada | Provider, mock, autorização, tokens protegidos, inbox/eventos, fila/worker, idempotência, retries/falhas, sincronização, desconexão e auditoria. Oficial somente com acesso/documentação aprovados. | Fluxo completo com mock identificado; integração, replay, entrega fora de ordem, crash/lease, refresh/revogação e isolamento. Se oficial bloqueado, registrar dependência; não apresentar mock como real. |
| 05 — Atividades / planejada | Modelo e normalização detalhados, importação, lista por aluno, filtros, métricas, splits/séries disponíveis, processamento e navegação; FIT manual para desenvolvimento com validação/limites. | Histórico persistido e autorizado; fixtures incompletas e duplicatas, upload inválido/excessivo, proveniência, unidades e estados vazios. Não exigir métricas ausentes. |
| 06 — Análise / planejada | Gráficos sincronizados de ritmo/FC/cadência/elevação quando disponíveis; splits, seleção/comparação de segmentos, eventos, resumo determinístico e análises persistidas/versionadas. | Métricas rastreáveis e cálculos com fixtures conhecidas; pausas, tempo em movimento/decorrido, distância parcial, ausência de séries e análise obsoleta testados. |
| 07 — IA / planejada | Provider, AI Coach contextual e assistente independente, consultas por aluno/atividade, histórico, insights/evidências, dados ausentes e limites. | Respostas sobre dados reais autorizados; testes controlados de invenção de métricas, referências inválidas, acesso cruzado, prompt injection, custo/timeout e falha parcial. |
| 08 — Feedback / planejada | Observações, decisões, validação independente de evento/hipótese, contexto atividade/aluno/segmento, edição controlada e histórico. | Registrar/consultar avaliações com autoria e revisões; autorização, concorrência de edição e preservação da proveniência do contexto. |
| 09 — Monitoramento / planejada | Novas atividades, análises, eventos, erros/pendências, filtros, leitura e navegação; evitar excesso de notificações. | Coach identifica atenção; eventos idempotentes, destinatário correto, estado lido e acesso ao recurso validado. |
| 10 — Dashboard real / planejada | Indicadores persistidos, alunos/Garmin, atividades, insights, eventos, volume, navegação, estados vazios/erro. | Totais reproduzíveis por consultas autorizadas; nenhum indicador depende de fixture; períodos, modalidades e falhas parciais validados. |
| 11 — Piloto MVP 1 / planejada | E2E, segurança/autorização, erros, responsividade, acessibilidade, performance, observabilidade, documentação e checklist de deploy. | Fluxos críticos ensaiados, backup/restauração e migrations verificados, políticas e fornecedores aprovados; apto a testes controlados, sem prometer conformidade ou produção irrestrita. |

## Dependências entre sprints
SPRINT 04 precisa de um envelope mínimo de atividade e proveniência para testar ingestão; o histórico e contrato esportivo completo ficam na 05, evitando implementar essa sprint antecipadamente. A infraestrutura emite eventos operacionais desde o pipeline, mas central de monitoramento e contadores reais só são entregues nas 09/10. O dashboard da 01 usa fixtures isoladas, sem simular APIs/autenticação/integração reais.

## Riscos e decisões pendentes
| Tema | Proposta / trade-off | Resolver até |
| --- | --- | --- |
| Stack e execução | Next/Nest modular com banco único; maior custo que Next apenas, em troca de domínio/worker independentes da UI. Aprovar API ESM, versões estáveis verificadas e banco Compose/apps host. | Antes da 01. |
| Identidade visual | Oito PNGs locais revisados, cor #EF3338; fontes/logo originais ausentes. Aprovar alternativa tipográfica provisória e marca textual fiel ou fornecer assets. Adaptar mobile sem reinventar identidade. | UI da 01. |
| Auth | OIDC + sessão opaca recomendado; escolher fornecedor, custos e política de entrada dos coaches. Auth local aumenta manutenção de senhas e recuperação. | 02. |
| Identidade do aluno | Cadastro por coach e vínculo separado propostos; confirmar política de e-mail e verificação, compartilhamento indevido de link e futuro multi-coach. Sem organizações/RBAC complexo inicial. | 02–03; validar restrições Garmin na 04. |
| Revogação pública | Capability restrita, verificação de identidade e confirmação; canal e recuperação sem portal precisam de definição. | 03–04. |
| Garmin | Aprovação, modalidade, credenciais, autenticidade, quotas, séries, múltiplas autorizações e histórico; nenhum endpoint inventado ou garantia de tempo real. | 04 oficial; bloqueio externo explícito. |
| Fila | Biblioteca PostgreSQL mantida, transação/outbox, leases, dead-letter e retries; Redis só se justificado. | 04. |
| FIT e volume | Parser, limites de bytes/amostras/CPU, deduplicação e retenção de raw; testar antes de adicionar storage ou particionamento. | 05. |
| IA | Provider, orçamento, dados mínimos, retenção/região/contratos, transferência internacional e avaliações. | 07 com dados reais. |
| LGPD e operação | Bases legais, controlador/operador, textos, menores, retirada, retenção/exclusão/backups e direitos; secret manager/rotação e rate limit compartilhado. | Antes de dados reais/piloto. |

## MVP 2 — não autorizado
Calendário, treinos estruturados, prescrição individual, aquecimento, intervalos, recuperação, metas, envio Garmin quando permitido, status de publicação, comparação planejado/executado e AI Coach sobre prescrição. Sem pagamentos, assinaturas ou SaaS complexo por antecipação. Portas externas e domínio desacoplado permitem evolução sem implementar essas entidades agora.

## Evidências da SPRINT 00
Repositório antes desta revisão: commit inicial 10c0e83 em main com seis Markdown e oito PNGs; nenhuma aplicação. Nesta revisão: AGENTS.md conciso, documentos reconciliados com contexto mestre, referências relidas e compatibilidade declarada consultada em fontes oficiais/registro npm. Checks documentais verificam links relativos, PNGs, contagem das referências, fences e diff; sem testes de produto executáveis, sem instalações ou migrations. Aprovação arquitetural e início da 01 permanecem pendentes.
