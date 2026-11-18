# ADR-004 — Integração Garmin e processamento assíncrono

Status: implementação autorizada na SPRINT 04 pelo responsável técnico (“pode continuar e só finalizar no final da sprint 04”). Implementação e validação concluídas; entrega e merge sujeitos a revisão. Data: 2026-11-18.

## Problema e escopo

Validar autorização, recebimento de atividades, falhas e desconexão sem acesso Garmin aprovado, preservando isolamento e estados independentes. A SPRINT 04 inclui somente envelope mínimo normalizado; listagem esportiva, FIT, séries/análises e IA ficam nas próximas sprints.

## Decisões dentro da arquitetura aprovada

- Backend modular, mesmo PostgreSQL e worker separado executando os mesmos casos de uso. API confirma apenas a persistência de inbox + job; consistência eventual, sem promessa de tempo real.
- pg-boss 12.38.2 fixado, Node >=22.12 (projeto Node 24), PostgreSQL >=13 (projeto 17). Adapter fromPrisma permite enfileirar na transação do domínio. Comparados: fila SQL própria exigiria manter leases/retries/supervisão; BullMQ adicionaria Redis. Biblioteca mantida atende a proposta inicial com menor implementação própria. Seu schema é gerenciado pela versão fixada, exclusivamente em desenvolvimento local nesta entrega; produção oficial ainda desabilitada.
- Porta de provider com DTOs internos. GarminMockProvider possui contrato explicitamente sintético, independente de protocolos oficiais. Provider oficial permanece indisponível até aprovação/documentação/credenciais. Não criar endpoints/escopos Garmin fictícios.
- Mock somente em modo demo local fora de produção; chaves estáveis de criptografia e assinatura obrigatórias quando habilitado. Configuração padrão desabilitada e comando local para preparar segredos no .env ignorado, sem imprimi-los. Chave externa ao banco, AES-GCM e identificação de versão; nenhuma senha Garmin.
- Autorização é iniciada pelo aluno após aceites válidos, vinculada à sessão pública, state de uso único e prazo de dez minutos. Tela mock permite aprovar/recusar, sem login Garmin real. Revalidar vínculo/aceites/generation ao confirmar. Coach não autoriza conta em nome do aluno.
- Eventos mock assinados com HMAC do corpo bruto e timestamp com janela curta. Este é contrato de teste, não assinatura Garmin presumida. Resolver conta por conexão conhecida; não confiar em IDs de coach/aluno no evento. Inbox + job atômicos, identidade da entrega única e hash para detectar colisão de conteúdo.
- Ordenar revisões do envelope por origem/conexão/generation/atividade; duplicatas não duplicam atividade e versões antigas não sobrescrevem recentes. Payload de inbox cifrado; jobs carregam referências, nunca credenciais ou séries pessoais.
- pg-boss reivindica jobs com lock e prazo, retenta erros transitórios com backoff, máximo de cinco tentativas. Erros permanentes ficam registrados para revisão; redrive manual exige coach dono e conexão/vínculo ainda válidos. Não prometer exactly-once; efeitos de domínio são idempotentes.
- Renovação de credenciais fora de transações longas, com lease/versionamento e verificação de geração. Disconnect/retirada de consentimento bloqueiam ingestão e publicação imediatamente e persistem intenção de revogação externa; falhas de revogação não reativam vínculo/conexão. Revalidar antes de commit do worker para evitar corrida com encerramento.
- UI do perfil e Configurações mostram origem simulada, estado separado, sincronização/falhas/pendências e worker. Não criar a listagem de atividades da SPRINT 05 ou a central da 09.

## Critérios de aceitação e validação

Aluno fictício autoriza/recusa após aceite; coach vê conexão mock sem alegação de integração oficial. Evento autenticado é processado assíncronamente em envelope persistido. Testar state/navegador/replay/expiração, assinatura/timestamp/payload, isolamento, inbox/job transacional, duplicatas, revisões fora de ordem, falhas transitórias/permanentes, crash/lease, refresh concorrente, desconexão e revogação durante processamento. Browser valida jornada pública e painel em desktop/tablet/mobile e temas existentes. Atualizar docs/roadmap, abrir PR main e aguardar revisão, sem iniciar SPRINT 05.

## Dependências e fontes primárias

A documentação pública Garmin confirma programa Business, mas não fornece o contrato autorizado desta aplicação. Nenhuma variável Garmin/credencial oficial foi encontrada na inspeção; bloqueio externo registrado. Os textos/identidade da SPRINT 03 seguem demonstrativos.

- [Garmin — programa oficial](https://developer.garmin.com/gc-developer-program/overview/), consultado em 2026-11-18.
- [pg-boss — projeto e requisitos](https://github.com/timgit/pg-boss).
- [pg-boss — adapter de transação Prisma](https://pgboss.io/api/adapters).
- [PostgreSQL 17 — locking/SKIP LOCKED](https://www.postgresql.org/docs/17/sql-select.html).

## Consolidação operacional

Recuperação é convite com purpose=garmin para aluno ativo, usando o mecanismo de verificação demo existente. Não grava novos aceites nem acceptedAt de acompanhamento. State não é salvo em claro e é removido do fragmento no browser. Chaves e namespace são estáveis e separados de AUTH_SECRET; keyVersion local-v1 registra formato inicial, sem prometer rotação automática ou protocolo oficial.

O schema pg-boss é gerenciado pela versão 12.38.2, iniciado somente no mock local. Migrations Prisma versionam tabelas do domínio; deploy produtivo da fila é gate futuro antes do provider oficial. Queue job carrega apenas eventId. IntegrationEvent failed é a revisão persistida de erros permanentes/exauridos, com redrive auditado; a conclusão do transporte não significa sucesso da normalização. Material cifrado de atividade é limpo após sucesso/cancelamento, e snapshot de revogação após sucesso. Retenção das falhas/metadados continua pendente antes de dados reais.

Readiness HTTP verifica banco; disponibilidade do worker é independente e usa heartbeat com validade de 15 segundos em perfil/Configurações. API pode receber com worker offline e confirmar somente inbox/job duráveis. Worker recupera jobs expirados e intenções sem agendamento, revalida elegibilidade e usa fencing de execução; chave alterada falha fechada, não tenta interpretar dados como reais. Processos têm encerramento ordenado e erros sem payloads/segredos.

Validação executada: nove testes unitários/HTTP/segurança, 21 cenários de integração reais e 24 E2E; build/tipos/lint/formatação. Inclui rollback após enqueue real via adapter, crash/lease/fencing, refresh e revogação concorrentes, compensação no callback, recuperação de intenção sem job, reconexão sem duplicar aceites e autorização por coach/aluno. Banco vazio e smoke com API/worker em processos distintos passaram. Testes demonstram o contrato mock, não aprovação nem compatibilidade de produção com a Garmin oficial.
