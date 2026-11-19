# ADR-005 — Atividades, séries e importação FIT

Status: aprovado e implementado; SPRINT 05 mesclada no PR #7 (78eb10e). SDK oficial, tabelas relacionais, decodificação isolada com descarte do bruto e limites aprovados na instrução “pode continuar então”. Data: 2026-11-18.

## Base confirmada

PR #5 mesclado em main em 2026-11-18 (2cd6f20). Branch sprint/05-atividades criada dessa base. Activity já guarda envelope mínimo mock, com vínculo ativo/consentimentos como fonte de autorização; worker pg-boss, revisão, idempotência e fencing existentes serão preservados. Integração oficial permanece indisponível.

## Escopo autorizado e critérios

Lista de atividades por treinador/aluno, busca e filtros de modalidade/período/origem, métricas com disponibilidade/unidades, detalhes, splits/séries recebidos, status de importação/processamento, navegação contextual, estados vazios/erro e testes. Visual baseado nos PNGs Atividades dark/light: quatro indicadores, filtros, tabela com scroll interno e resumo lateral. Não copiar números, insights ou rótulos de atividade real dos exemplos; não criar rotas decorativas. Detalhe apresenta dados e disponibilidade; gráficos sincronizados, seleção/comparação de segmentos, regras esportivas e IA ficam na SPRINT 06+.

## Decisões aprovadas

| Tema                 | Recomendação                                                                                                                                                                                                                                                                                                              | Alternativa/trade-off                                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Séries/splits        | ActivitySample e ActivitySplit com FK composta coach/aluno/atividade, índice/ordem e inserção em lotes, vinculados à revisão atual da atividade.                                                                                                                                                                          | JSONB único simplifica escrita, mas dificulta consultas por intervalo, limites e validação por amostra. Tabelas custam mais linhas e exigem publicação transacional das revisões.                                                       |
| Parser               | **Decisão aprovada:** SDK oficial @garmin/fitsdk 21.222.0, versão fixada, com Decoder/Stream e verificação de integridade/CRC. Escolha confirmada após esclarecimento de gratuidade e licença própria.                                                                                                                    | fit-file-parser 6.2.10/MIT foi avaliado, mas não escolhido. Não confundir a licença do SDK oficial com MIT ou com acesso às APIs Garmin Connect.                                                                                        |
| Arquivo bruto        | Receber até 5 MiB como binário, autenticar/autorizar antes de decodificar, validar assinatura/tamanho/CRC e uma única sessão esportiva. Decodificar em Worker Thread com prazo de 5 s e heap de 128 MiB; máximo de 20 mil amostras/2 mil splits e limites de mensagens. Descartar bytes após decodificação.               | Guardar FIT cifrado permitiria reprocessar parser, mas adicionaria retenção/rotação/storage e preservaria GPS/identificadores sem necessidade atual. Não reter bruto reduz exposição, em troca de exigir novo envio para redecodificar. |
| Etapas               | Pré-validar/decodificar de forma assíncrona e isolada durante o upload; persistir somente DTO normalizado mínimo + intenção/job pg-boss atomicamente. ACK 202 após durabilidade; worker publica atividade/amostras/splits na mesma transação.                                                                             | Enfileirar FIT bruto exigiria armazenamento cifrado e política adicional. Parse na thread principal poderia bloquear a API.                                                                                                             |
| Independência Garmin | Importação manual de desenvolvimento disponível no demo local mesmo com GARMIN_PROVIDER=disabled. Fila/worker do backend passam a atender atividades sem exigir conexão ou credenciais Garmin.                                                                                                                            | Exigir mock conectado para importar simularia uma autorização inexistente e contrariaria a alternativa manual prevista no roadmap.                                                                                                      |
| Origem e identidade  | Activity manual tem connectionId opcional e vínculo direto ao coach/aluno. Source=manual_fit, ambiente demo identificado, nunca prova de sincronização/autenticidade Garmin. Somente arquivos de teste na fase atual, com confirmação explícita do coach. Não guardar GPS, nome de arquivo, IDs de dispositivo/pessoa.    | Habilitar dados reais/produção requer rever identidade/textos e políticas pendentes; esta sprint não autoriza isso por inferência.                                                                                                      |
| Duplicidade          | Hash por treinador/arquivo: reenvio retorna o mesmo processamento; envio do mesmo arquivo para outro aluno do mesmo coach falha sem reassociar. Outro coach permanece independente. Possível duplicata entre origens por início/modalidade gera aviso rastreável; não descartar/mesclar silenciosamente por similaridade. | Deduplicação por aproximação pode apagar treinos legítimos ou associar pessoa errada. Hash de arquivo não prova equivalência entre exportações diferentes.                                                                              |

Ausência permanece null; unidades internas m/s, m, s, bpm e cadência com base explícita do arquivo. Separar tempo de cronômetro/decorrido quando fornecidos. Ritmo médio só é calculado com distância e duração válidas, indicando a base; não fabricar splits ou séries de médias. Arquivo multissessão/multiesporte sem política definida será rejeitado com mensagem clara. Amostras desordenadas/sem timestamp e métricas inválidas têm política explícita/qualidade, sem inventar valores.

## Plano aprovado

1. Evoluir Activity e adicionar splits/samples/importação com constraints e migrations versionadas; autorizar cada recurso pelo coach e vínculo/aceites vigentes.
2. Integrar persistência normalizada ao worker existente, preservando geração/revisão/fencing; publicação de uma nova revisão substitui detalhes atomicamente e remove séries obsoletas quando ausentes.
3. Implementar upload FIT de desenvolvimento com validação e isolamento, status persistido, idempotência, falhas sanitizadas e cancelamento quando acompanhamento é encerrado.
4. Construir lista, filtros, resumo rápido e detalhe de dados, com navegação a partir do perfil; evitar indicadores não disponíveis e mostrar proveniência.
5. Testar cálculos/unidades, ausência/incompletude, FIT válido/corrompido/excessivo, concorrência/replay/isolamento, worker e E2E dos fluxos; atualizar docs/roadmap e PR para main.

A aprovação cobre as recomendações da tabela e os limites descritos. A instalação e o smoke do SDK foram aprovados previamente e mergeados no PR #6; a implementação usa novo PR na branch sprint/05-atividades-implementacao.

## Fontes consultadas

- [fit-file-parser, mantenedor](https://github.com/jimmykane/fit-parser) e metadados npm consultados em 2026-11-18: versão 6.2.10, MIT, atualização em 2026-11-17.
- [SDK oficial JavaScript](https://github.com/garmin/fit-javascript-sdk), [licença própria](https://github.com/garmin/fit-javascript-sdk/blob/main/LICENSE.txt).
- [FIT, protocolo e CRC](https://developer.garmin.com/fit/protocol/).

Não confundir parser de arquivo local com acesso ao Garmin Connect ou aprovação do programa Business.

## Histórico das alternativas revisadas

Na preparação inicial, nenhuma alteração de produto, migration ou instalação de parser havia sido iniciada. Após a escolha explícita do responsável técnico, o SDK oficial foi instalado para validação independente das decisões ainda pendentes. A autorização da sprint não substitui a revisão das escolhas abaixo.

### 1. Persistência das séries

- **A — Tabelas relacionais (recomendada):** métricas resumidas em Activity; uma linha por amostra/split, com chaves e ordem. Favorece consultas de intervalos/quilômetros na SPRINT 06 e validação/integridade. Exige inserções em lotes, índices e mais linhas no banco; sem particionamento antecipado.
- **B — JSONB por atividade:** mesmo resumo relacional e um documento com séries/splits. Menos linhas e escrita simples; consultas por trecho e atualização parcial passam a depender mais de leitura/validação do documento na aplicação. Não elimina validação por ponto nem necessidade de limites.
- **C — Blocos JSONB:** agrupa amostras em blocos ordenados. Reduz número de linhas e permite leitura de blocos; adiciona política de tamanho/recorte, reconstrução e versionamento. Adiar até volume justificar a complexidade.

### 2. Parser de arquivo local

- **A — fit-file-parser 6.2.10 (alternativa avaliada, não escolhida):** MIT, TypeScript/ESM e Node >=20 segundo documentação do mantenedor; usar force=false/strict=true para checksums/estrutura. Maior responsabilidade de acompanhar compatibilidade frente ao SDK oficial. Compatibilidade efetiva será comprovada por fixtures/testes após aprovação.
- **B — @garmin/fitsdk 21.222.0 (escolhido e aprovado):** SDK oficial, com Decoder/Stream e verificação de integridade; licença própria da Garmin, com termos diferentes de MIT. O responsável técnico escolheu este SDK após esclarecimento de gratuidade e licença própria. Isso não autoriza integração Garmin Connect ou outros usos não discutidos.

Ambos decodificam arquivos fornecidos, sem autenticar Garmin Connect ou obter atividades por APIs não oficiais. Não é necessário acesso Business para inspecionar a alternativa técnica de parser local; isso não constitui aprovação de uso de uma licença nem autorização da integração comercial.

### 3. Recebimento e retenção do FIT

- **A — Decodificar isoladamente antes do ACK e descartar bruto (recomendada inicialmente):** upload espera até cinco segundos pela validação em thread limitada; erros estruturais retornam na requisição. Só DTO esportivo permitido entra no banco/fila; worker publica o resultado. Não guarda GPS/identificadores ocultos no arquivo. Nova versão do parser exige reenviar o FIT. O ACK confirma durabilidade do DTO, não do arquivo original.
- **B — FIT cifrado temporário + decodificação no worker:** ACK rápido após persistência e validação inicial; worker executa decode/normalização com limites. Permite retry/redecodificação sem novo upload enquanto houver bruto. Requer chave de importação estável, prazo e rotina de limpeza, tratamento de backlog/rotação e proibição de expor bruto. Prazo sugerido para revisão: apagar após sucesso/cancelamento; falhas no máximo 24 horas. Nenhum prazo é implementado/aprovado nesta proposta.

Ambas usam PostgreSQL/pg-boss existentes e precisam cancelar/revalidar publicação após encerramento do vínculo. Object storage não é necessário para os limites locais propostos. Rejeitar multissessão e limites excedidos preserva o arquivo sem fabricar resultados parciais silenciosos.

### Decisões fechadas

SDK oficial @garmin/fitsdk, alternativa A para persistência e alternativa A para recebimento. Limites aprovados: 5 MiB, 5 s, heap de 128 MiB, 20 mil amostras e 2 mil splits; somente demo local e arquivos de teste. Máximo de 60 mil mensagens, uma decodificação por treinador e duas por processo da API. Não há habilitação produtiva.

## Preparação do SDK oficial — 2026-11-18

Após a instrução “então vamos utilizá-lo”, @garmin/fitsdk 21.222.0 foi fixado no pacote da API e no lockfile. Testes com FIT sintético gerado pelo Encoder validam import ESM/tipos, CRC, dados de sessão/lap/record, unidades, zero válido e métricas ausentes, além de adulteração/truncamento/assinatura inválida. Sem SDK no frontend, sem endpoint de upload, sem mudanças de persistência e sem aprovação presumida das escolhas restantes.

Resultado da preparação: build TypeScript da API e 11 testes passaram; os testes FIT exercitam o SDK com mensagens tipadas e dados sintéticos. Lint e formatação passaram. Nenhum decoder foi conectado a rotas ou worker antes das decisões restantes.

## Implementação para revisão

Activity ganha FK direta ao vínculo, conexão opcional, métricas resumidas e tempo de cronômetro/decorrido separados. ActivitySample/ActivitySplit usam FK composta de treinador/aluno/atividade e ordinal; FitImport guarda hash por coach, status, staging normalizado e referência ao resultado. Nenhum FIT bruto, nome de arquivo, GPS ou identificador de dispositivo é persistido. O JSON temporário é apagado após publicação, cancelamento ou falha terminal; metadados/hash permanecem para idempotência. Backlog normalizado persiste enquanto aguarda processamento; política produtiva de retenção/exclusão continua pendente.

POST /athletes/:id/fit-imports exige sessão, origem, CSRF, limite de requisições, vínculo/aceites atuais e X-Demo-File=true. Binário application/octet-stream limitado antes do decoder; assinatura/CRC e estrutura checados pelo SDK em Worker Thread. Confirmação demonstrativa é declaração do treinador, não prova automática de que o FIT é sintético. Validação é repetida sob lock antes de persistir e antes de publicar. ACK 202 indica staging/job transacionais; não indica atividade publicada. Importação e dados esportivos têm estados separados.

Fila pg-boss existente é iniciada no demo mesmo com Garmin desabilitada. Jobs antigos permanecem compatíveis; novos jobs FIT carregam somente id e discriminante, nunca métricas ou bytes. Worker revalida vínculo/aceites, namespace, token de execução e prazo; publica resumo e filhos numa transação, com até cinco tentativas. Encerramento cancela staging sob o mesmo lock. Desconectar Garmin não cancela importações manuais. Reenvio retorna a importação original; falha terminal exige revisão e novo arquivo, sem reabrir silenciosamente o mesmo hash. Nova revisão mock substitui detalhes e remove séries anteriores ausentes.

Consultas autorizadas oferecem lista paginada e filtros por aluno/nome, modalidade, origem, período UTC inclusivo e disponibilidade de amostras. Somatórios informam quantos registros possuem cada métrica. Detalhe, splits e amostras paginados reaplicam autorização; não há acesso depois do encerramento. Possível duplicata entre origens com mesmo início/modalidade é avisada, sem fusão automática. Unidades explícitas: m, s, m/s, bpm e ciclos/min; ritmo calculado apenas com duração/distância positivas, com base identificada. Não calcular médias de séries incompletas para preencher resumos ausentes.

Limites: sem gráficos, eventos esportivos, seleção de segmentos ou IA (SPRINT 06+), sem FIT multissessão/multiesporte, sem arquivos de pessoas reais e sem garantia de equivalência entre arquivos de hashes distintos. Threads e semáforo são controles por processo; escalar múltiplas réplicas exigirá revisar quotas globais. Docker e CI permanecem pendências ambientais herdadas.

Os limites da thread configuram heap V8 (112 MiB old generation + 16 MiB young generation), stack de 4 MiB e prazo de parede de cinco segundos; não são quota de memória RSS/CPU do processo inteiro. Buffers externos são limitados pelo tamanho de upload. A publicação tem transação de até 15 segundos e lease do job de 30 segundos.
