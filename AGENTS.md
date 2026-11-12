# BalduCore — regras permanentes

BalduCore é a plataforma; BalduTraining é a operação e identidade visual inicial. O usuário é o responsável técnico e arquiteto; o agente executa a engenharia.

- Leia [produto](docs/product/mvp-01.md), [arquitetura](docs/architecture/overview.md), [domínio](docs/architecture/domain-model.md), [Garmin](docs/integrations/garmin.md), [roadmap](docs/roadmap.md) e [ADRs](docs/decisions/adr-001-stack.md) antes de alterar o escopo correspondente.
- Trabalhe somente na sprint autorizada. Apresente plano, alternativas relevantes, trade-offs e recomendação; aguarde aprovação para decisões arquiteturais relevantes e para iniciar a próxima sprint. Não marque sprint concluída sem aprovação e documentação atualizada.
- Use uma branch por sprint (`sprint/NN-descricao`) e abra PR para `main`. Não faça push direto ou merge em `main` sem autorização explícita. Descreva comportamento, validação e limitações no PR.
- Prefira monólito modular, responsabilidades claras e abstrações que resolvam problemas concretos. Não antecipe microsserviços, SaaS complexo ou MVP 2.
- Preserve as oito imagens em [referências](docs/design/references/) como fonte de verdade visual. Cor principal: `#EF3338`; respeite dark/light, sidebar e layout responsivo. Não trate PNG como código-fonte.
- Somente treinador acessa dashboard. Aluno usa convite/autorização e mecanismo seguro de revogação/encerramento. Separe estados de convite, vínculo e Garmin.
- Verifique autorização por recurso e isolamento por treinador. Valide entradas, proteja tokens e segredos, redija logs e mantenha auditoria e consentimentos. Nunca armazene senha Garmin.
- Garmin somente por API oficial aprovada; não invente endpoints, escopos ou payloads. Mock e dados sintéticos devem ser identificados. Processamento assíncrono, idempotente e com retentativas controladas.
- Separe normalização, análise determinística e interpretação por IA. Não invente métricas, causalidade ou sensações do aluno; não gere diagnóstico clínico. Diferencie fato, evento, hipótese e recomendação com evidências autorizadas.
- Verifique versões estáveis compatíveis antes da instalação; fixe versões e lockfile. Execute checks/testes pertinentes e revise o diff. Priorize convites, autorização, concorrência, idempotência e isolamento.
- Registre decisões relevantes em ADRs e atualize o roadmap. Ao entregar: funcionalidades, arquivos principais, decisões, testes/resultados, limitações, débitos e próxima sprint sugerida.
