# Modelo de domínio inicial

Status: persistência das SPRINTS 02–06 mesclada; IA em preparação na SPRINT 07. Feedback e monitoramento permanecem conceituais. Data: 2026-11-18.

## Entidades e invariantes

| Entidade                    | Campos conceituais e regras                                                                                                                                                                                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User (candidato) / Coach    | Identidade autenticada e perfil esportivo são responsabilidades distintas. Proposta MVP: issuer/subject únicos no Coach, sem tabela User separada enquanto só existir treinador autenticado; separar User quando houver ciclo de vida/perfis adicionais reais. |
| CoachSession                | hash de token opaco, coachId, expiração e revogação; não guardar cookie em claro.                                                                                                                                                                              |
| Athlete                     | id, coachId, nome, emailNormalizado, estado; e-mail não é prova de identidade nem chave global.                                                                                                                                                                |
| CoachAthleteLink            | id, coachId, athleteId, estado pending/active/ended, início/fim; um vínculo corrente por par, histórico preservado.                                                                                                                                            |
| Invitation                  | coachId, athleteId, linkId, tokenHash único, expiresAt, revokedAt, consumedAt e destinatário esperado; estado pending/used/expired/revoked derivado desses campos com transições consistentes; token nunca persistido em claro.                                |
| EnrollmentSession           | convite resgatado, hash de capability, expiração, estado e verificação de e-mail; acesso apenas à própria jornada pública.                                                                                                                                     |
| ConsentDocument             | finalidade, versão, hash e referência do texto imutável publicado.                                                                                                                                                                                             |
| ConsentRecord               | coachId, athleteId, linkId, documento, decisão, instante e evidência mínima; retirada append-only, não sobrescrever aceite anterior.                                                                                                                           |
| GarminConnection            | coachId, athleteId, provider, identificador externo protegido, estado not_connected/awaiting_authorization/connected/error/disconnected, tokens cifrados, keyVersion e timestamps; separada do consentimento.                                                  |
| AuthorizationAttempt        | connectionId, enrollmentSessionId, hash de state, expiração, consumo e material PKCE protegido se exigido.                                                                                                                                                     |
| IntegrationEvent            | provider, identidade de entrega/escopo oficial, hash, raw protegido, estado e horário; inbox durável.                                                                                                                                                          |
| ProcessingJob               | tenant, referência, etapa, versão, tentativas, availableAt, lease e erro sanitizado.                                                                                                                                                                           |
| Activity                    | coachId, athleteId, connectionId, externalId, source, isSynthetic, modalidade, início UTC, timezone, revisão, métricas e qualidade.                                                                                                                            |
| ActivitySample / Split      | activityId, timestamp/índice, unidades e medidas opcionais; preservar ausência, ordem e proveniência.                                                                                                                                                          |
| SportsAnalysis              | activityId, revisão de entrada, versão de algoritmo, status, métricas derivadas e qualidade.                                                                                                                                                                   |
| SportsEvent                 | analysisId, regra/versão, intervalo, evidências, limiar e limitações; não é diagnóstico médico.                                                                                                                                                                |
| Insight                     | analysisId, tipo fact/event/hypothesis/recommendation, texto, evidências, versão e estado; hipóteses distinguíveis.                                                                                                                                            |
| AIRun                       | coachId, escopo, referências/revisões de entrada, prompt/model version, provider, status, consumo e saída validada; minimizar conteúdo persistido.                                                                                                             |
| CoachFeedback               | coachId, activityId, análise/insight opcional, autor, observação/decisão, escopo (atividade/km/intervalo), origem do contexto (observado pelo coach/informado pelo aluno), revisão e timestamps; histórico de alterações.                                      |
| MonitoringEvent / ReadState | coachId, tipo, recurso, horário e estado de leitura; projeção, não fonte de autorização.                                                                                                                                                                       |
| AuditEvent                  | tenant, ator, ação, alvo, resultado, horário e correlationId; sem tokens ou raw pessoal.                                                                                                                                                                       |

A referência de Feedback exige avaliações independentes para evento observado e hipótese causal. Modelar no feedback associado ao insight os campos observedEventVerdict (correct/partial/incorrect) e causalHypothesisVerdict (correct/partial/incorrect/unknown), ambos opcionais até avaliação, além de contexto textual. Não colapsar os dois em um único booleano; ausência de avaliação difere de “não sei”. Cada revisão mantém a referência à versão do insight avaliado.

Campos de identidade primária, createdAt e updatedAt onde cabível. Estados e enums definitivos serão fechados por etapa.

```mermaid
erDiagram
  COACH ||--o{ ATHLETE : cadastra
  COACH ||--o{ COACH_ATHLETE_LINK : acompanha
  ATHLETE ||--o{ COACH_ATHLETE_LINK : possui
  COACH_ATHLETE_LINK ||--o{ INVITATION : recebe
  INVITATION ||--o| ENROLLMENT_SESSION : origina
  COACH_ATHLETE_LINK ||--o{ CONSENT_RECORD : fundamenta
  CONSENT_DOCUMENT ||--o{ CONSENT_RECORD : versiona
  ATHLETE ||--o{ GARMIN_CONNECTION : autoriza
  GARMIN_CONNECTION ||--o{ ACTIVITY : fornece
  ACTIVITY ||--o{ SPORTS_ANALYSIS : analisa
  SPORTS_ANALYSIS ||--o{ SPORTS_EVENT : detecta
  SPORTS_ANALYSIS ||--o{ INSIGHT : contextualiza
  ACTIVITY ||--o{ COACH_FEEDBACK : recebe
```

## Identidade e isolamento

Proposta conservadora: Athlete é cadastro do coach, não identidade universal do indivíduo. O coach define destinatário e e-mail antes de emitir convite. A página permite confirmar/corrigir nome; divergência de e-mail exige reemissão/verificação, nunca troca silenciosa de athleteId. Verificação de e-mail por código é recomendada antes de vincular Garmin; requer serviço transacional ainda não escolhido. Link encaminhado sozinho não deve ser tratado como prova da identidade correta. Política precisa ser aprovada antes da etapa de convites.

Todas as relações entre registros de tenant usam coachId + id no banco e nas consultas. Convite só pode ativar seu link/athlete preexistente. Credencial Garmin não concede acesso à UI. Não unir cadastros de coaches distintos por e-mail ou identificador Garmin. Caso a Garmin limite múltiplas autorizações da mesma conta por aplicação, a política acima deve ser revista antes de produção; nenhuma conexão pode ser transferida entre coaches implicitamente.

## Integridade, concorrência e versões

Consumo do convite é atualização condicional em transação: pendente, não revogado e expiresAt maior que agora. Somente um vencedor concorrente cria enrollment; a sessão de jornada permite retomada sem reutilizar token. Consentimentos e ativação de vínculo são persistidos atomicamente ao confirmar aceites; autorização Garmin ocorre depois e pode falhar independentemente.

Propor convite válido por 48 horas, enrollment por 30 minutos e tentativa OAuth por 10 minutos; valores configuráveis, pendentes de aprovação. Nova tentativa oficial exige capability válida e novo state. Não manter transação de banco aberta durante redirect externo.

Unicidade de atividade por provider + conexão + externalId, com índice por coach/aluno/data. Escopo de ID e revisões externas dependem do contrato oficial. Um evento pode ser repetido sem duplicar atividade; atualizações geram nova revisão e invalidam análises derivadas obsoletas. Resultado único por activityId + inputRevision + algoritmo/version. Persistir amostras em lotes; unidade canônica explícita (m, s, bpm, conforme métrica) e valor ausente como null, nunca zero fabricado.

Encerrar vínculo remove acesso e cancela processamento elegível. Revogar Garmin não apaga automaticamente evidência legal nem define prazo de retenção: políticas distintas precisam de aprovação e execução auditada.

## Responsabilidade, cardinalidade e persistência

Nomenclatura conceitual: CoachAthleteLink corresponde a CoachAthleteRelationship; ConsentRecord a Consent; SportsEvent a ActivityEvent; Insight a AIInsight quando produzido por IA; AuditEvent a AuditLog. Não criar entidades duplicadas apenas por nome.

Coach possui muitos cadastros Athlete e relacionamentos; cada relacionamento pertence a um coach e um cadastro. Cada convite pertence a um relacionamento e origina no máximo uma jornada resgatada. Uma conexão possui muitas atividades; a atividade possui muitas amostras/splits e revisões de análise. Atividade importada manualmente pode não ter connectionId: manter referência de importação e origem `manual_fit`, sem forjar conexão Garmin. Cada análise contém eventos e pode gerar insights; feedback tem autor treinador e referência à atividade, com aluno derivado e validado pela relação, sem aceitar associação divergente.

Persistir identidade/vínculo, convites/consentimentos, conexão e atividade quando suas sprints forem implementadas. Samples e splits podem ser tabelas ou blocos normalizados conforme volume/acesso; decidir na SPRINT 05 com consultas reais. Eventos podem pertencer ao agregado de análise; ReadState pode ser campo do MonitoringEvent enquanto houver um destinatário. Sessions, inbox/jobs e tentativas são necessidades técnicas, não tabelas obrigatórias de domínio. Métricas de dashboard são projeções calculadas inicialmente, sem tabela de contador independente. Nenhum desses modelos exige migrations na SPRINT 00.

O mecanismo público de revogação deve usar capability específica, expiração, uso único, confirmação de identidade e rate limit; não reutilizar convite consumido nem fornecer IDs livres. Solicitação de fim do vínculo tem estado e auditoria próprios, sem inventar estado adicional do vínculo. Detalhes do canal e da verificação precisam de aprovação na SPRINT 03.

## Persistência efetiva na SPRINT 02

Coach incorpora issuer/subject; sem User separado. Athlete pertence ao coach e tem e-mail canônico único dentro dele. CoachAthleteRelationship mantém o vínculo corrente por aluno com coachId composto; somente pending é criado pela API nesta etapa. Fluxos de encerramento, nova vinculação e histórico esportivo não são antecipados. Sessão, tentativa OIDC, auditoria mínima e bucket de rate limit são persistidos por necessidade operacional. AuthAttempt não representa consentimento ou autorização Garmin.

Demais entidades permanecem candidatas para sprints correspondentes. Nenhum cadastro ativa vínculo ou cria consentimento. Perfil mostra ausência de conexão como não conectada sem persistir GarminConnection fictícia.

## Persistência efetiva na SPRINT 03

Invitation pertence ao relacionamento coach/aluno e fixa recipientEmail; hash único, datas de expiração/resgate/revogação. EnrollmentSession tem relação 1:1 com o convite, hash de cookie independente, expiração, código simulado protegido, tentativas e evidências de verificação/aceite. ConsentDocument mantém conteúdo/versionamento/hash dos dois exemplos; ConsentEvidence registra aceites e retiradas append-only, com unicidade por coach/enrollment/documento/decisão e FKs compostas que impedem associar outro treinador ou outro aluno. Nenhuma tabela Garmin foi criada.

WithdrawalAccess pertence ao mesmo relacionamento e mantém hash do link separado do hash da sessão pública de encerramento. Validades: sete dias no link, 30 minutos na sessão; reemissão revoga link e sessão anteriores. Encerramento mantém evidências e não permite reabrir o vínculo. Sessão de convite nunca é sessão de coach ou mecanismo permanente de gestão.

Locks no relacionamento ordenam mutações de convite, jornada, destinatário e encerramento; consentimentos e transição do vínculo são atômicos. Repetir confirmação não duplica evidência. E-mail alterado pelo coach revoga convites pendentes/usados, sem trocar aluno silenciosamente. Convite revogado depois de aceite não desfaz vínculo ativo: retirada tem fluxo próprio. Não há merge de identidades entre coaches. Verificação persistida é explicitamente demo, sem afirmar controle real da caixa postal.

## Persistência efetiva na SPRINT 04

GarminConnection tem relação 0..1 com o vínculo corrente, estados independentes, generation e credentialVersion, hash único de conta, credenciais AES-GCM/keyVersion, expiração e lease de renovação. GarminAuthorizationAttempt vincula conexão/enrollment/coach/aluno com FKs compostas, state e navegador por hash, expiração/consumo e resultado. Estado de conexão nunca substitui status de vínculo ou consentimento.

Invitation ganha purpose (accompaniment por padrão; garmin para recuperação), fixado pelo caso de uso servidor. O convite de conexão exige vínculo ativo/aceites atuais e nova verificação; não grava ConsentEvidence ou acceptedAt de acompanhamento, não reativa encerrados e não reutiliza segredo de convite consumido. O aluno continua sem conta de dashboard.

IntegrationEvent é inbox/registro operacional: identidade única conexão/geração/tipo/entrega, hash para colisões, payload cifrado, namespace/jobId e estados queued/processing/retry/processed/ignored/failed/cancelled, tentativas e erro sanitizado. Falhas permanentes/exauridas permanecem nesse registro para revisão/redrive, mesmo se o job de transporte for concluído. runToken/leaseUntil impedem commit tardio. A biblioteca mantém tabelas próprias para claim/retry; não duplicamos ProcessingJob como tabela do domínio. WorkerHeartbeat registra somente disponibilidade por namespace.

Activity é envelope mínimo normalizado (origem, isSynthetic, externo/revisão, modalidade, início UTC, distância/duração opcionais e hash); sem samples/splits/análises/IA nesta etapa. Unicidade conexão/geração/externo, FKs compostas e comparação de revisão preservam isolamento e ordem; mesma revisão com conteúdo diferente requer revisão, não sobrescrita silenciosa. Campos ausentes permanecem null. Payload de atividade é limpo após processamento/cancelamento; material de revogação somente após sucesso. Retenção de falhas/metadados exige política antes de uso real.

## Incremento da SPRINT 05 — em revisão

Decisões aprovadas no [ADR-005](../decisions/adr-005-activities-fit.md): métricas resumidas em Activity, amostras/splits relacionais com FK composta e publicação de revisão atômica; conexão opcional para origem manual_fit e vínculo direto obrigatório. FitImport registra hash por coach, staging normalizado temporário, estado/tentativas/fencing e atividade resultante. Consulta e publicação exigem vínculo ativo e aceites vigentes, com isolamento por treinador.

FIT usa SDK oficial em thread limitada, somente demo local/arquivos sintéticos; bruto, GPS e identificadores externos são descartados. Fila existente atende mock e FIT independentemente de autorização Garmin; encerramento cancela importações pendentes, desconexão Garmin não cancela importação manual. Dados ausentes não são estimados. Histórico/detalhes paginados não incluem gráficos, análise determinística de eventos ou IA das próximas sprints. Integração oficial e uso produtivo continuam dependências externas e de revisão.

## Incremento da SPRINT 06 — em revisão

[ADR-006](../decisions/adr-006-sports-analysis.md) aprovado: SportsAnalysis persistido com FK composta, revisão/hash/algoritmo, estado e snapshot validado de métricas/eventos/evidências. Worker/fila existentes fazem processamento após publicação, sem cálculo de métricas por IA. Consultas autorizadas e comparação reaplicam vínculo/aceites; revisão obsoleta e retirada impedem resultado tardio. Gráficos sincronizados usam somente séries recebidas, com redução visual que preserva extremos/lacunas; cálculos usam resolução integral. Seleções não interpolam fronteiras e distinguem cronômetro/decorrido. Regras são heurísticas demonstrativas, sem causa ou diagnóstico. IA, feedback e MVP 2 permanecem fora desta implementação.
