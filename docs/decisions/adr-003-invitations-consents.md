# ADR-003 — Convites, identidade e consentimentos na SPRINT 03

Status: decisões aprovadas pelo responsável técnico em 2026-11-18, após apresentação do plano e confirmação “pode seguir”. Implementação da SPRINT 03 validada e em revisão; aceite final da entrega e merge ainda dependem de revisão.

## Estado e dependência

SPRINT 02 implementada na branch sprint/02-auth-alunos, com login demonstrativo autorizado; PR #3 aberto e pronto para revisão, ainda não mesclado. Branch sprint/03-convites parte dessa base. Não fazer merge da 02 automaticamente. O PR da 03 será um rascunho para main e conterá a dependência da 02 até seu merge; depois atualizar a branch para revisão isolada.

Já existem Coach, Athlete, vínculo pendente, sessão, autorização por treinador, auditoria e rate limiting. Não existem convite, jornada pública, consentimentos, verificação de e-mail ou conexão Garmin implementados.

## Problema

Permitir que o aluno confirme o acompanhamento a partir de um link individual sem receber acesso ao dashboard. O link pode ser encaminhado indevidamente e previews de mensageria podem abri-lo sem ação humana. Digitar o e-mail esperado não prova controle da caixa postal. Convite, identidade, vínculo, consentimento e autorização Garmin não podem compartilhar um único estado de sucesso.

## Alternativas de identificação

| Opção                                | Benefício                                                                            | Trade-off                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Código enviado ao e-mail esperado    | Confirma controle do canal e reduz uso indevido de link encaminhado.                 | Requer transporte de e-mail, configuração externa e política de recuperação; nenhum fornecedor escolhido ainda. |
| Código simulado somente no modo demo | Exercita a jornada e regras sem enviar mensagens reais ou contratar serviço externo. | Não comprova identidade real; toda evidência precisa indicar simulação e impedir uso produtivo.                 |
| Somente link + e-mail digitado       | Menor esforço de implementação inicial.                                              | Não prova controle do e-mail; não recomendado para autorizar compartilhamento real de dados esportivos.         |

Recomendação para os testes atuais: código simulado no modo demo, com contrato de verificação separado do transporte futuro. Código disponível apenas ao treinador autenticado dono do convite demonstrativo, nunca devolvido pela API pública. Não enviar e-mails/WhatsApp nem integrar fornecedor real nesta sprint sem autorização específica. Produção e modo Google não podem usar o verificador simulado como prova de identidade.

A jornada deve declarar verificationMode=demo/isSynthetic e não registrar uma verificação real de e-mail. Se for necessário usar alunos reais nesta etapa, interromper esse caminho e definir transporte/identidade e textos aprovados antes de habilitar tal uso.

## Proposta de convite e jornada

- Coach gera convite a partir de aluno preexistente do seu cadastro, com vínculo pendente e e-mail destinatário fixado.
- Token de pelo menos 32 bytes aleatórios; armazenar somente hash, com validade proposta de 48 horas, revogação e consumo único. Link exibido uma vez e compartilhado manualmente pelo usuário.
- GET da página não consome o convite. A consulta de disponibilidade usa POST com token no corpo, sem consumir; não incluir dados pessoais do destinatário em previews públicos. O link usa fragmento, que não chega ao servidor na navegação.
- POST de resgate consome convite atomicamente e cria capability de jornada restrita e temporária (proposta: 30 minutos). Não é uma sessão de coach. Reuso concorrente produz um único vencedor.
- Após resgate, remover segredo da URL e usar cookie HttpOnly com controles de origem/CSRF, sem analytics, cache público ou logs de query/tokens.
- Nome/e-mail, aceites e verificação são associados ao aluno fixado pelo convite. Divergência de e-mail não reatribui athleteId: exigir reemissão pelo coach.
- Código proposto de seis dígitos, expiração de dez minutos, limite de tentativas e invalidação após uso/reemissão. Valores finais ficam documentados na implementação aprovada.
- Aceite final verifica novamente expiração/revogação da jornada, destinatário, evidência de verificação e versão dos termos. Persistir aceites e ativar o vínculo na mesma transação. Callback/replay não duplica consentimento ou ativação.
- Estados independentes: convite pendente/utilizado/expirado/revogado; vínculo pendente/ativo/encerrado; Garmin permanece não conectada.
- Interface do coach distingue convite resgatado/utilizado de vínculo efetivamente aceito. Não tratar consumo do link como aceite do acompanhamento.

## Textos e dados demonstrativos

Proposta: documentos de demonstração imutáveis, com finalidade, versão e hash; checkboxes de acompanhamento e tratamento/compartilhamento independentes e não pré-selecionados. Rotular que são exemplos para teste, sem alegar termos jurídicos aprovados, identidade real verificada ou conformidade LGPD concluída. Não inventar assinatura de política real da BalduTraining.

Registrar evidências mínimas, horário, documento/versão e origem demo. Não antecipar coleta de GPS, dados clínicos ou credenciais Garmin. Revisão jurídica, bases legais, retenção e atendimento a menores continuam requisitos antes de qualquer uso real, não são substituídos pelos checkboxes.

## Encerramento público e revogação

Preparar mecanismo com capability de finalidade específica, separada do convite consumido e da sessão de coach, expiração e proteção contra reutilização. Não aceitar athleteId/coachId arbitrários na requisição pública. Retirada de aceite precisa de trilha e efeito operacional definido; nunca sobrescrever a evidência anterior.

Proposta para o teste demo: aluno pode retirar os aceites de acompanhamento e solicitar encerramento por link restrito, registrando a ação e encerrando o vínculo. Reabertura ou novo vínculo exigem outro fluxo aprovado, sem ativação manual escondida. O link de encerramento é exibido uma vez na confirmação, expira em sete dias e é resgatado explicitamente para uma sessão pública de 30 minutos. O treinador pode reemitir o link para compartilhamento manual, revogando o anterior e sua sessão. Não há recuperação por e-mail nesta etapa. Não representar esse mecanismo como revogação Garmin, pois nenhuma conexão existe nesta sprint.

## Plano aprovado

1. Definir migrations e constraints mínimas de Invitation, jornada, verificação e documentos/evidências de consentimento; preservar isolamento composto por coachId.
2. Implementar emissão/revogação/listagem de convites para o dono do aluno, sem acesso cruzado e com auditoria.
3. Implementar resgate público e código demonstrativo, com capabilities, concorrência, rate limiting e mensagens que evitem enumeração.
4. Criar página responsiva baseada no design system: apresentação do coach, formulário, aceites, confirmação e erros/expiração/revogação.
5. Mostrar vínculo atualizado no perfil/lista do coach; Garmin não conectada, sem simular OAuth ou sincronização concluídos.
6. Implementar retirada/encerramento conforme regra aprovada; documentar estados e limites demonstrativos.
7. Testar banco real, concorrência, vínculo errado, reuso, expiração, revogação durante jornada, consentimento/versionamento, CSRF, isolamento e E2E mobile/desktop.
8. Revisar código e docs, atualizar roadmap/PR e aguardar aceite. Não iniciar SPRINT 04.

## Aceite

Treinador demo gera e revoga convite do próprio aluno. Aluno completa jornada demonstrativa válida e somente seu vínculo é ativado, com evidências sintéticas rastreáveis. Convite inválido não expõe dados nem permite aceite. A página pública não concede sessão de coach. Nenhum sucesso de convite representa conexão Garmin.

## Decisões aprovadas e limites

Código de identidade simulado somente no modo demo, sem serviço de e-mail real; textos de aceite explicitamente demonstrativos; convite de 48 horas, jornada de 30 minutos, código de dez minutos/cinco tentativas e retirada de aceites com encerramento do vínculo. Esta aprovação não é aprovação jurídica ou ativação produtiva.

## Consolidação da implementação

InvitationsModule registra os controllers apenas em AUTH_MODE=demo fora de produção. Configuração local de demo também exige origem/bind de loopback. ConsentsService cuida dos documentos e evidências; InvitationsService coordena a transação com o vínculo. Não há fila, provider Garmin ou serviço de e-mail nesta sprint.

Invitation e EnrollmentSession usam hashes de capabilities distintas; a segunda tem código HMAC e cópia cifrada com AES-GCM, legível somente pelo coach dono, dentro do prazo e antes da verificação. O segredo de convite é retornado uma vez no fragmento do link. O browser remove o fragmento ao carregar a página, antes da ação explícita de resgate; assim ele não chega a SSR ou logs HTTP. Abrir/previsualizar não consome o convite. Cookie público HttpOnly/SameSite=Lax, CSRF vinculado ao token e Origin exata; nenhum token no localStorage. Os endpoints de simulação não existem em modo Google.

Locks no relacionamento serializam emissão, resgate, revogação, aceite, edição do destinatário e encerramento. Edição do e-mail revoga convites existentes; aceite e encerramento são transacionais e idempotentes. Um resgate concorrente vence. Revogar convite após aceite não retira consentimentos retroativamente: o encerramento tem fluxo próprio. Convite utilizado e vínculo ativo continuam estados separados.

ConsentDocument guarda conteúdo/versão/hash dos exemplos imutáveis; divergência do conteúdo persistido falha fechada. ConsentEvidence registra aceites e retiradas append-only, com vínculo ao mesmo coach/aluno/enrollment via FKs compostas. Não há endpoint de edição de evidências. WithdrawalAccess possui segredo e sessão separados, uso único no resgate, finalidade de encerramento, expiração/revogação e confirmação explícita; replay da confirmação não duplica efeitos. O encerramento não reabre vínculo, não apaga evidências e não representa desconexão Garmin.

AUTH_SECRET vazio gera chave efêmera no demo. Reinício pode tornar códigos pendentes ilegíveis: o perfil mostra indisponibilidade e permite outro convite; não expõe erro criptográfico. Para continuidade entre reinícios, usar chave local estável válida. TTLs são constantes explícitas nesta sprint, sem tela/configuração adicional. Recuperação por e-mail, verificação real, políticas jurídicas e retenção produtiva ficam pendentes antes de dados reais.
