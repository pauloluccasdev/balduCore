# ADR-011 — Qualidade e limites do piloto do MVP 1

Status: proposta para revisão do responsável técnico. SPRINT 11 autorizada para preparação após merge da 10; decisões de alcance do piloto e ativação de CI aguardam aprovação. Nenhuma funcionalidade desta proposta implementada.

## Problema e diagnóstico

O PR #12 da SPRINT 10 foi mesclado em main em 19/11/2026 às 22:38:08 UTC, commit a5fa5c002d5f438f56719b7c7561ef126e738ae1. A base contém dashboard consolidado, gestão de alunos, convites/retirada demonstrativos, Garmin mock, importação FIT sintética, análise determinística, feedback e monitoramento. A entrega anterior registrou 26 testes unitários, 47 de integração e 39 E2E; esses resultados são históricos, não execução nova nesta preparação.

A inspeção confirmou sete migrations, liveness/readiness da API, logs HTTP com correlationId sem URL/corpo/headers e validações que bloqueiam demo/mock em produção ou origem pública. O template infra/github-actions-ci.yml ainda está fora de .github/workflows; CI não está ativo. Não há ensaio automatizado de backup/restauração. As suítes existentes cobrem isolamento, convites, concorrência e processamento, mas falta reunir evidências e critérios operacionais do piloto.

Google real foi adiado pelo responsável técnico, Garmin oficial depende de aprovação externa, IA está adiada como DT-IA-01 e as jornadas públicas usam verificação/textos demonstrativos. Não declarar o MVP 1 integralmente entregue nem habilitar coleta real apenas por concluir uma revisão técnica.

## Alternativas e recomendação

| Alternativa                                             | Benefício                                                                 | Custo e limite                                                                                                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Piloto técnico local com dados sintéticos — recomendada | Permite consolidar qualidade e operação dentro das capacidades aprovadas. | Não valida autorização Garmin real, entrega de e-mail, identidade real ou operação pública.                                                                                      |
| Piloto externo com dados reais                          | Valida uso operacional com treinadores/alunos.                            | Depende de autenticação e verificação reais, textos/políticas aprovados, Garmin autorizado, hospedagem/TLS, segredos, backup e responsáveis operacionais. Amplia o escopo atual. |
| Adiar toda a revisão até obter integrações              | Evita um marco intermediário.                                             | Posterga correções e recuperação operacional que já podem ser verificadas localmente.                                                                                            |

Recomendar concluir a SPRINT 11 como preparação técnica para testes controlados locais, com relatório explícito de bloqueios externos. Não relaxar guardas demo/mock, ativar Google/IA/Garmin oficial, escolher hospedagem ou publicar o sistema nesta sprint. Permitir correções comprovadas no escopo atual, sem redesenho ou mudança silenciosa de arquitetura.

## Plano proposto

1. Revisar autorização por recurso, cookies/CSRF, tokens, validação/limites, isolamento e retirada nas rotas existentes. Conferir logs e mensagens de erro com testes específicos quando houver lacuna concreta. Não copiar segredos, URLs de banco, dados pessoais ou tokens para relatórios.
2. Percorrer os fluxos críticos existentes em desktop/tablet/mobile e dark/light, incluindo teclado, foco, rótulos, estados vazios/erro e acesso integral a tabelas. Corrigir problemas encontrados preservando os oito PNGs. Acessibilidade básica verificada não equivale a certificação.
3. Ensaiar as sete migrations em banco vazio e backup/restauração com ferramentas PostgreSQL compatíveis, usando exclusivamente bancos temporários isolados e dados sintéticos. Verificar contagens/integridade e disponibilidade após restore; não restaurar sobre banco de desenvolvimento ou produção. Documentar necessidade de preservar a chave de criptografia fora do dump e recuperar fila/worker sem duplicar efeitos. Não tratar backup criado sem restore como evidência de recuperação.
4. Revisar liveness/readiness, correlação de erros e estados de worker/fila já disponíveis. Documentar inicialização, parada, recuperação de falhas e diagnóstico sanitizado. Medir dashboard/listagens/análise com conjunto sintético delimitado, registrando tamanho, ambiente e tempos; não criar SLA nem cache/índices sem evidência e avaliação do trade-off.
5. Propor ativação do template de CI existente em .github/workflows, com banco de teste, versões fixadas, checks e suítes E2E sequenciais. A ativação executará jobs em PR/push e poderá consumir quota do GitHub Actions; depende desta aprovação. Preferir runners existentes do GitHub a contratar serviço novo. Falha ambiental e check não executado devem permanecer explícitos; evidência local não comprova Actions.
6. Consolidar README, checklist de piloto/deploy e relatório de verificação com comandos, resultados, correções, débitos e bloqueios. Executar instalação reproduzível/checks/testes pertinentes; não iniciar MVP 2 ou retomar IA automaticamente.

## Limites de implementação e decisões adicionais

Não adicionar dependência, fornecedor, telemetria externa, scanner pago, serviço de e-mail, deploy ou política automática de exclusão nesta proposta. Caso uma correção exija alterar modelo de dados, protocolo de autenticação, retenção ou arquitetura, apresentar alternativas antes de implementá-la. Retenção/exclusão e validade dos termos exigem definição do responsável técnico; não inventar prazos ou afirmar conformidade jurídica.

Automação de recuperação deve recusar destinos não temporários, evitar sobrescrita e remover somente recursos criados pelo próprio ensaio. Resultados de benchmark não autorizam carga em serviço externo. Não registrar dumps no Git nem enviar artefatos com segredos ao PR/CI.

## Critérios de aceitação

- Fluxos implementados e testes críticos passam; falhas encontradas têm correção verificada ou bloqueio registrado com impacto.
- Revisão de autorização/retirada e entradas hostis não identifica acesso cruzado ou vazamento conhecido sem tratamento.
- Evidência de migrations em banco novo e restauração isolada, com resultado de integridade e limitações documentadas.
- Navegação por teclado e layouts nos três formatos/temas verificados; problemas concretos registrados e tratados.
- Diagnóstico permite distinguir API/banco/fila/worker indisponíveis, sem alegar que readiness da API comprova saúde de todos os processos.
- CI ativo somente se aprovado, com execução real distinguida do template e de validações locais.
- Relatório define aptidão para piloto local sintético; dados reais/produção permanecem bloqueados pelas dependências listadas. IA segue DT-IA-01.

SPRINT 11 somente será concluída após revisão e aceite do responsável técnico. Este documento não autoriza deploy nem merge direto em main.
