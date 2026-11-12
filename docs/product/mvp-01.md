# BalduCore — MVP 1 (operação inicial BalduTraining)

Status: discovery proposto, aguardando aprovação. Data: 2026-11-11.

## Objetivo e usuários
Plataforma web exclusiva para treinadores acompanharem alunos e atividades, investigarem métricas e registrarem decisões. O aluno não recebe conta de dashboard: acessa apenas convite público, informa nome e e-mail, aceita acompanhamento e termos aplicáveis, autoriza Garmin e recebe confirmação. Também dispõe de mecanismo público seguro para revogar autorização ou solicitar encerramento do vínculo, sem acesso ao dashboard. O produto poderá atender outros treinadores e assessorias futuramente, sem introduzir organizações, cobrança ou permissões complexas neste MVP.

## Escopo funcional e critérios de aceitação
| Área | Entrega e aceite esperado |
| --- | --- |
| Dashboard | Resumo de alunos, Garmin, atividades recentes, eventos, insights e indicadores derivados dos dados autorizados; estados vazio, parcial e erro. |
| Alunos | Busca, filtros, perfil, vínculo, conexão, histórico e acesso a análises; nenhum acesso cruzado entre coaches. |
| Convites | Link individual compartilhável manualmente pelo WhatsApp; expiração, revogação, consumo único e associação verificável ao aluno previsto. |
| Página pública | Nome/e-mail, aceites separados, autorização oficial, confirmação e retomada segura após falha; mecanismo seguro de revogação/solicitação de encerramento; nenhuma navegação para dashboard. |
| Garmin | Provider oficial condicionado a aprovação; conexão, ingestão, normalização, deduplicação, retry, revogação e estados de sincronização. Mock explicitamente identificado. |
| Atividades | Filtros por aluno, modalidade, período e origem; importação manual de FIT para desenvolvimento na SPRINT 05 com validação e limites de segurança; métricas com unidades e disponibilidade; status de processamento e navegação. |
| Análise | Séries disponíveis de ritmo, FC, cadência e elevação; splits, segmentos, seleção de km/intervalos, eventos, AI contextual e observações. Ausência de amostras não produz gráfico fictício. |
| IA | Perguntas e comparação histórica apenas sobre dados autorizados; evidências, hipóteses explícitas e resposta de insuficiência de dados. |
| Feedback | Observações, validação/rejeição de insights, decisões técnicas e histórico autoral; não atribuir sensações não informadas ao aluno. |
| Monitoramento | Novas atividades, análises concluídas, eventos, erros e pendências; leitura por treinador e acesso ao recurso autorizado. |
| Configurações | Conta, autorização, conexão Garmin, última sincronização, erros e desconexão. |

## Fora do escopo
Pagamentos, assinaturas, finanças, aplicativo nativo, portal completo do aluno, biblioteca avançada, prescrição completa, envio de treinos Garmin e comparação avançada prescrito/executado. MVP 2 não demanda entidades ou endpoints antecipados.

## Referências visuais — inspecionadas
Na inspeção inicial o repositório continha somente `.git`; as imagens estavam fora dele. Após o usuário informar o caminho Windows, o ZIP foi localizado em `/mnt/c/Users/Paulo Lucas/Downloads/Plataforma de Inteligência Esportiva — Protótipo-png.zip`. As oito imagens foram inspecionadas individualmente e, a pedido do usuário, copiadas sem alteração para [docs/design/references](../design/references/). Esses PNGs versionáveis são a fonte de verdade visual para o design system e os layouts do sistema. O ZIP original foi preservado; a implementação não depende de seu caminho externo.

SHA-256 do ZIP: `58f179ab942d26aa3059492c8a97bacffa615a5426fd1ebd752045f9f8079b1b`.

| Referência | Dimensão em pixels |
| --- | --- |
| [Dashboard do coach — modo escuro.png](../design/references/Dashboard%20do%20coach%20%E2%80%94%20modo%20escuro.png) | 2880 × 2080 |
| [Dashboard do coach — modo claro.png](../design/references/Dashboard%20do%20coach%20%E2%80%94%20modo%20claro.png) | 2880 × 2080 |
| [Análise esportiva — modo escuro.png](../design/references/An%C3%A1lise%20esportiva%20%E2%80%94%20modo%20escuro.png) | 2880 × 3830 |
| [Análise esportiva — modo claro.png](../design/references/An%C3%A1lise%20esportiva%20%E2%80%94%20modo%20claro.png) | 2880 × 3830 |
| [Atividades dos alunos — modo escuro.png](../design/references/Atividades%20dos%20alunos%20%E2%80%94%20modo%20escuro.png) | 2880 × 2000 |
| [Atividades dos alunos — modo claro.png](../design/references/Atividades%20dos%20alunos%20%E2%80%94%20modo%20claro.png) | 2880 × 2000 |
| [Feedback do treinador — modo escuro.png](../design/references/Feedback%20do%20treinador%20%E2%80%94%20modo%20escuro.png) | 2880 × 3120 |
| [Feedback do treinador — modo claro.png](../design/references/Feedback%20do%20treinador%20%E2%80%94%20modo%20claro.png) | 2880 × 3120 |

### Identidade observada
- Sidebar vertical com logotipo BalduTraining, ícones lineares, item ativo sobre superfície arredondada e Configurações junto ao rodapé. Conteúdo principal separado por borda vertical.
- Tema escuro com fundo quase preto, sidebar grafite e cards ligeiramente elevados por diferença de superfície e bordas discretas. Tema claro com fundo cinza muito claro, sidebar/cards brancos e sombras suaves.
- Cor principal definida pelo responsável técnico: `#EF3338`. Vermelho no nome da marca, ícones ativos, ações principais, seleção de chips e linha de ritmo; verde, âmbar e vermelho distinguem estados, sempre acompanhados de texto.
- Tipografia sans-serif, títulos e métricas em negrito, rótulos secundários em cinza e unidades menores. Família e pesos exatos não podem ser comprovados por PNG; confirmar fonte antes da implementação, sem apresentar uma substituta como original.
- Cards com cantos arredondados, padding consistente, bordas finas, chips em cápsula, inputs de superfície neutra e tabelas compactas com divisórias horizontais. Preservar proporções, densidade e hierarquia; medidas CSS não são recuperáveis com certeza a partir da escala do export.

### Composição por tela
| Tela | Organização a preservar |
| --- | --- |
| Dashboard | Cabeçalho com período/estado Garmin/tema; cinco cards de indicadores; atenção e insights lado a lado; tabela de atividades e bloco de planejamento; faixa inferior de alunos e status. |
| Atividades | Cabeçalho e aviso de origem; quatro indicadores; busca/chips/filtros; tabela larga com scroll interno e painel de detalhamento rápido à direita. |
| Análise | Breadcrumb e resumo da atividade; seis métricas; gráfico principal de ritmo vermelho com média tracejada e pontos de eventos; três cards para FC/cadência/elevação; segmentos e splits; insights e observações. AI Coach ocupa coluna lateral própria com contexto, sugestões e entrada. |
| Feedback | Atividades recentes em chips; duas colunas para registro técnico e validação; resumo com quatro métricas; pontos de atenção por atividade/km/intervalo, observações e decisões; histórico em tabela ao final. |

Os pares dark/light preservam organização e conteúdo, alterando superfícies, contraste e sombras. Os PNGs são referências de aparência, não código-fonte nem prova de interação funcional.

### Implicações funcionais sem ampliação do MVP
O Feedback separa validação do evento observado (correto/parcial/incorreto) da validação da hipótese causal (inclui “não sei”), com contexto opcional e histórico. O modelo deve preservar essa distinção. Observações podem apontar atividade inteira, quilômetro ou intervalo, e precisam distinguir observação do coach de informação confirmada pelo aluno.

A análise mostra métricas de resumo mesmo quando séries temporais estão indisponíveis; a ausência deve ser explícita, sem inferir uma série a partir de média/máxima. Comparações aproximadas são rotuladas e não substituem métricas exatas.

“Planejamento”, “Treino prescrito” e “MVP 2” aparecem como placeholders: não autorizam prescrição ou envio de treinos. “Pré-visualizar estado” e “Simular erro ao salvar” são controles do protótipo, não requisitos de produção. Rótulos de arquivo FIT real e integração inativa demonstram separação de origem, mas screenshots não fornecem arquivo FIT nem comprovam a realidade dos dados; não copiar números nem tratar exemplos como dados reais. O contexto mestre prevê importação manual de FIT para desenvolvimento na SPRINT 05, somente quando essa sprint for autorizada, com validação e limites de segurança.

### Pendências para implementação visual
Não há referências de mobile, convites, login, gestão completa de alunos ou configurações. Derivar essas telas da identidade existente quando seu escopo for aprovado, apresentando adaptações; não criar outro design system. Validar responsividade, foco, contraste e estados interativos em browser. Evitar reproduzir clipping de tabelas e scrollbars do export como se fossem regra visual; preservar densidade e permitir acesso integral aos dados. Confirmar fonte, asset original do logotipo e persistência do tema antes da UI. Cor principal fixa: `#EF3338`; demais cores e medidas deverão ser amostradas e comparadas na implementação, sem presumir tokens originais.

## Política dos dados
Distinguir fato observado, evento determinístico, hipótese e recomendação para avaliação do treinador. Dados demonstrativos sempre marcados como sintéticos na origem, API e UI. Conclusão de convite não significa conclusão de sincronização. Decisões esportivas continuam com o treinador.

## Navegação
Sidebar: Dashboard, Alunos, Planejamento, Atividades, Análise Esportiva, Assistente IA, Central de Monitoramento e Configurações. Feedback acessível pelo contexto da atividade ou aluno. Funcionalidades futuras devem indicar desenvolvimento claramente; não criar rotas decorativas.

## Estados independentes
- Convite: pendente, utilizado, expirado, revogado.
- Vínculo: pendente, ativo, encerrado.
- Garmin: não conectada, aguardando autorização, conectada, erro, desconectada.

Aceite ativa o vínculo, não a conexão Garmin. Sincronização é eventual; conexão concluída não promete atividade recebida instantaneamente.

## Gate desta entrega
SPRINT 00: documentação e regras permanentes no AGENTS.md. Fundação, migrations, telas e endpoints aguardam aprovação. Textos legais, política de retenção, política de identidade do aluno e acesso Garmin permanecem pendentes.
