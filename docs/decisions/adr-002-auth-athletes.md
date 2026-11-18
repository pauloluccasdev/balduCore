# ADR-002 — Autenticação e identidade dos alunos na SPRINT 02

Status: aprovado pelo responsável técnico; implementação da SPRINT 02 em revisão. Data: 2026-11-15.

## Contexto

A SPRINT 01 foi mesclada no PR #2. Existem web/API, PostgreSQL/Prisma e dashboard sintético; não existem usuários autenticados, sessões ou tabelas de domínio. A stack-base já foi aprovada. Esta decisão não reabre Next/Nest, banco único ou sessão opaca proposta no ADR-001.

## Alternativas de autenticação

| Opção                                        | Vantagem                                                                                               | Custo e dependência                                                                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Google via OIDC                              | Login do treinador sem armazenar senhas no BalduCore; protocolo compatível com a recomendação inicial. | Treinador precisa de conta Google; configurar projeto OAuth, consent screen, client e redirects oficiais. Configuração real depende de credenciais do responsável. |
| Plataforma de identidade gerenciada via OIDC | Permite centralizar conexões e políticas no fornecedor, conforme capacidades contratadas.              | Conta/contrato externos, configuração adicional e custos a validar; não provisionar automaticamente fornecedor ou plano.                                           |
| Senha local                                  | Acesso sem conta de identidade externa.                                                                | Exige hashing, recuperação, verificação de e-mail, serviço transacional e medidas adicionais contra abuso; muda a recomendação OIDC e aumenta escopo de operação.  |

Recomendação para o piloto: Google OIDC, desde que os coaches tenham conta Google. Manter issuer/client/redirect configuráveis e biblioteca de protocolo mantida; não implementar validação criptográfica ou OAuth artesanal. Se login por senha for requisito do produto, decidir agora entre fornecedor gerenciado e autenticação local, antes de criar o schema de credenciais.

Fonte primária: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect). A identidade persistida usa issuer + subject; e-mail sozinho não é identificador seguro. Google alerta que email_verified de domínio terceiro não necessariamente comprova controle atual da caixa postal; provisionamento inicial deve considerar autoridade das claims e aprovação operacional, sem cadastrar coaches indiscriminadamente.

## Proposta comum às alternativas

- Nest é autoridade da sessão e da autorização; Next acessa API pela mesma origem.
- Sessão opaca aleatória, hash persistido, cookie HttpOnly, Secure em produção e política SameSite/CSRF compatível com callback.
- Login OIDC com validação de emissor, assinatura, audience, state, nonce, PKCE e expiração conforme biblioteca/provedor. Consumo único das tentativas.
- Provisionamento inicial restrito e documentado dos coaches; sem cadastro público ou painel administrativo de organizações. Não vincular contas automaticamente por coincidência de e-mail.
- Prazo de sessão, renovação e revogação configuráveis e documentados. Logout revoga servidor e cookie; expiração bloqueia API e rotas.
- Sem modo de login falso em produção. Fixtures de identidade para testes são isoladas; testes locais de protocolo não substituem smoke do fornecedor real autorizado.
- DTOs validados, limites/paginação, proteção de mutações, erros sanitizados, auditoria mínima e rate limiting nos endpoints correspondentes. Nunca registrar token, cookie, e-mail ou senha em logs.

## Alunos — decisão aprovada

Athlete é cadastro pertencente ao coach, separado do vínculo CoachAthleteRelationship. Não introduzir identidade global, organização, compartilhamento multi-coach ou fusão automática de cadastros.

- Cadastro mínimo: nome completo e e-mail; consentimento não pode ser criado pelo treinador em nome do aluno.
- E-mail normalizado para busca e prevenção de duplicatas dentro do mesmo coach; sem unicidade global entre coaches. Regra aprovada e garantida por índice composto na migration.
- Cadastro cria vínculo pendente. Somente o aceite da SPRINT 03 o torna ativo; não adicionar botão de ativação manual nesta entrega.
- Perfil mostra Garmin não conectada sem criar conexão artificial ou credenciais; estados reais de conexão entram na SPRINT 04.
- Listagem paginada, busca por nome/e-mail e filtro de vínculo. Perfil permite consultar/editar dados básicos. Histórico esportivo e análises indicam indisponibilidade até sprints correspondentes, sem fixtures misturadas a cadastros reais.
- Persistência inicial de Coach, sessão/tentativa de autenticação conforme necessidade, Athlete, relacionamento e auditoria mínima; migrations com constraints/indexes e FKs compostas por coachId.
- Toda consulta/mutação exige coachId da sessão. Recurso de outro coach responde como ausente; não aceitar owner livre no payload.

## Plano de implementação após aprovação

1. Fixar biblioteca de autenticação compatível, configurar provider e registrar variáveis sem secrets no Git.
2. Criar modelos/migration inicial e serviços de sessão/autorização, com tratamento de concorrência.
3. Implementar login/logout/sessão atual, callback seguro e proteção de API/rotas; preservar health operacional.
4. Implementar cadastro, consulta, edição, paginação/busca/filtros e perfil de alunos, com ownership no banco e na aplicação.
5. Construir interfaces com o design system existente. Dashboard autenticado continua demonstrativo até SPRINT 10, claramente separado dos alunos persistidos.
6. Testar banco vazio/migrations, autenticação válida/negada, callback/replay/expiração, logout/CSRF e dois coaches sem acesso cruzado; E2E de cadastro/lista/perfil e revisão responsiva.
7. Atualizar documentação, executar build/tipos/lint/formatação/testes e abrir PR da sprint para main. Smoke com provider real depende de configuração autorizada; registrar qualquer pendência explicitamente.

## Critérios de aceitação

Treinador autorizado entra, sai e administra seus alunos persistidos. Acesso anônimo ou de outro treinador é rejeitado em todos os recursos. Vínculo nasce pendente e Garmin não conectada. Nenhuma API de convite, FIT, Garmin ou IA é antecipada. Testes críticos passam e limitações externas estão documentadas.

## Pendências herdadas

Docker/WSL ainda requer verificação de disponibilidade; não alegar execução de Compose sem evidência. CI permanece como modelo por falta de escopo workflow da credencial GitHub; não ativar contornando essa restrição.

## Resultado implementado

Google OIDC via openid-client 6.9.0 com verificação adicional de assinatura habilitada, issuer fixo Google e descoberta oficial HTTPS. Autorização por lista de e-mails Gmail/Workspace com claims verificadas ou subjects Google confirmados para domínios terceiros. Cadastro automático somente após autenticação e autorização, sem união por e-mail. Sessão local opaca por 8 horas configuráveis e tentativas OAuth de 10 minutos com material cifrado, uso único e vínculo ao navegador.

AuthModule e AthletesModule concentram responsabilidades. Constraints compostas e checagem explícita de coachId protegem recursos. Cadastro, vínculo e auditoria são atômicos. Edição exige version e retorna conflito em concorrência. Persistência inicial simultânea do mesmo treinador usa INSERT ON CONFLICT na transação para evitar corrida do primeiro login.

Rate limiting no mesmo PostgreSQL dispensa Redis e compartilha contadores. Chaves derivadas do segredo/origem/IP minimizam exposição, expiração de um minuto; operação de limpeza documentada, sem scheduler antecipado. Auditoria registra identidade/ação/recurso, não payload pessoal. O vínculo atual é 1:1 com o cadastro do coach; histórico de transições fica para os casos de uso futuros, sem reativação manual nesta sprint.

Testes usam TEST_DATABASE_URL diferente do banco operacional e emissor OIDC isolado com JWTs assinados; não há bypass no entrypoint de produção. O teste com conta Google real depende de credenciais/configuração autorizadas e segue pendente. Procedimentos operacionais estão no [README](../../README.md).

## Ajuste autorizado em 2026-11-18 — login fictício local

O responsável técnico determinou que o login seja fictício durante os testes atuais, sem autenticar efetivamente no Google. Google/OIDC permanece preparado, mas configurar credenciais ou validar uma conta Google real deixa de ser requisito para a revisão demonstrativa desta sprint.

Decisão: AUTH_MODE=demo habilita duas identidades fixas exclusivamente locais. Ambas usam issuer urn:balducore:demo, separado do Google, com as mesmas sessões opacas, autorização por recurso, CSRF e persistência já implementadas. Não duplicar toda a autenticação nem tornar o emissor OIDC de teste um serviço do ambiente normal. A rota demo só é registrada nesse modo; origem do POST é validada e a configuração é rejeitada em produção, origem pública ou bind externo. Chave efêmera pode ser gerada localmente quando não fornecida; nenhuma chave de exemplo é usada em produção.

Sem nova migration: o vínculo ao coach/issuer permite rastrear os dados demo, e sessão/alunos são marcados isSynthetic na API. Banner visível em todas as páginas autenticadas identifica conta fictícia e uso exclusivo de dados de teste. A autenticação verifica compatibilidade entre issuer e modo, impedindo misturar sessões Google/demo ou acessar cadastros de outro modo. As duas contas permitem testar isolamento sem informar identidades arbitrárias.

Aceite atual: fluxo demonstrativo navegável e testes de sessão/cadastro/isolamento passando, sem exigir acesso Google. Futuro aceite Google permanece separado antes de ativar uso real. Testes OIDC automatizados continuam como regressão, sem apresentar o emissor de teste como Google real.
