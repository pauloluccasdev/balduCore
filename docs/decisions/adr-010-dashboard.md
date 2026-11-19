# ADR-010 — Dashboard consolidado e semântica dos indicadores

Status: proposta para revisão. SPRINT 10 autorizada para preparação em 19/11/2026, após merge do PR #11 (fea1059). Endpoint, regras dos indicadores e tratamento dos estados abaixo aguardam aprovação antes da implementação. IA permanece adiada como DT-IA-01.

## Problema e diagnóstico

A página inicial autentica o treinador, mas Dashboard importa demo-data.ts e apresenta cinco alunos, conexões e atividades fixas, insights ilustrativos e ações desabilitadas. Não consulta recursos persistidos. Os testes de fundação ainda verificam quantidades dessas fixtures e precisarão passar a verificar estados vazios/dados persistidos autorizados.

As referências Dashboard dark/light foram reinspecionadas: preservar cinco cards, atenção/insights lado a lado, atividades/planejamento na segunda linha e faixa de alunos/status. Usar tokens, sidebar, tipografia e temas existentes. Dados persistidos do modo demo continuam sintéticos; “consolidado” não significa integração Garmin oficial ou autorização para dados reais. Não inventar identidade, métrica ou interpretação para preencher cards.

## Arquitetura e alternativas

| Alternativa                                                         | Benefício                                                                                     | Trade-off                                                                                                                       |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| GET /dashboard com consultas/agregações no PostgreSQL — recomendada | Contrato próprio para a tela, totais sobre todo o conjunto autorizado e snapshot consistente. | Backend precisa definir claramente escopos, unidades, cobertura e limites; consultas devem ser medidas antes de otimizar.       |
| Frontend reúne endpoints de alunos/atividades/monitoramento         | Menos contrato novo.                                                                          | Paginação não representa total para somar; snapshots separados podem divergir; mais requisições e lógica de domínio no cliente. |
| Tabelas de contadores/cache/materialização adicional                | Reduz custo de leitura em escala.                                                             | Introduz invalidação, conciliação e defasagem sem medição que justifique agora.                                                 |

Propor DashboardModule no monólito, com serviço de leitura e DTO próprio. Não adicionar tabelas, migration, fila, SDK ou dependência. Consultas na mesma transação Repeatable Read e com coachId da sessão. Backend calcula totais e cobertura; frontend formata unidades e navega. Não somar somente as atividades retornadas na página ou limitar o universo ao top 5 da tela.

Reutilizar predicados de elegibilidade/consentimentos das atividades e o SQL autorizado da central dentro da mesma transação, sem HTTP interno para outro controller e sem copiar uma segunda definição divergente de “pendência”. Extração pequena de predicado/função de consulta é aceitável para evitar duplicação; não reorganizar os módulos por estética.

## Regras dos indicadores — para aprovação

| Indicador/bloco                 | Definição recomendada                                                                                                                                                                                                                                                                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Total de alunos                 | Quantidade de cadastros Athlete do próprio coach, com detalhamento de vínculos pending/active/ended; fotografia atual, independente do período esportivo. É gestão cadastral já autorizada na 02, não acesso a histórico de vínculo encerrado.                                                                                                 |
| Conectados à Garmin             | Conexões em connected entre vínculos ativos com aceites vigentes. Separar provider/origem sintética; mock aparece explicitamente como simulação. Ausência de conexão equivale a não conectada na apresentação, sem criar registro. connected não prova sincronização recente nem disponibilidade de worker. Independente do período esportivo. |
| Atividades recentes             | COUNT de Activity autorizada iniciada no período UTC e modalidade selecionados; uma atividade por ID/revisão corrente, sem somar entregas ou revisões antigas. Importação ainda sem publicação não conta como atividade.                                                                                                                       |
| Volume por modalidade           | Distância por modalidade, com quantidade de valores conhecidos e ausentes. Zero recebido permanece zero; todos ausentes resultam em indisponível, não zero. Corrida/ciclismo em km, natação em m; caminhada/outras não são descartadas. Não misturar modalidades para comparar ritmo.                                                          |
| Merecem atenção                 | Número de atividades distintas no período/modalidade com análise determinística concluída da revisão/hash/algoritmo atuais e ao menos um evento. Não é contagem de regras, splits, alertas ou diagnóstico. Mostrar cobertura: quantas atividades têm análise atual e quantas ainda não têm.                                                    |
| Lista de atividades com eventos | Até cinco atividades elegíveis com análise atual e eventos, ordenadas por início UTC e ID, com contagem de eventos e link para análise. Não gerar causas ou sensações. Total pode exceder a lista e oferece “ver atividades/análises” com filtros coerentes.                                                                                   |
| Pendências operacionais         | Resumo separado de falhas e ausência de feedback ativas, conforme regras/autorizações da central, e até três itens com link. O período aqui usa atualização do item (como na central), explicitamente diferente do início da atividade. Não somar esses itens ao indicador esportivo “merecem atenção”.                                        |
| Atividades recentes — tabela    | Até cinco atividades por início UTC/ID, com aluno, modalidade, data, métricas disponíveis e estado real da análise atual. Links para atividade/análise/feedback. Total do card é o conjunto completo, não as cinco linhas.                                                                                                                     |
| Alunos e status                 | Até seis cadastros recentes do próprio coach, com vínculo e link para gestão. Estado Garmin/dados esportivos somente com vínculo ativo e aceites vigentes; para os demais, informar indisponibilidade sem expor estado de conexão retido. “Ver alunos” abre gestão completa; não esconder que o bloco é limitado.                              |

Garmin oficial continua bloqueada. Não tratar FIT importado como autorização Garmin; o aluno pode ter atividades manuais e conexão não conectada. Não consultar Garmin ou renovar tokens para renderizar o dashboard. Informações de integração devem indicar o estado local e, quando disponível, última sincronização local, sem alegar tempo real.

Não somar tempos de bases timer/elapsed/provided em uma duração esportiva homogênea nem calcular ritmo pela média de ritmos individuais. A referência pede volume de distância por modalidade; esta entrega não adiciona agregação de tempo misturado ou gráfico de carga/intensidade. Registros sintéticos/reais devem ter proveniência explícita; se o conjunto vier a conter ambas as origens, separar seus subtotais, sem apresentar um volume sintético como realizado por pessoas reais. Não criar source Garmin oficial ainda inexistente.

## Período, filtros e navegação

GET /dashboard aceita period=7|30|90 (padrão 30) e sport opcional com modalidades internas existentes. Período composto de dias UTC inclusivos até hoje: início à meia-noite de hoje menos N−1 dias e limite exclusivo à meia-noite seguinte. O contrato devolve from/to e generatedAt; cálculos não dependem do relógio do navegador ou do fuso da sessão PostgreSQL. Atividades futuras fora do dia corrente não entram. Datas faltantes não são reconstruídas por LLM.

Período/modalidade afetam somente os blocos esportivos; alunos e conexão são fotografias atuais, rotuladas como tais. Pendências operacionais seguem o intervalo de atualização da central e não recebem filtro de modalidade, pois uma falha de FIT/conexão pode não ter modalidade disponível. Essa distinção deve aparecer na UI e nos links, sem prometer o mesmo recorte para métricas de naturezas diferentes.

Links para atividades preservam from/to/sport. Para análises, respeitar os filtros de fato suportados pela rota de destino: não adicionar query decorativa que o backend ignore. Se o índice de análise ainda não propagar esses filtros existentes da listagem, ajustar a passagem de parâmetros sem alterar os cálculos da SPRINT 06. Links da central preservam seu recorte de atualização, estado ativo e categoria pertinente; navegação para perfil não concede acesso esportivo novo.

Limites de prévias são explícitos no DTO e na tela; totais são consultados separadamente sobre todo o conjunto. GET não escreve, enfileira, reconcilia ou marca leitura. Atualização manual e troca de filtro consultam novamente o backend; sem polling obrigatório, comparação percentual com período anterior ou notificações externas nesta sprint.

## IA adiada e planejamento

Preservar a geometria do card “Insights relevantes”, mas mostrar estado informativo “IA adiada” com referência ao débito DT-IA-01, sem os textos fixos de exemplo. Não chamar eventos determinísticos de análise por IA. Os eventos atuais ficam no bloco esportivo, com evidências acessíveis na análise. Alternativa seria trocar o card por outro conteúdo; recomendar manter o espaço da referência para evitar redesenho e uma falsa entrega da 07.

Planejamento continua como estado futuro MVP 2, sem agenda, treinos ou contagem zero de prescrição tratada como funcionalidade existente. Manter rótulo e ação desabilitada claramente identificados. Remover avatar/textos que alegam ausência de sessão quando o coach já está autenticado; usar somente identidade da sessão existente. Eliminar importação de demo-data na página de produto e remover fixtures que ficarem sem consumidor, sem excluir as oito referências visuais.

## Autorização, consistência e falhas

Cadastros básicos seguem as permissões da gestão de alunos; toda métrica/lista esportiva exige vínculo ativo e aceites vigentes, além de ownership. Retirada deve remover dados dos totais, volumes, análises, listas e pendências na próxima consulta. Não confiar em IDs do cliente, no cache compartilhado ou em análise/projeção antiga como autorização.

API com sessão, rate limit e filtros estritos, sem cache compartilhado. Uma transação de leitura oferece snapshot coerente para o conjunto; não adicionar tabelas de métricas. Corrupção/indisponibilidade de snapshot de análise deve deixar o bloco derivado explicitamente indisponível, preservando indicadores básicos que foram calculados de forma válida; análise ausente/queued é cobertura incompleta, não erro ou “sem eventos”. Não relaxar o schema para transformar conteúdo inválido em zero.

Falha de banco/consulta impede um snapshot novo e retorna erro sanitizado. Na primeira carga, exibir indisponibilidade com retry; em atualização, pode manter a última resposta bem-sucedida com aviso e horário, sem apresentá-la como consulta atual. Não montar um dashboard novo com metade de totais antigos e metade novos. Integração desabilitada e IA adiada são estados de capacidade, não falhas de consulta. Não há chamada externa opcional capaz de derrubar as métricas básicas.

## Plano após aprovação

1. Definir DTO, predicados compartilhados mínimos, semântica de períodos/cobertura e consultas autorizadas; testes de totais conhecidos, zero/null, modalidades, fronteira UTC e isolamento A/B.
2. GET /dashboard e OpenAPI, snapshot consistente, limites das prévias e estados de erro/indisponibilidade; testar retirada, revisão obsoleta e estado Garmin sem inferir conexão a partir de FIT.
3. Substituir fixtures do dashboard preservando referências dark/light, cinco cards e composição; filtros, ações e links reais, IA adiada e planejamento futuro explícitos, estados vazio/erro e atualização manual.
4. Atualizar os testes de fundação que dependem das quantidades fictícias; E2E com dados persistidos de teste, filtros, navegação, falha de atualização, temas/responsividade e isolamento. Manter fixtures só nos testes que as utilizem.
5. Rodar checks pertinentes, revisar diff e atualizar README/arquitetura/roadmap/PR; não iniciar a SPRINT 11 automaticamente.

## Critérios de aceitação e riscos

Um coach sem dados vê zero de contagem e estados vazios verdadeiros, sem os cinco alunos/oito atividades de exemplo; métricas ausentes usam indisponível, não zero fabricado. Um coach com atividades persistidas vê totais reproduzíveis e links funcionais nos recortes declarados. Mais de cinco atividades/seis alunos continuam contabilizados corretamente. Revisão antiga/retirada de vínculo não sustentam análise atual ou totais esportivos; nomes e dados de outro coach não aparecem em nenhum bloco.

Filtros mantêm distinção entre fotografia cadastral, início de atividade e atualização de pendências. Erro não produz números demonstrativos ou falso sucesso; ausência de análise não declara ausência de evento esportivo. UI mantém identidade visual e acessibilidade básica nos três formatos. IA permanece DT-IA-01 e não é marcada entregue.

Riscos: consultas de agregação podem precisar de índices após medição; sem criar cache/materialização preventivamente. A central pode precisar de conciliação de fontes anteriores à 09; pendências devem refletir o escopo disponível e não prometer reconstrução histórica completa. Dados reais, retenção/exclusão, login Google/integração oficial e ativação do CI continuam pendentes. Preparação documental apenas: nenhum endpoint, dependência, migration ou funcionalidade implementada nesta etapa.
