# Piloto técnico local — operação e evidências da SPRINT 11

Status: implementação em revisão no PR #13. ADR-011 aprovado para piloto local sintético e CI. Aceite final pendente; nenhuma autorização para publicação ou dados reais. IA continua DT-IA-01.

## Alcance e bloqueios

O treinador fictício percorre cadastro → convite/aceites de teste → conexão mock ou FIT sintético → worker → atividade/análise determinística → feedback/monitoramento → dashboard. O aluno não recebe dashboard. Google assinado nos testes é uma fixture OIDC, não acesso a conta Google real.

O piloto é local e usa somente dados sintéticos. Antes de uso externo ou real, resolver autenticação/verificação reais, termos e tratamento de dados, retenção/exclusão, aprovação Garmin, hospedagem/TLS, segredos/rotação, backup externo e responsáveis operacionais. IA está adiada, não entregue. Não alterar guardas de configuração para contornar esses bloqueios. Não há certificação de acessibilidade ou declaração de conformidade jurídica.

## Inicialização e parada

1. Usar Node/pnpm fixados em .nvmrc/packageManager. Copiar .env.example para .env ignorado; manter bind/origem locais e AUTH_MODE=demo. Não exibir o conteúdo do .env em relatórios.
2. Com Docker/WSL disponível: pnpm db:up. Banco de teste deve ser diferente do operacional. Instalar com pnpm install --frozen-lockfile --strict-peer-dependencies, aplicar pnpm db:deploy e pnpm db:test:deploy.
3. Para mock, pnpm garmin:setup gera segredos locais sem imprimi-los. Sem mock, manter GARMIN_PROVIDER=disabled; FIT sintético continua independente de autorização Garmin.
4. pnpm dev inicia web, API e worker do mesmo monólito. Para verificar a build executável, pnpm build e iniciar separadamente os scripts start de cada app e worker da API, todos em loopback. Não usar demo para exposição pública.
5. Encerrar processos com SIGINT/SIGTERM e aguardar o fechamento da fila/banco. pnpm db:down para o Compose preserva o volume; não usar exclusão de volume como rotina de parada.

## Diagnóstico e recuperação de falhas

| Sinal                                                        | O que comprova                                     | Ação                                                                                                                      |
| ------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| GET /api/health 200                                          | Processo da API responde.                          | Não prova banco, fila ou worker saudáveis.                                                                                |
| GET /api/health/ready 200                                    | API consulta PostgreSQL por Prisma.                | Não prova processamento completo nem integração oficial.                                                                  |
| Readiness 503 com liveness 200                               | API viva, banco indisponível para a consulta.      | Verificar serviço/bind, configuração e migrations sem copiar URL/credenciais para logs.                                   |
| api_started / API_START_FAILED                               | Resultado do startup da API.                       | Conferir configuração e banco; erros públicos não incluem exceções internas.                                              |
| worker_started / ACTIVITY_WORKER_FAILED / GARMIN_QUEUE_ERROR | Startup/falha do processo de processamento/fila.   | Verificar logs desse processo, banco, migrations e namespace; readiness da API não substitui essa verificação.            |
| Job pendente com API saudável                                | Processamento eventual ainda não concluído.        | Confirmar processo worker e namespace correspondente; não marcar atividade publicada por existir ACK.                     |
| Falha terminal no perfil/central                             | Tentativas limitadas esgotadas ou erro permanente. | Corrigir causa e usar somente reprocessamento autorizado disponível. Não editar estados/credenciais diretamente no banco. |

X-Request-Id permite localizar o log HTTP por correlationId; logs contêm método, status e duração, sem URL/query, corpo, cookie ou Authorization. Não publicar traces Playwright: podem conter cookies/capabilities, mesmo em teste. Testes forçam banco indisponível e JSON malformado e conferem sanitização/correlação. Erro de provider/worker usa códigos sanitizados.

Reiniciar o worker com a mesma configuração estável permite recuperação por leases/intenção durável já existentes. Revalidam-se vínculo, consentimentos, revisão e fencing antes de publicar. Não executar conciliação global: a CLI de monitoramento exige coach/tipo/limite, conforme README. Desconectar Garmin e retirar acompanhamento têm efeitos distintos; não reativar coleta via retry.

## Ensaio reproduzível de backup/restauração

Pré-requisitos: servidor PostgreSQL local, usuário com permissão para criar/remover seus bancos de ensaio e ferramentas pg_dump/pg_restore compatíveis no PATH. O cliente deve ler a major do servidor; execução local desta sprint usou servidor 17.7 e cliente 17.12. Não instalar nova dependência de aplicação para isso.

Configurar RECOVERY_ADMIN_URL no ambiente apontando explicitamente para o banco administrativo postgres em loopback; não apontar para o banco da aplicação. Executar:

```sh
pnpm db:recovery:drill
```

O comando recusa produção, host externo, banco administrativo diferente, query/fragmento e usa nomes aleatórios balducore_drill_<uuid>_source/restore. Não recebe destino de restore do usuário. Só remove bancos registrados após CREATE bem-sucedido nessa execução; não reutiliza ou sobrescreve banco existente. URLs/erros de ferramentas são sanitizados; dump temporário fica fora do repositório, em diretório privado, e é removido no finally. Encerramento abrupto do SO pode interromper finally: um operador deve identificar bancos temporários órfãos antes de removê-los, sem tocar em bancos alheios.

Etapas: migrations no source vazio → dados sintéticos → medições delimitadas → fila com tarefa de prova → parar conexões/fila → pg_dump custom → pg_restore em restore vazio → comparar hashes de todas as linhas/tabelas public/pgboss → ping Prisma e contagens → decifrar canário com chave externa → reabrir fila e consumir a tarefa de prova → remover os dois bancos/dump. Erro em ferramenta, comparação ou limpeza retorna status de falha. Uma execução bem-sucedida não comprova política produtiva de backup.

Não é backup do banco operacional nem exportação de dados de alunos. A tarefa de prova verifica retomada da fila; idempotência, leases e fencing de publicações do domínio são cobertos pelos testes de integração, não por esse único job. O canário usa o mesmo utilitário criptográfico, mas não representa autorização Garmin real.

Para operação futura, dump não substitui backup de chaves: preservar AUTH_SECRET/GARMIN_TOKEN_KEY e configuração de namespace separadamente em mecanismo aprovado, sem Git/log. Perda da chave impede decifrar tokens; o ensaio confere falha com chave diferente. Dump não inclui roles globais do cluster, configuração externa ou garantia de recuperação pontual. Após restore real, sessões, jobs e eventos externos podem exigir invalidação/conciliação; definir esse procedimento antes de qualquer piloto com dados reais. Não há RPO/RTO aprovado nesta entrega.

## Evidência de recuperação e desempenho — 19/11/2026

Ensaio local passou: sete migrations em banco vazio, 38 tabelas/427 linhas idênticas antes/depois por fingerprint, 200 atividades, 200 análises, samples/splits relacionais, canário cifrado e uma tarefa de prova retomada. Bancos/dump do ensaio foram removidos. Sem migration nova.

Ambiente: Linux/WSL Ubuntu 22.04, Node 24.19.0, pnpm 11.22.0, PostgreSQL 17.7 local, 12 CPUs lógicas e cerca de 15,5 GiB de RAM disponíveis ao ambiente. Medições invocam os serviços no processo, sem HTTP/browser, um treinador/aluno sintéticos autorizados, 200 atividades/análises atuais, duas amostras e dois splits em uma atividade. Uma chamada de aquecimento e cinco amostras por operação, sequenciais. A máquina também executava regressão E2E em bancos separados; não houve isolamento de CPU/I/O:

| Serviço                | Mediana | Máximo observado |
| ---------------------- | ------- | ---------------- |
| Dashboard consolidado  | 105 ms  | 113 ms           |
| Listagem de atividades | 26 ms   | 32 ms            |
| Consulta de análise    | 17 ms   | 19 ms            |

Esses números não representam rede, cold start, concorrência, séries longas, uso real ou SLA. Não justificam índice/cache novo. Dashboard valida todos os snapshots atuais; medir crescimento desse custo antes de escalar. Bibliotecas/banco e dataset estão delimitados no script, sem carga externa.

## Revisão de segurança e qualidade

| Área                | Evidência e limite                                                                                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sessão e isolamento | Controllers derivam coach da sessão; consultas aplicam ownership, vínculo/aceites e FKs compostas. Integração testa A/B, anônimo, expiração/revogação e retirada. Não ativado login real.                              |
| Convites/retirada   | Tokens hash, finalidades separadas, expiração, resgate transacional e verificação demo; testes de replay, concorrência e revogação. Não equivale a identidade real.                                                    |
| Escritas e entradas | Origem/CSRF nos fluxos mutáveis, DTOs estritos e limites de JSON/FIT, parser isolado e testes de limite/rollback. Não executado pentest externo.                                                                       |
| Processamento       | Inbox/job atômicos, retries limitados, leases/fencing, publicação autorizada; testes de crash, versão obsoleta, retirada durante cálculo e idempotência.                                                               |
| Logs/erros          | Readiness e corpo malformado sanitizados, cabeçalhos/cookies/segredos omitidos; teste verifica correlação.                                                                                                             |
| Teclado             | Destinos do skip link recebem tabIndex=-1 nas telas protegidas. Regiões de tabelas largas têm nome e foco para scroll por teclado. E2E verifica skip link, menu/Escape/restauração do foco e rolagem horizontal móvel. |
| Visual              | Referências preservadas; fluxos existentes exercitados em desktop/tablet/mobile e temas claro/escuro. Sem design system novo. Não certifica contraste em todos os componentes.                                         |

## CI e checklist de aceite

Ativação de GitHub Actions aprovada, mas tentativa de push foi recusada pelo GitHub: OAuth App sem escopo workflow não pode criar/atualizar .github/workflows/ci.yml. Configuração atualizada permanece em infra/github-actions-ci.yml. Com credencial que permita workflows, movê-la para .github/workflows/ci.yml por PR. Não foi solicitada ampliação silenciosa de permissões da conta.

Template usa Ubuntu 24.04, PostgreSQL 17.7, ferramentas cliente 17, Node/pnpm fixados, instalação congelada/peers estritos, checks, integração, recuperação e cinco suítes E2E sequenciais. Sem upload de traces/relatórios ou serviços pagos novos. O [inventário oficial dos runners](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md) lista cliente PostgreSQL 16 por padrão; o job instala o cliente 17 para o servidor 17. O template não é evidência de Actions executado. Docker continua indisponível nesta distro WSL.

Antes do aceite local:

- Registrar resultados efetivamente executados de instalação, tipos, builds, lint/formatação, unitários, integração, cinco suítes E2E e recuperação.
- Confirmar diff sem segredos/dumps/dependências ou migrations novas, capturas verificadas e recursos temporários removidos.
- Registrar bloqueio de CI e dependências externas; não marcar IA concluída.
- Responsável técnico revisar PR/limitações e aceitar a sprint; não fazer merge ou deploy automático.

## Relatório final de verificação local

Fluxo verificado: browser autenticado → proxy Next → Nest → PostgreSQL/fila → atividade/análise persistida → feedback/central/dashboard. As suites cobrem tanto sucesso quanto autorização negada, retirada, erro e recuperação; dados de teste são explícitos.

| Fronteira                        | Resultado e evidência                                                                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Instalação/build/tipos           | Instalação frozen-lockfile com peers estritos, build API/web e typecheck passaram.                                                                                                                                                                           |
| Regras/HTTP/SDK                  | 27 testes passaram, incluindo guardas de recuperação e erro/log sanitizados.                                                                                                                                                                                 |
| API/banco/transações             | 47 testes de integração passaram com PostgreSQL real, incluindo A/B, CSRF, retirada, concorrência, idempotência e falhas de publicação.                                                                                                                      |
| Navegador/API/dados/renderização | 39 E2E passaram: 12 base/alunos, 12 demo/convites/Garmin, nove atividades/análise/feedback, três monitoramento e três dashboard; desktop/tablet/mobile.                                                                                                      |
| Teclado/UI                       | Skip link move foco para main em dashboard/alunos; menu retorna foco após Escape; tabela de amostras rola com ArrowRight no celular. Capturas dark/light geradas e amostras inspecionadas de análise tablet escura e atividades mobile clara; sem redesenho. |
| Banco vazio/recuperação          | Ensaio passou com sete migrations, fingerprint coincidente, chave externa e tarefa de fila retomada. Consulta administrativa final encontrou zero bancos balducore_drill; diretórios/dumps temporários removidos.                                            |
| Revisão estática                 | Lint, Prettier, diff e revisão dos componentes passaram; sem dependências/migrations novas ou segredos/dumps versionados.                                                                                                                                    |
| Ambiente externo                 | Docker indisponível no WSL; GitHub recusou workflow por escopo ausente. Não executados Actions, deploy, Garmin/Google reais ou IA.                                                                                                                           |

A primeira execução da central imprimiu três testes aprovados, mas o shell encerrou com SIGTERM (143) no encerramento dos processos. A suíte foi repetida isoladamente: três aprovados e exit 0. Não houve falha de asserção nesse caso.

Parecer: base verificada para revisão e testes técnicos locais sintéticos, com CI externo ainda pendente. Aceite da sprint cabe ao responsável técnico. Nenhuma ampliação automática para dados reais ou MVP 2.
