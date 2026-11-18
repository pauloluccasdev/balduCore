# ADR-005 — Atividades, séries e importação FIT

Status: proposta para revisão do responsável técnico. SPRINT 05 autorizada; decisões novas de persistência e processamento abaixo aguardam aprovação antes da implementação dependente. Data: 2026-11-18.

## Base confirmada

PR #5 mesclado em main em 2026-11-18 (2cd6f20). Branch sprint/05-atividades criada dessa base. Activity já guarda envelope mínimo mock, com vínculo ativo/consentimentos como fonte de autorização; worker pg-boss, revisão, idempotência e fencing existentes serão preservados. Integração oficial permanece indisponível.

## Escopo autorizado e critérios

Lista de atividades por treinador/aluno, busca e filtros de modalidade/período/origem, métricas com disponibilidade/unidades, detalhes, splits/séries recebidos, status de importação/processamento, navegação contextual, estados vazios/erro e testes. Visual baseado nos PNGs Atividades dark/light: quatro indicadores, filtros, tabela com scroll interno e resumo lateral. Não copiar números, insights ou rótulos de atividade real dos exemplos; não criar rotas decorativas. Detalhe apresenta dados e disponibilidade; gráficos sincronizados, seleção/comparação de segmentos, regras esportivas e IA ficam na SPRINT 06+.

## Decisões propostas

| Tema                 | Recomendação                                                                                                                                                                                                                                                                                                              | Alternativa/trade-off                                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Séries/splits        | ActivitySample e ActivitySplit com FK composta coach/aluno/atividade, índice/ordem e inserção em lotes, vinculados à revisão atual da atividade.                                                                                                                                                                          | JSONB único simplifica escrita, mas dificulta consultas por intervalo, limites e validação por amostra. Tabelas custam mais linhas e exigem publicação transacional das revisões.                                                       |
| Parser               | fit-file-parser 6.2.10 fixado, MIT, publicação/manutenção recente confirmadas no npm e fonte do mantenedor. Usado só para arquivo local, não é API Garmin nem automação de conta.                                                                                                                                         | SDK oficial @garmin/fitsdk 21.222.0 tem licença própria com aceitação/obrigações específicas; não será adotado silenciosamente. Parser artesanal aumenta manutenção e risco de interpretar incorretamente o formato.                    |
| Arquivo bruto        | Receber até 5 MiB como binário, autenticar/autorizar antes de decodificar, validar assinatura/tamanho/CRC e uma única sessão esportiva. Decodificar em Worker Thread com prazo de 5 s e heap de 128 MiB; máximo de 20 mil amostras/2 mil splits e limites de mensagens. Descartar bytes após decodificação.               | Guardar FIT cifrado permitiria reprocessar parser, mas adicionaria retenção/rotação/storage e preservaria GPS/identificadores sem necessidade atual. Não reter bruto reduz exposição, em troca de exigir novo envio para redecodificar. |
| Etapas               | Pré-validar/decodificar de forma assíncrona e isolada durante o upload; persistir somente DTO normalizado mínimo + intenção/job pg-boss atomicamente. ACK 202 após durabilidade; worker publica atividade/amostras/splits na mesma transação.                                                                             | Enfileirar FIT bruto exigiria armazenamento cifrado e política adicional. Parse na thread principal poderia bloquear a API.                                                                                                             |
| Independência Garmin | Importação manual de desenvolvimento disponível no demo local mesmo com GARMIN_PROVIDER=disabled. Fila/worker do backend passam a atender atividades sem exigir conexão ou credenciais Garmin.                                                                                                                            | Exigir mock conectado para importar simularia uma autorização inexistente e contrariaria a alternativa manual prevista no roadmap.                                                                                                      |
| Origem e identidade  | Activity manual tem connectionId opcional e vínculo direto ao coach/aluno. Source=manual_fit, ambiente demo identificado, nunca prova de sincronização/autenticidade Garmin. Somente arquivos de teste na fase atual, com confirmação explícita do coach. Não guardar GPS, nome de arquivo, IDs de dispositivo/pessoa.    | Habilitar dados reais/produção requer rever identidade/textos e políticas pendentes; esta sprint não autoriza isso por inferência.                                                                                                      |
| Duplicidade          | Hash por treinador/arquivo: reenvio retorna o mesmo processamento; envio do mesmo arquivo para outro aluno do mesmo coach falha sem reassociar. Outro coach permanece independente. Possível duplicata entre origens por início/modalidade gera aviso rastreável; não descartar/mesclar silenciosamente por similaridade. | Deduplicação por aproximação pode apagar treinos legítimos ou associar pessoa errada. Hash de arquivo não prova equivalência entre exportações diferentes.                                                                              |

Ausência permanece null; unidades internas m/s, m, s, bpm e cadência com base explícita do arquivo. Separar tempo de cronômetro/decorrido quando fornecidos. Ritmo médio só é calculado com distância e duração válidas, indicando a base; não fabricar splits ou séries de médias. Arquivo multissessão/multiesporte sem política definida será rejeitado com mensagem clara. Amostras desordenadas/sem timestamp e métricas inválidas têm política explícita/qualidade, sem inventar valores.

## Plano de execução após aprovação

1. Evoluir Activity e adicionar splits/samples/importação com constraints e migrations versionadas; autorizar cada recurso pelo coach e vínculo/aceites vigentes.
2. Integrar persistência normalizada ao worker existente, preservando geração/revisão/fencing; publicação de uma nova revisão substitui detalhes atomicamente e remove séries obsoletas quando ausentes.
3. Implementar upload FIT de desenvolvimento com validação e isolamento, status persistido, idempotência, falhas sanitizadas e cancelamento quando acompanhamento é encerrado.
4. Construir lista, filtros, resumo rápido e detalhe de dados, com navegação a partir do perfil; evitar indicadores não disponíveis e mostrar proveniência.
5. Testar cálculos/unidades, ausência/incompletude, FIT válido/corrompido/excessivo, concorrência/replay/isolamento, worker e E2E dos fluxos; atualizar docs/roadmap e PR para main.

Enquanto essas decisões são revisadas, consultas/organização visual sobre o envelope já existente podem avançar sem alterar o modelo de séries ou adicionar parser.

## Fontes consultadas

- [fit-file-parser, mantenedor](https://github.com/jimmykane/fit-parser) e metadados npm consultados em 2026-11-18: versão 6.2.10, MIT, atualização em 2026-11-17.
- [SDK oficial JavaScript](https://github.com/garmin/fit-javascript-sdk), [licença própria](https://github.com/garmin/fit-javascript-sdk/blob/main/LICENSE.txt).
- [FIT, protocolo e CRC](https://developer.garmin.com/fit/protocol/).

Não confundir parser de arquivo local com acesso ao Garmin Connect ou aprovação do programa Business.

## Alternativas para revisão — solicitada pelo responsável técnico

Nenhuma alteração de produto, migration ou instalação de parser foi iniciada nesta preparação. A autorização da sprint não substitui a revisão das escolhas abaixo.

### 1. Persistência das séries

- **A — Tabelas relacionais (recomendada):** métricas resumidas em Activity; uma linha por amostra/split, com chaves e ordem. Favorece consultas de intervalos/quilômetros na SPRINT 06 e validação/integridade. Exige inserções em lotes, índices e mais linhas no banco; sem particionamento antecipado.
- **B — JSONB por atividade:** mesmo resumo relacional e um documento com séries/splits. Menos linhas e escrita simples; consultas por trecho e atualização parcial passam a depender mais de leitura/validação do documento na aplicação. Não elimina validação por ponto nem necessidade de limites.
- **C — Blocos JSONB:** agrupa amostras em blocos ordenados. Reduz número de linhas e permite leitura de blocos; adiciona política de tamanho/recorte, reconstrução e versionamento. Adiar até volume justificar a complexidade.

### 2. Parser de arquivo local

- **A — fit-file-parser 6.2.10 (recomendado):** MIT, TypeScript/ESM e Node >=20 segundo documentação do mantenedor; usar force=false/strict=true para checksums/estrutura. Maior responsabilidade de acompanhar compatibilidade frente ao SDK oficial. Compatibilidade efetiva será comprovada por fixtures/testes após aprovação.
- **B — @garmin/fitsdk 21.222.0:** SDK oficial, com Decoder/Stream e verificação de integridade; licença própria da Garmin, com termos diferentes de MIT. A escolha depende da revisão/aceitação dessa licença pelo responsável técnico; não presumimos essa aceitação.

Ambos decodificam arquivos fornecidos, sem autenticar Garmin Connect ou obter atividades por APIs não oficiais. Não é necessário acesso Business para inspecionar a alternativa técnica de parser local; isso não constitui aprovação de uso de uma licença nem autorização da integração comercial.

### 3. Recebimento e retenção do FIT

- **A — Decodificar isoladamente antes do ACK e descartar bruto (recomendada inicialmente):** upload espera até cinco segundos pela validação em thread limitada; erros estruturais retornam na requisição. Só DTO esportivo permitido entra no banco/fila; worker publica o resultado. Não guarda GPS/identificadores ocultos no arquivo. Nova versão do parser exige reenviar o FIT. O ACK confirma durabilidade do DTO, não do arquivo original.
- **B — FIT cifrado temporário + decodificação no worker:** ACK rápido após persistência e validação inicial; worker executa decode/normalização com limites. Permite retry/redecodificação sem novo upload enquanto houver bruto. Requer chave de importação estável, prazo e rotina de limpeza, tratamento de backlog/rotação e proibição de expor bruto. Prazo sugerido para revisão: apagar após sucesso/cancelamento; falhas no máximo 24 horas. Nenhum prazo é implementado/aprovado nesta proposta.

Ambas usam PostgreSQL/pg-boss existentes e precisam cancelar/revalidar publicação após encerramento do vínculo. Object storage não é necessário para os limites locais propostos. Rejeitar multissessão e limites excedidos preserva o arquivo sem fabricar resultados parciais silenciosos.

### Decisões para fechar

Escolher A/B/C para persistência, A/B para parser e A/B para recebimento. Também confirmar limites iniciais (5 MiB, 5 s, 128 MiB, 20 mil amostras/2 mil splits), mantendo o uso demonstrativo atual. A implementação dependente começa após essa revisão; critérios e testes serão ajustados às escolhas efetivas.
