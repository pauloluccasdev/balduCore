# ADR-008 — Feedback do treinador e histórico de avaliações

Status: proposta para revisão. Preparação da SPRINT 08 autorizada em 19/11/2026; implementação e decisões abaixo aguardam aprovação. IA adiada como DT-IA-01. Nenhuma migration ou funcionalidade criada nesta etapa.

## Problema e base existente

Atividades, splits e análises determinísticas versionadas estão disponíveis, mas não há persistência de observações ou avaliações do treinador. O schema atual não contém CoachFeedback. A análise já exige vínculo ativo e aceites vigentes, com lock do relacionamento e autorização por coach. Reutilizar essas regras, sessão, CSRF, auditoria e validação de entradas.

As referências Feedback do treinador dark/light em docs/design/references orientam diário, resumo da atividade, análise da execução, pontos de atenção, observações, decisões, validação e histórico. Preservar tokens, sidebar e composição de duas colunas no desktop, adaptadas a uma coluna no celular. Não copiar números/nomes do PNG como dados persistidos. Hipóteses de IA exibidas no protótipo ficam indisponíveis enquanto DT-IA-01 estiver pendente.

## Escopo proposto

- Diário associado a uma atividade, acessível pelo detalhe, análise esportiva e histórico do aluno. Perfil do aluno lista diários das suas atividades; anotação geral sem atividade não entra nesta entrega.
- Campos opcionais: análise da execução, observações e decisões técnicas em texto. Decisões não criam prescrição ou envio Garmin.
- Pontos de atenção sobre atividade inteira ou intervalo de tempo/distância explícito; quilômetros são intervalos de distância. Categoria e contexto registrados pelo treinador, com origem observação do treinador ou relato do aluno. Não inferir causa/sensação de sensores; nenhuma categoria vem pré-selecionada.
- Avaliação opcional dos eventos determinísticos realmente presentes: correto, parcial ou incorreto; não avaliado permanece distinto. Referenciar snapshot, versão e identificador do evento, sem alterar a análise de origem.
- Salvar explicitamente e consultar revisões anteriores somente para leitura; estados vazio, erro, conflito, salvando e salvo, com aviso de alterações não salvas.
- IA e avaliação de hipóteses geradas por IA permanecem pendentes. Não preencher hipóteses nem resultados fictícios. Sem notificação, compartilhamento com aluno, anexos ou exportação nesta sprint.

## Alternativas e recomendação

| Tema      | Recomendação                                                                                                                                             | Alternativa / trade-off                                                                                                         |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Agregado  | Um CoachFeedback por atividade e treinador, com versão corrente e revisões imutáveis CoachFeedbackRevision.                                              | Várias notas independentes simplificam inserção, mas fragmentam o diário da referência e exigem outro fluxo de edição.          |
| Conteúdo  | Snapshot JSONB validado por schema em cada revisão para textos, pontos e avaliações; referências relacionais a coach/aluno/atividade e análise opcional. | Tabelas por ponto/campo/avaliação permitem consultas individuais, mas antecipam joins e ciclo de vida sem consumidor atual.     |
| Edição    | Controle otimista por versão; atualização condicional, nova revisão e auditoria na mesma transação. Conflito retorna 409, preservando o texto local.     | Sobrescrever a última edição perde alterações concorrentes; lock de longa duração exige expiração e recuperação desnecessárias. |
| Histórico | Revisões completas para leitura; corrigir publicando nova revisão, sem edição destrutiva ou exclusão pela UI.                                            | Somente audit log não permite reconstruir conteúdo; event sourcing acrescenta complexidade desnecessária.                       |
| Contexto  | Guardar revisão/hash da atividade e ID/revisão do snapshot de análise; validar eventos e intervalos no servidor.                                         | Somente IDs do evento atual perdem a proveniência quando a atividade é atualizada.                                              |

O treinador autenticado é o autor, derivado da sessão, nunca de campo enviado pelo cliente. FKs compostas vinculam CoachFeedback ao mesmo coach/aluno/atividade; revisão pertence ao mesmo agregado e tem unicidade por feedback/versão. Uma revisão referencia no máximo um snapshot de análise da mesma atividade, validado por FK composta quando aplicável; adicionar a chave única necessária ao modelo existente somente após aprovação. Corpo da revisão é limitado, não um dump de séries.

Publicação bloqueia relacionamento antes de validar elegibilidade, contexto e versão. Reuso de versão antiga resulta em conflito, inclusive em reenvio após resposta de rede perdida; recarregar a versão corrente para confirmar o resultado. Não criar várias revisões iguais por duplo clique. Conteúdo vazio inicial não cria diário; permitir limpar campos em nova revisão preservando histórico. Ausência de análise não impede observações da atividade, mas impede avaliar eventos inexistentes.

Atualização da atividade mantém as revisões antigas com aviso de contexto desatualizado. Não reaplicar automaticamente avaliações ou trechos antigos à revisão nova. Para salvar após atualização, exigir versão/hash atuais e confirmação explícita do novo contexto, retirando avaliações antigas da nova revisão. Retirada de acompanhamento bloqueia leitura e escrita, inclusive histórico e acesso direto por ID; não apagar silenciosamente evidência histórica. Retenção/exclusão produtiva continuam sujeitas à política aprovada, sem prometer retenção indefinida.

## Contratos e limites propostos

Rotas REST internas BalduCore (propostas): GET e PUT /activities/:id/feedback; GET /activities/:id/feedback/revisions com paginação; GET /activities/:id/feedback/revisions/:version; GET /athletes/:id/feedback com paginação. PUT inclui expectedVersion (zero para criação), revisão/hash da atividade e corpo validado. Histórico não é endpoint público nem disponível ao aluno.

Proposta de limites: 4000 caracteres por campo textual principal, 20 pontos por revisão, contexto de ponto até 1000 caracteres, até 100 avaliações de eventos, corpo até 64 KiB e páginas de até 20 itens. Buscar eventos paginados da análise quando necessário, sem supor que a primeira página representa todos. Intervalos finitos, início menor que fim, eixo/unidades explícitos e limites compatíveis com os dados disponíveis; não inventar quilometragem com distância ausente. Limites definitivos fazem parte da aprovação deste ADR.

Sem novas dependências, fila, serviço externo ou tabela de hipóteses. Feedback é síncrono e transacional. Logs/auditoria guardam ação, recurso, autor e instante, nunca os textos livres. Renderizar como texto, sem HTML arbitrário. Rate limiting e proteção de mutação seguem os mecanismos existentes.

## Plano de implementação após aprovação

1. Migration versionada dos agregados/revisões e restrições; schemas, autorização, transação de edição e auditoria.
2. API de consulta/salvamento/histórico e documentação; testes de isolamento, vínculo/aceites, concorrência e contexto obsoleto.
3. Tela contextual conforme referências dark/light, formulário, pontos, avaliações determinísticas e histórico; entradas pelo aluno/atividade/análise, sem novo item decorativo na sidebar.
4. E2E de salvar/reabrir/editar/histórico/conflito e bloqueio anônimo/A-B, desktop e celular; revisão visual nos dois temas, teclado e mensagens de erro.
5. Build, lint, tipos, formatação, testes pertinentes e migration em banco novo; atualizar documentação e PR para revisão. Não iniciar SPRINT 09 automaticamente.

## Critérios de aceitação e riscos

O treinador salva e reabre seu diário e decisões; edição mantém autoria/data/conteúdo anteriores; duas escritas concorrentes têm somente um vencedor. Coach B não lê, altera ou lista feedback de A, incluindo IDs de revisão; encerramento/retirada bloqueiam todas as rotas. Eventos pertencem ao snapshot exato, segmentos inválidos e contexto obsoleto são rejeitados. Falha de persistência não gera revisão parcial nem limpa o formulário. Nada atribui sensações ao aluno sem relato registrado. Feedback continua funcional sem provider de IA e sem análise concluída.

Riscos: texto livre pode conter dados sensíveis; minimizar exposição e não enviá-lo a fornecedores. Snapshots exigem limite de tamanho e política de retenção. Distinguir contexto histórico de atual para não apresentar avaliação antiga como válida para atividade atualizada. Ainda não há aprovação de dados reais ou deploy produtivo. Docker/CI permanecem limitações ambientais documentadas, sem alegar execução nesta preparação.
