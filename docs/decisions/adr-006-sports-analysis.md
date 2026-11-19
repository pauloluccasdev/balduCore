# ADR-006 — Análise esportiva determinística e investigação de trechos

Status: proposta para revisão do responsável técnico. SPRINT 06 autorizada para preparação; decisões abaixo aguardam aprovação antes de migrations, instalação ou código de produto. Base: PR #7 mesclado (78eb10e). Data: 2026-11-18.

## Problema e base disponível

A SPRINT 05 disponibiliza Activity, ActivitySample e ActivitySplit, proveniência, hash/revisão e consultas autorizadas. Ainda não há SportsAnalysis, gráficos ou regras de eventos. O treinador consegue ler dados, mas não investigar visualmente uma execução ou comparar trechos com evidências.

Relidas as referências Análise esportiva dark/light: breadcrumb, seis indicadores, ritmo em vermelho, três painéis de FC/cadência/elevação, comparação de segmentos, splits, eventos e coluna contextual. Preservar tokens/sidebar, hierarquia, densidade e responsividade. O protótipo também mostra IA, feedback e prescrição; esses comportamentos pertencem às SPRINTS 07/08 e MVP 2. A coluna lateral nesta etapa apresenta contexto/qualidade/seleção determinísticos, sem chat fictício. Não copiar números, eventos ou recomendações dos PNGs.

## Escopo e limites

- Tela funcional de análise por atividade, acessível pelo histórico/perfil; entrada na sidebar permite escolher uma atividade autorizada.
- Gráficos de ritmo, FC, cadência e elevação quando houver séries, com cursor/seleção sincronizados, estados parciais/vazios e alternativa por tabela/controles de intervalo para teclado e celular.
- Seleção de splits, faixa de distância/quilômetros quando válida e intervalo de tempo; comparação de dois trechos, limites efetivamente observados e métricas com base/unidades/evidências.
- Resumo determinístico, regras versionadas de eventos, persistência de análise e estados de processamento/obsolescência/reprocessamento.
- Testes de cálculos, qualidade, idempotência, concorrência, autorização, revisão e interface.

Sem LLM/AI Coach, validação de insights, edição de feedback, prescrição, GPS, dados reais ou integração Garmin oficial. Login fictício e proveniência da 05 permanecem. Feedback e IA serão identificados como etapas futuras sem rotas/formulários decorativos.

## Alternativas e recomendação

| Decisão      | Recomendação                                                                                                                                                                                                                                              | Alternativa e trade-off                                                                                                                                                                                                                                                                 |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persistência | SportsAnalysis relacional com FK composta coach/aluno/atividade, revisão/hash de entrada, versão de algoritmo/regras, estado/tentativas e resultado JSONB validado. Eventos são itens tipados do snapshot, com ID estável dentro da análise e evidências. | ActivityEvent em tabela própria facilita busca transversal; adiciona joins/ciclo de vida sem consumidor atual. Extrair quando Monitoring/Feedback exigir consulta independente. Calcular tudo sem persistir simplifica o schema, mas perde rastreabilidade da versão e repete trabalho. |
| Execução     | Reutilizar worker/pg-boss. Criar intenção e job atomicamente ao publicar uma nova revisão; POST autorizado solicita análise de atividades anteriores ou nova versão do algoritmo. GET não inicia trabalho.                                                | Cálculo na requisição é mais simples, porém aumenta latência e mistura leitura, cálculo e persistência; menos adequado à análise automática após ingestão. Nenhum serviço/fila externa novo.                                                                                            |
| Segmentos    | Seleção ajustada a pontos/limites realmente disponíveis, sem interpolação inicial. Informar intervalo solicitado e intervalo efetivo; distância só com progressão válida. Splits recebidos mantêm identidade e distância reais.                           | Interpolar fronteiras de km possibilita segmentos de 1000 m, mas estima tempo/valores e exige política de pausas/lacunas e evidência adicional. Não gerar splits artificiais nesta versão.                                                                                              |
| Visualização | Recharts no frontend, previsto na stack; validar versão estável/peers React/Next e fixar pacote/lockfile antes da instalação após aprovação.                                                                                                              | SVG próprio reduz dependências, mas exige manter e testar eixos, tooltips, sincronização, seleção e acessibilidade. A lib não substitui a revisão visual/acessível.                                                                                                                     |
| Regras       | Pequeno conjunto explícito de heurísticas demonstrativas abaixo, versionado e com limites de elegibilidade; evidenciar valores e regra disparada.                                                                                                         | Motor configurável por treinador aumenta UI/modelo/validação; adiar calibração individual e configuração até haver validação de domínio. Nenhum limiar é apresentado como padrão clínico ou prova de causa.                                                                             |

## Contrato e ciclo de vida propostos

SportsAnalysis tem uma atividade e muitos eventos embutidos; uma atividade possui várias versões de análise. Unicidade: atividade + revisão de entrada + hash de entrada + versão do algoritmo. A versão do algoritmo inclui regras, limiares e método de cálculo. Snapshot contém métricas, disponibilidade/qualidade, resumo factual e eventos com tipo, versão, limiar, valores observados, base temporal, índices/ordinais e intervalo quando disponível. Resultado validado/limitado pelos limites da atividade (20 mil amostras/2 mil splits); paginação dos eventos quando necessário. Não duplicar séries integrais no JSONB. Como a 05 substitui amostras/splits nas revisões, preservar valores necessários às evidências publicadas no snapshot; não prometer recalcular uma revisão antiga sem sua entrada original. Reprocessamento padrão usa somente a revisão atual.

Estados persistidos: queued, processing, retry, completed, failed, cancelled. Obsolescência é verificada comparando revisão/hash/versão com a atividade atual; resultado antigo nunca é retornado como atual. Snapshot concluído não é sobrescrito por outro cálculo/versão. Não expor análise antiga como contexto atual da IA futura. Falha/retry não apaga uma análise concluída de outra versão.

Jobs carregam somente o identificador da análise/discriminante. Capturar resumo e detalhes da mesma revisão por leitura consistente; calcular fora da transação de publicação; revalidar revisão/hash, vínculo/aceites, runToken e lease antes de persistir. Reusar limite de cinco tentativas e fencing da infraestrutura existente; falha permanente de entrada é explícita, sem retries inúteis. Enfileiramento transacional e recuperação de intenção sem job preservam durabilidade. Atividades anteriores exigem ação explícita de analisar, sem backfill global automático.

Leituras, solicitação de cálculo, séries, segmentos e comparação exigem sessão/coach e vínculo/aceites vigentes; mutações exigem CSRF/Origin e rate limit. Encerramento cancela análises pendentes e impede resultado tardio; desconexão Garmin mantém acesso a atividades permitidas pelo vínculo, como na 05. Auditoria/logs sanitizados. Retenção/exclusão de análises entra na política produtiva ainda pendente, sem prometer descarte retroativo já implementado.

## Política de métricas e qualidade — proposta

1. Resumo do dispositivo permanece separado de métricas calculadas. timerSeconds é tempo de cronômetro, elapsedSeconds é decorrido; não chamar timer de tempo em movimento. Não inferir pausas sem eventos de timer, hoje não persistidos.
2. Ritmo médio = duração válida / distância positiva em km, com base timer/elapsed/provided explícita. Não comparar durações de bases diferentes. Ritmo instantâneo somente de velocidade recebida positiva: 1000 / m/s; velocidade zero não vira ritmo infinito nem desaparece do dado original. Não inferir velocidade de distância parcial nesta etapa.
3. Nulos nunca viram zero. Médias de FC/cadência do resumo não geram séries. Nos trechos, eventual média aritmética será rotulada como média das amostras disponíveis, com número de observações e lacunas; não representa média ponderada pelo tempo nem preenche resumo ausente. Comparação mostra também mínimos/máximos observados.
4. Trechos de amostras usam tempo decorrido entre limites observados; distância = diferença de distância acumulada quando válida. Não aplicar tempo de cronômetro da atividade inteira a um trecho. Trechos de splits completos somam duração/distância válidas e homogêneas; ritmo agregado é razão das somas, nunca média simples de ritmos. Ausência em um split torna a agregação correspondente incompleta, sem total aparentemente integral.
5. Eixo temporal é padrão. Eixo/seleção por distância só quando há pontos suficientes com progressão acumulada válida; resets/regressões geram qualidade e fallback para tempo. Timestamp repetido não permite dividir por duração zero. Splits são voltas, não necessariamente quilômetros; só usar rótulo de km quando sustentado pela distância. Uma faixa de km não promete cobrir exatamente 1000 m se as fronteiras não foram observadas.
6. Séries não conectam valores nulos nem intervalos entre amostras superiores a 30 s. Esse é um limite técnico inicial versionado de lacuna, não detecção esportiva de pausa; gravação esparsa pode produzir pontos isolados. Não interpolar sensores faltantes.
7. Renderizar até 2000 pontos observados por série, preservando extremos em buckets e separações por lacuna. Redução só para visualização; backend usa resolução integral para cálculos, comparação e eventos. Pontos exibidos retêm referência à amostra de origem; UI informa redução. Eventos têm referência própria de split/intervalo, não dependem de sobreviver à redução visual.
8. Sem dados suficientes, apresentar indisponibilidade e motivo. Diferença entre fontes/resumo/séries não é corrigida silenciosamente. Evidência identifica origem, revisão/hash e método, sem alegar causalidade, diagnóstico ou sensação do aluno.

## Regras iniciais para aprovação de domínio

Heurísticas locais para destacar diferenças observadas, não limites científicos/individualizados. Cada evento apresenta regra, referência, diferença absoluta/relativa e condição de elegibilidade. Avaliar pares adjacentes de splits completos, sem pular dados ausentes. Nenhum evento por falta de amostras, e nenhum valor de alerta extraído das imagens.

| Regra v1                                | Elegibilidade                                                                                                         | Disparo proposto                                                                                                    | Evidência/limite                                                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Variação de ritmo entre splits          | Corrida/caminhada; ambos com distância >= 200 m, duração positiva e mesma base; razão entre distâncias de 0,8 a 1,25. | Variação absoluta >= 30 s/km **e** relativa >= 15% do split anterior. Informar aceleração/desaceleração pelo sinal. | Ordinais, distâncias, durações, base, ritmos e deltas; não afirmar fadiga/parada/subida.                                    |
| Alteração de FC média entre splits      | Ambos com FC média fornecida e duração >= 60 s na mesma base.                                                         | Diferença absoluta >= 10 bpm.                                                                                       | Médias fornecidas e tempos dos splits; indicar direção, sem zona/risco clínico/causa.                                       |
| Variação de cadência média entre splits | Ambos com cadência fornecida positiva, mesma unidade e duração >= 60 s na mesma base.                                 | Variação absoluta >= 5 ciclos/min **e** relativa >= 10%.                                                            | Cadências/durações, unidade e deltas; não converter automaticamente para passos/min ou classificar técnica como inadequada. |

FC/cadência exigem também a comparabilidade de distância da primeira regra quando ambas as distâncias existem; ausência de distância é explicitada. Nenhuma regra compara esportes ou atividades diferentes nesta sprint. Sem splits elegíveis, gráficos e investigação de amostras continuam disponíveis, mas esses eventos não são fabricados. Limiar exatamente igual é inclusivo; testar limites de cada regra.

## Plano de implementação após aprovação

1. Evoluir schema/migration com SportsAnalysis e integrar ciclo de revisão/cancelamento/enfileiramento ao pipeline atual, mantendo compatibilidade com jobs da 04/05.
2. Implementar funções puras de qualidade, métricas, segmentos, comparação e regras, com fixtures sintéticas e evidência versionada.
3. Adicionar consultas autorizadas da análise/séries, solicitação de processamento e comparação limitada de dois trechos. Limitar payloads, número de pontos e rate limit; nunca usar GET para publicar jobs.
4. Instalar versão estável compatível de Recharts e construir tela baseada nos dois PNGs, gráficos sincronizados, seleção acessível, tabela de splits, eventos e painel contextual. Disponibilidade parcial não bloqueia o restante da tela.
5. Testar ponta a ponta; revisar segurança/diff/visual; atualizar docs/README/roadmap e o PR da branch sprint/06-analise-esportiva. Não avançar à 07.

## Critérios de aceitação e testes previstos

- Treinador abre atividade autorizada, acompanha análise e inspeciona gráficos disponíveis, sem transformar resumo em série fictícia.
- Seleção em gráfico/tabela/controles sincroniza contexto e comparação; fronteiras reais, base temporal e dados faltantes ficam visíveis em desktop/tablet/celular e ambos os temas.
- Cálculos reproduzíveis com unidades e evidências; fixtures de pausas, zeros, distância parcial/regressiva, timestamp repetido, séries incompletas, splits desiguais e ausência total de séries.
- Regras cobertas nos limiares e na inelegibilidade; agregação ponderada por distância/duração correta. Redução visual preserva extremos/lacunas e não modifica resultados integrais.
- Idempotência, concorrência, nova revisão durante cálculo, lease expirado, retry limitado e retirada impedem duplicação/publicação obsoleta.
- Coach B e aluno anônimo não consultam/solicitam análises, séries ou comparações do coach A. CSRF/validação/limites e FK composta verificados.
- Build, tipos, lint, formatação, migration em banco vazio, testes unitários/integração e E2E pertinentes. Evidência de compatibilidade da biblioteca antes de concluir instalação.

Nesta preparação foram inspecionados código/documentação e referências; nenhum endpoint, migration, dependência ou teste de produto novo foi implementado. Aprovação solicitada para persistência/execução, seleção sem interpolação e política de métricas/regras/limites acima.
