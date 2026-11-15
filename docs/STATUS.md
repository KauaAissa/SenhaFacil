# Matriz de Desenvolvimento

Ultima atualizacao: 2026-11-15. "Em codigo" nao significa aprovado para producao. Mocks, export Hermes e checagem de tipos nao comprovam um fluxo nativo completo. Evidencias antigas abaixo conservam suas respectivas datas.

| Item | Entrega Atual | Verificacao Ainda Necessaria |
| --- | --- | --- |
| 1. Execucao/criptografia | SDK 54, interoperabilidade AES-GCM e provedor PBKDF2 nativo assincrono | Fluxo completo no development build Android; Expo Go rejeita senha explicitamente |
| 2. Ambiente | API Docker/Node22 e PostgreSQL18 demo no Railway; HTTPS/health/contratos HTTP verificados; banco local preservado | Configurar integracoes publicadas, monitoramento e backups/restauracao |
| 3. Development build | Projeto EAS vinculado; APKs assinados no emulador e ARM64 instalado/aberto no Galaxy A12/Android 13, modulos nativos e API via USB verificados | Login da conta existente e fluxos completos no emulador/aparelho |
| 4. Isolamento | SQLite/chaves por conta; legado importado apenas se a chave autentica o payload | Atualizacao com banco legado real, multiplas contas/aparelhos |
| 5. Desbloqueio offline | Perfil em SecureStore, restaura bloqueado, senha local e biometria opt-in por conta/aparelho com chave autenticada; nao aguarda perfil/JWT online | Digital/face forte em aparelho fisico, reinicio em modo aviao e mudanca de biometria |
| 6. Sincronizacao | Versoes/receipts/tombstones/conflitos/aliases atomicos; status da lista atualizado automaticamente apos commits, sem refresh manual | Rede instavel, multiplos aparelhos e transicao/TalkBack fisicos |
| 7. Bloqueio automatico | Background e dois minutos sem toque; destruicao da chave em memoria | Ciclo AppState/biometria/screen capture no Android |
| 8. Revelacao autorizada | Lista so com metadados; facade consulta aprovacao antes da descriptografia | Aprovar/negar/expirar/revogar com dois atores fisicos |
| 9. Autenticacao | Email/celular, v2, refreshidempotente60s; espera progressiva porlogin persistente, UUID deinstalacao/HMAC porconta, avisos e revisao/revogacao de sessoes | SMS/email/posse ainda nao verificados; reteste em novo aparelho, cancelamentos e recuperacao fisicos |
| 10. Contatos | Convites/reconvites serializaveis, aceite/revogacao/permissoes condicionais, conflitos HTTP 409 | Fluxos funcionais em aparelhos; corridas passaram no PostgreSQL |
| 11. Acesso assistido | Uma posicao por pedido, mapa OSM incorporado apos autorizacao; retencao opcional30dias em autorizados/negados, cancelados/expirados apagam o ponto | Fluxo com dois atores, perda de rede, revogacao/expiracao do mapa aberto e disponibilidade do provedor |
| 12. Emergencia | Reautenticacao, fila antes da revelacao, envio idempotente e aviso privado ao familiar | Biometria e FCM reais; push continua best effort |
| 13. Historico | Acesso365dias/GPSconsentido30dias; avisos de seguranca90dias, paginados/autorizados e entrega persistente | Atores reais, push/retencao/restauracao e revogacao em fluxo completo |
| 14. Cofre | Salvar volta diretamente ao cofre, sem esperar sync; clipboard de login/senha ate cinco minutos com limpeza manual/logout | Fluxos de tela, teclado, suspensao do processo e historico de clipboard do sistema |
| 15. Organizacao | Busca por nome, categoria, favoritos, decisao explicita de conflito | Interface em aparelhos pequenos e fonte ampliada |
| 16. Push | Token por sessao, aparelhos ativos, limpeza invalidos, toque verificado, texto privado | Firebase externo adiado; permissao/refresh/encerrado/background em build fisico |
| 17. Recuperacao | DEK preservada, envelopes AES-GCM, kit 256 bits, troca atomica/CAS, revogacao, rotacao do kit e telas completas | Novo aparelho fisico, queda entre etapas, guarda do kit e migracao com dados reais |
| 18. Gerador/ajuda de IA | Palavras aleatorias portuguesas ou caracteres locais; Gemini opcional em quatro passos. Usuario confirmou IA real funcional; senha sempre local | Cotas/custos reais e validacao com idosos/TalkBack; nao e chatbot ou detector de vazamentos |
| 19. Perfil | Login escolhido visivel e nao editavel, telefone de contato separado; atalhos de desbloqueio/senha/kit e acoes organizadas | Atualizacao de perfil e configuracoes de desbloqueio reais no aparelho |
| 20. Acessibilidade | Atkinson Hyperlegible, 100/120/140%, contraste, botoes/switches de 56px, animacao com reduzir movimento, teclado/scroll e navegacao revisados | TalkBack, fonte do sistema ampliada e idosos participantes |
| 21. Privacidade | Exclusao/cascatas/anonimizacao testadas em PostgreSQL; retencao, captura, sem backup/permissao de armazenamento Android | Limpeza/captura no aparelho, backups e revisao LGPD |
| 22. Qualidade/CI | Suites completas API/mobile/crypto; CI remota74d20d4 aprovada; smoke HTTP publicado e cleanup confirmados | Novas alteracoes exigem nova CI; completar testes nativos e externos |
| 23. Testes fisicos | Roteiro e smoke nativo no Galaxy A12: abertura, Hermes/modulos e API via USB | Fluxos completos, TalkBack e participantes; smoke nao equivale a estudo de usabilidade |
| 24. Distribuicao | API HTTPS demo publicada, perfis EAS e APK development assinado | Configurar integracoes, APK standalone, monitoramento/backups e validacao fisica; nenhum AAB/loja |
| 25. Documento academico | Diagramas/contratos em ARCHITECTURE; remocao do DOCX do versionamento aprovada | Concluir commit da remocao; inserir evidencias anonimas apos testes reais |

## Evidencias Automatizadas

### API de demonstracao publicada (2026-11-15)

- CI do commit `74d20d4` aprovada no GitHub. API em `https://senha-facil-api-production.up.railway.app`; PostgreSQL18 com volume/rede privada, sem importar ou resetar o banco local.
- Erros iniciais P1012 de URL invalida/vazia ocorreram antes da conexao. Configurada na API uma URL composta de referencias POSTGRES_* e RAILWAY_PRIVATE_DOMAIN, porta5432/TLS require, sem alterar as variaveis ou imagem do banco.
- Verificacao externa: health ready/live200 com statusok/no-store; security/events401 sem credenciais. A raiz da API nao tem pagina inicial.
- Smoke HTTP real aprovado em34,4s: cadastro, familiar/permissaoparaaprovar, aprovacao/negativa/cancelamento, troca de mestra/recuperacao, rejeicao do kit antigo, sessoes revogadas e refreshidempotente. Payload foi relido da API depois de trocar/recuperar e o ciphertext/DEK permaneceram validos.
- Duas contas ficticias removidas ao final; sessoes retornaram401 apos exclusao. Nenhuma senha real, GPS ou chamada Gemini/FCM usada nessa validacao.
- Roteirocrypto ajustado localmente para ativar familiar antes de item assistido, conferir payload persistido e executar cleanup de todas as fixtures com falha explicita. Lint e tipos, incluindo checagem direta do teste Node, passaram. Sem alteracao na API publicada, commit ou push.
- Gemini/Firebase no servidor publicado, APK independente, notificacoes reais e fluxos nativos com dois atores ainda sao etapas seguintes. Hospedagem de demonstracao nao equivale a homologacao de producao.

### Revisao para envio ao GitHub (2026-11-15)

- Passaram tipos e lint completos dos workspaces. Suites: 200 testes API em 15 arquivos, 261 mobile em 19 arquivos e 26 crypto; total de 487 aprovados. Um smoke HTTP crypto permaneceu ignorado porque exige API de teste especifica.
- A suite completa da API aplicou as 12 migrations em PostgreSQL 16 descartavel e usou apenas credenciais ficticias/transporte simulado. Container e volume de teste removidos; banco local preservado.
- Varredura local por padroes de credenciais nos arquivos candidatos nao identificou credenciais reais. A ocorrencia revisada era um caminho ficticio de teste Firebase. Isso nao certifica ausencia de segredos em todo o historico Git.
- Ignores revisados para excluir IDE, ambientes privados, chaves, bancos/backups e artefatos de build. EAS preserva google-services.json cliente para compilacao e exclui material local; Docker permanece restrito a API.
- DOCX academico marcado para permanecer fora do versionamento; a exclusao existente foi confirmada como intencional. Gitignore nao remove arquivos ja rastreados ou seu historico: a remocao ainda precisa do commit manual do usuario.
- Link de APK fora do repositorio substituido por referencia explicita a artefato local. Nenhum commit, staging, push ou deploy executado nesta revisao; CI remota e hospedagem permanecem proximas etapas.

### Pacote da API para hospedagem (2026-11-15)

- Dockerfile na raiz compila somente a API, gera Prisma Client Linux e usa runtime sem privilegios. Contexto/arquivos copiados restritos; nenhum ambiente privado, mobile, fonte ou fixture no runtime. Prisma CLI disponivel para predeploy.
- Configuracao HTTP valida porta, exige JWT privado com pelo menos 64 caracteres e DATABASE_URL PostgreSQL em production; headers de proxy nao sao confiados por padrao. CORS normalizado igualmente para HTTP/WS e shutdown hooks ativados.
- Health publico/no-store preserva throttle global: live sem consulta; ready consulta banco e retorna 503 em falha conhecida, sem mensagem interna. Falha inesperada continua erro, nao sucesso.
- 30 novos testes focados de HTTP/configuracao passaram; tipos, lint relacionado e build API aprovados. Docker Linux compilou e executou Argon2 nativo com senha ficticia.
- Smoke no container real/PostgreSQL 16 isolado aplicou as 12 migrations, verificou ready/live 200, rota de avisos 401 sem credenciais e, apos parar apenas o banco de teste, ready 503/live 200. Containers, volume anonimo e rede descartaveis removidos; banco local/API/Metro originais preservados.
- CI adicionada a etapa de buildDocker; execucao remota ainda depende do envio e verificacao no GitHub. Nenhuma credencial, dado local ou imagem foi enviada para hospedagens nesta preparacao.
- Railway online, configuracao Firebase/Gemini publicada, URL HTTPS e APK preview ainda dependem das etapas externas. Login do painel aberto; isso nao constitui deploy.

### Controles de seguranca e avisos (2026-11-15)

- Perfil aprovado: 5 leituras distintas/10 copias/3 exclusoes em 60s pedem identidade real e liberam 60s; pedidos 5/min/conta e 3 pendentes; falhas de login 3/5/8 em 15min geram 5s/30s/2min. Familiares ACTIVE/APPROVE recebem avisos; auditoria de 90 dias sem segredos/GPS.
- Senha/kit/recuperacao auditados atomicamente; revogacao sem apagar copias offline. Instalacao usa UUID/HMAC por conta, nao IMEI ou prova de hardware. Revisao/revogacao de sessoes requer credencial atual e protege sessao atual/estranha.
- Outbox persistente com revalidacao, leases/dedup/backoff e ate seis tentativas. Sem FCM, aviso no app. Incidentes semelhantes agrupam entrega por 15min, sem excluir auditoria. Relatos limitados a 100/min/conta, sem tipo SERVER, senhas/sites/coordenadas.
- Guarda antes da quinta senha/decima copia/terceira exclusao, alias normalizado e fila SQLite sem plaintext. PIN/biometria/mestra precisam abrir nova chave; dialogo sozinho nao libera. Emergencia preservada; servidor correlaciona relatos apos negativa/repetidos e audita exclusoes confirmadas sem contar retries.
- Passaram 101 testes API focados com 12 migrations/PostgreSQL isolado/HTTP/JWT, incluindo rollback, permissoes, prazos, limites, coalescencia, leases, transporte simulado, revogacao/exclusoes e compatibilidade. Passaram 157 mobile relacionados a limiares, chave, fila/receipts, emergencia, login, PIN/biometria/notificacoes/erros. Tipos, lint e build API aprovados.
- Previa ficticia confirmou quinta senha oculta, mestra incorreta nao revela, correta reabre a chave e continua, um incidente, origem DEVICE_REPORT clara e revogacao correta sem tocar sessao atual. A 320px/texto 140%/contraste, controles legiveis. Nenhuma conta/chave/PIN/GPS reais usados.
- Migration `20261115000200_security_activity` aplicada apos backup no D: restrito, sem reset. Sem dependencia/modulo nativo/novo APK. Reteste fisico do gate, instalacao, FCM com dois atores, TalkBack/offline recomendado. Relatos podem ser omitidos por cliente adulterado; nao declaramos deteccao infalivel de fraude.
- Export Android definitivo passou (1.842 modulos, HBC7,44MB), sem fixture no workspace principal. Previa/copia temporaria encerradas e restauradas. Com autorizacao, app normal reaberto no smartphone sem reinstalacao ou limpeza; API de avisos protege com401 sem credenciais, Metro/runtime conectados e datas da instalacao preservadas.

### Status automatico e mapa reduzido (2026-11-15)

- Cache confirmado notifica a lista focada apos PUSH/PULL; confirmacoes parciais aparecem mesmo se o restante falhar. Snapshot tardio/conta diferente e ignorado, listener removido ao sair da tela. Texto/icone verde Sincronizada, neutro Aguardando sincronizacao e amarelo Revisar sincronizacao; fade180ms respeita reduzir movimento.
- 73 testes mobile focados passaram, incluindo11 casos do SyncService com SQLite real em memoria: ack antes do fim do PULL, falhas antes/depois do commit, mudanca de conta/stop, unsubscribe, erro de listener, lote parcialmente confirmado e conflito. Tipos/lint relacionados aprovados. Sem migracao, dependencia ou novoAPK neste ajuste.
- Previa isolada confirmou atualizacao sem reload, filtro preservado, ausencia de loader inicial, unsubscribe no blur, evento de outra conta ignorado e conflito nao apresentado como sucesso. Teste320px/texto140%/contraste: ambos os estados legiveis dentro do cartao. Aba integrada inativa pausa animacoes CSS; estado visual foi conferido em reduzir movimento, nao como medicao fisica do fade no A12.
- Mapa nativo simplificado para © OpenStreetMap com link de origem/licenca. Removidos reportar/doacao/termos opcionais, nao o copyright obrigatorio. Script real aplicado ao embed publico de0,0 confirmou uma unica atribuicao/link e limpeza reaplicada apos reconstruir o rodape. Nenhuma localizacao real ou credencial usada.
- Export Android aprovado (1.831 modulos,HBC7,39MB); fixtures apenas em copia isolada e removidas ao concluir. App normal reaberto com autorizacao para reiniciar o servico de sync, sem reinstalar ou apagar dados; firstInstallTime preservado. API/Metro e runtime normal conectados. Reteste da transicao nativa/TalkBack continua recomendado.

### Retorno ao cofre, mapa e historico (2026-11-15)

- Salvar criacao/edicao usa destino deterministico no cofre, sem depender de uma tela anterior. Ref de gravacao impede chamadas duplicadas; falha preserva o formulario. Previa ficticia confirmou entrada direta por URL e entrada pela lista, retorno apos sucesso, item visivel e duplo toque sem duplicacao.
- Convite Reportar um problema removido do embed Android, preservando copyright/creditos. Script real aplicado ao embed publico de0,0 confirmou ausencia do link e do separador antes do copyright, inclusive apos zoom.
- Titular escolhe por pedido, inicialmente desativado, Guardar este ponto no historico por30dias. Apenas true explicito e GPS valido criam historyExpiresAt=requestedAt+30dias. Prazo de acesso a senha continua10minutos. Sem consentimento/cliente antigo, resolucao apaga o ponto; cancelamento/expiracao sempre apagam.
- APPROVED/DENIED retidos sao consultados somente sob demanda pelo titular ou familiar ainda ativo/APPROVE_ACCESS, com JWT/sessao e requester ativo. Listagens retornam apenas prazo, nunca coordenadas; endpoint protegido e no-store. Limite exato de30dias aplicado na leitura antes do cron; cleanup na inicializacao/a cada minuto apaga pontos vencidos sem remover a auditoria de365dias.
- 66 testes API focados aprovados, incluindo HTTP/JWT/PostgreSQL isolado com todas as11 migrations, permissao/revogacao, prazo, retry sem extensao/consentimento retroativo, clientes antigos, cancelados/expirados e semGPS. 74 mobile focados aprovados; tipos/lint relacionados e build API passaram.
- Previa isolada com dados ficticios: mapa nao carrega ao abrir historico nem antes de consentir; fechar/sair remove detalhes; simulacao de passagem de31dias remove ponto sem apagar registro.320px/texto140%/contraste sem overflow, controles cortados ou botoes menores que56px. Nenhuma conta, chave, GPS ou Gemini reais usados.
- Migration20261115000100_location_history aplicada no banco local apos backup custom com acesso restrito no D:, sem reset. Datas novas nulas para pontos antigos; coordenadas apagadas anteriormente nao podem ser recuperadas. Esta alteracao nao exige novoAPK para o cliente comWebView instalado em2026-11-11.
- Reteste completo no smartphone, com dois atores e retencao real, ainda recomendado; a previa/HTTP nao substituem TalkBack ou estudo com idosos.
- Export Android definitivo passou (1.831 modulos, HBC7,38MB), sem fixture no workspace/bundle. API e Metro principais responsivos, rota historica protegida com401 sem credenciais e runtime normal do smartphone conectado. Salvar depois de sair do formulario nao rouba a navegacao da tela atual. Previa, fixtures e temporarios removidos ao concluir.

### Ajustes de results.md (2026-11-11)

| Ajuste solicitado | Entrega |
| --- | --- |
| Mostrar senha e primeira letra maiuscula | Ver/Ocultar em todos os campos secretos pelo componente compartilhado, sem auto-capitalizacao/correcao; background volta a ocultar |
| IA simples/desproporcional | Tres modos, fluxo IA em quatro passos e seis palavras aleatorias locais aprovadas pelo usuario; nunca usa gostos/nomes pessoais |
| Sobreposicao sobre abas/lista | Safe-area sem duplicacao no rodape, sombra removida, rotulos ajustados e Adicionar senha rolavel no cabecalho |
| Secao de desbloqueio confusa | Atalho no inicio da Conta; desbloqueio/troca de senha/kit separados, senha e botao de confirmacao por acao, caminho para configuracoes Android |
| Login por email ou telefone e perfil | Identidade de entrada unica/canonica; celular brasileiro com DDD sem SMS. Campo de login imutavel e telefone de contato separado; API, kit, JWT e convites atualizados |
| Login repetido | Teste reproduziu corrida: resultado do dialogo chegava antes do evento active; escopo aguarda retorno ao foreground, sem liberar background fora do dialogo |
| Copiar login | Acao separada usa o clipboard sensivel de cinco minutos e respeita a mesma autorizacao da senha |
| Campo oculto pelo teclado | Foco e evento de teclado rolam formularios/listas com responder real e adjustResize; no A12, campo ficou ~24dp acima do teclado a 140% |
| Coordenadas pouco amigaveis | Mapa OSM incorporado opcional, horario e margem de precisao legiveis; autorizacao antes do envio ao provedor, sem GPS no mapa |
| Motivo sem utilidade | Input e envio removidos da decisao; registros/API antigos continuam compativeis |

- Testes finais focados: 96 API, incluindo HTTP Nest/Fastify/JWT com PostgreSQL isolado e migracoes novas/legadas; 135 mobile e oito crypto. Tipos API/mobile/crypto, lint relacionado, build API e export Android definitivo passaram. Testes nao representam suite completa ou CI remota.
- Migracao de identidade aplicada no banco local apos pg_dump custom de acesso restrito no D:; contas/cofre existentes preservados. Bases temporarias dos testes removidas; nenhum reset ou limpeza de banco real.
- Previa ficticia a 320/360px, texto140% e contraste: sem overflow horizontal/controles cortados, alvos >=56px, quatro rotulos de abas em uma linha, ultimo item acima da navegacao. IA so consulta apos consentimento, nao gera automaticamente e descarta sugestao alterada. Seis palavras sorteadas, Ver/Ocultar, login read-only, secoes de seguranca e copia dupla inspecionados.
- Galaxy A12 Android13: novo APK ARM64 com WebView compilado em 5m43s no D:, assinado pelo certificado original, alinhamento16KiB verificado e instalado por atualizacao; firstInstallTime preservado em 2026-11-08. Tamanho93.822.382 bytes, SHA256 `bb4765d6037ea633c6d1878ffb2b926defa7170fb93f6ab4f142ced00c0b9385`.
- Na fixture Android, campo secreto manteve texto ficticio e foco ao revelar; campo nome/senha acompanhou teclado a140%, com limite inferior ~471dp e teclado ~495dp. Mapa real de ponto ficticio0,0 abriu dentro do app apos aviso/autorizacao, sem capturar GPS. Nao foram usadas contas, chaves/PINs nem localizacao reais. Fixtures removidas antes do bundle final.
- Usuario informou: IA real funcional no smartphone. Registrado como relato do usuario, nao como nova chamada ao Google executada pelo assistente. Provedor permanece apenas para regras; senhas continuam locais.

### O que ainda resta

1. Reteste manual de login/logout, cadastro por celular, copiar/colar e ativacao de bloqueio/digital em conta de teste no A12. Rosto simples pode ser incompativel; nao enfraquecer o Keystore para oferece-lo.
2. Dois aparelhos/atores: autorizacao, expiracao, cancelamento e revogacao com mapa aberto, rede oscilante, emergencia offline, sincronizacao e recuperacao com kit em outro aparelho.
3. TalkBack, fonte do sistema ampliada, reduzir movimento e testes consentidos com idosos. Previa e smoke no A12 nao certificam acessibilidade.
4. Validar FCM real (background/encerrado/toque/rotacao de token), cotas/custos Gemini e continuidade de servicos. Cotas de IA em memoria nao sao teto financeiro/distribuido.
5. Antes de producao: verificacao de posse e alteracao segura de email/celular, tratamento de numeros reciclados, HTTPS/hospedagem, restauracao de backups, monitoramento/LGPD e termos do provedor do mapa.
6. Confirmar CI remota e preparar release/AAB/publicacao; perfis configurados nao significam deploy. Atualizar DOCX com implementacoes e evidencias anonimas reais. Voz, rastreamento continuo, chatbot conversacional, autofill e iOS continuam fora do escopo aprovado.

### Smartphone Android por USB (2026-11-08)

- Galaxy A12/Android 13/API 33 reconhecido apos driver Samsung e Depuracao USB, com ABI arm64-v8a confirmada. APK ARM64 local de 85.200.140 bytes, assinatura original/alinhamento 16 KiB verificados, instalado e MainActivity aberta sem desinstalacao ou limpeza.
- Build isolado no D: passou em 9m25s apos limitar Ninja a dois compiladores/um linker e Gradle a um worker. Primeira tentativa atingiu limite de memoria comprometida; nao alteramos paginacao, SDK ou linker do workspace, nem encerramos programas pessoais.
- Banco original healthy, API/Metro persistentes e portas 3000/8081 redirecionadas por USB. Hermes do aparelho confirmou modulos de localizacao/credencial e resposta HTTP 401 esperada da API sem conta. Bundle verificado localmente sem chave Gemini embarcada.
- Configuracao USB limitada ao processo Metro, preservando `.env` do emulador. Roteiro de reabertura em VALIDATION_AND_RELEASE. Login completo, Gemini real, TalkBack e protecoes nativas em uso ainda precisam teste manual; nenhuma chamada externa, captura de localizacao ou credencial do aparelho executada.

### IA guiada e geracao local (2026-11-08)

- Implementados endpoint JWT/ELDERLY, esquema estrito de tres preferencias, Gemini REST no servidor com modelo configuravel, JSON Schema, limite de resposta e timeout; sem texto livre, dados da conta/cofre ou senha na chamada ao provedor.
- Gerador offline anterior preservado; novo modo sem simbolos e validacao de politicas com minimo 16. Motivos exibidos sao mensagens locais, nao texto livre do modelo. Consultar nao gera/salva; gerar/substituir exige acao do usuario. Consentimento expresso e aviso de tratamento de dados do tier gratuito.
- 49 testes focados API, incluindo HTTP Fastify com JWT real ficticio, sessao/papel, payload/headers, respostas invalidas, HTTP/cotas, concorrencia, timeout e limites. 119 testes focados mobile cobriram IA, formatos/forca de todas as combinacoes, cancelamento, sessao, acesso assistido e localizacao. Cinco testes focados crypto cobriram formatos/tamanhos/grupos, ausencia de simbolos, rejeicao de RNG e amostragem sem modulo enviesado.
- Tipos API/mobile/crypto, lint relacionado, build API e export Android Hermes passaram. Bundle de 1.820 modulos e HBC de aproximadamente 7,3 MB. Warning preexistente de export subpath noble/hashes nao impediu a compilacao.
- Previa web com fixture removida: sem campos de texto livre, consulta bloqueada ate consentir, sugestao nao altera senha automaticamente, geracao local no tamanho escolhido, preferencia alterada remove sugestao, fechamento descarta resposta tardia e reinicia consentimento. Teclado Espaco, alvo >=56px, 320/390px, texto a 140% e contraste reforcado, sem overflow horizontal.
- Nenhuma chave/cobranca ativada automaticamente, chamada real ao Google, migracao ou build nativo executado. Preview/fixtures temporarios removidos e servidor de validacao encerrado. Configurar GEMINI_API_KEY/AI_PASSWORD_ENABLED privadamente e validar um pedido real ainda e necessario; testes usam resposta simulada e nao comprovam latencia/cota do provedor. Android fisico/TalkBack/confirmacao de substituicao permanecem pendentes.
- Sonda somente de configuracao com fetch bloqueado confirmou available=false/provider=GEMINI no ambiente local atual; nenhum segredo exibido ou servico externo contatado. A integracao esta pronta em codigo, mas ainda desativada ate configurar chave/flag no servidor.
- Cotas em memoria e o total diario limitam somente o processo do prototipo. Reiniciar ou escalar exige cotas persistentes/distribuidas antes de release; gratuidade depende do projeto/provedor.

### Bloqueio do aparelho com chave protegida (2026-11-02)

- Modulo Expo local Android, descoberto pelo autolinking e compilado no APK. Exige Android 11/API 30+, bloqueio de tela seguro e ativacao explicita com senha mestra correta. Aviso informa que quem conhece PIN/padrao/senha do celular podera abrir o cofre. Nao criamos nem recebemos credencial curta do app.
- Keystore AES-256-GCM com autenticacao de credencial por operacao (timeout zero), vinculado ao Cipher/CryptoObject do prompt DEVICE_CREDENTIAL. Ciphertext/IV/alias/digest da DEK aleatoria em arquivo atomico noBackupFilesDir por conta; chave do Keystore nao exportavel. Nao e apenas um dialogo seguido de leitura desprotegida.
- Bloqueio do celular e a opcao principal apos ativacao; biometria forte independente e senha mestra preservadas. Emergencia offline usa nova reautenticacao e mantem auditoria. Login com senha nao recria copias nem pede outro prompt. Cancelamento nao muda de metodo automaticamente. Geracao da chave/sessao descarta respostas tardias; invalidacao permanente remove somente a copia local do aparelho.
- Suite mobile completa de 147 testes passou; depois dos ultimos ajustes, 73 testes focados passaram, incluindo tres casos novos de invalidacao e independencia das alternativas. Tipos mobile e lint das superficies alteradas passaram. Build Kotlin/Gradle e Android Lint do novo modulo passaram; relatorio final: No issues found. Os guards API 30 sao explicitos, sem elevar o Android minimo do restante do app.
- Emulador API 37: com PIN ficticio temporario autorizado, ativacao cifrou uma chave ficticia, leitura apos nova confirmacao retornou os mesmos 32 bytes, nova operacao exigiu prompt novamente e cancelamento retornou DEVICE_AUTH_CANCELLED sem chave. Remover e recriar a credencial invalidou a copia anterior (DEVICE_AUTH_KEY_INVALIDATED). Nenhum cofre/conta real foi acessado.
- APK x86_64 compilado e assinado no D: com certificado original, instalado por atualizacao sem desinstalacao ou limpeza de armazenamento. Primeira instalacao preservada; modulo real disponivel no Hermes. A chave ficticia e o PIN temporario foram removidos; o usuario deve configurar seu proprio bloqueio no emulador para ativar a opcao.
- Ainda pendentes: Android 11 fisico e fabricantes diferentes, padrao/senha em vez de PIN, biometria forte real como alternativa, TalkBack e fluxo completo da conta pelo usuario. Emulador nao comprova hardware-backed/StrongBox, resistencia a root ou apagamento forense de strings/buffers.

### Localizacao pontual de pedidos (2026-11-02)

- `expo-location ~19.0.8`, conforme SDK 54 instalado, com bloqueio explicito de ACCESS_BACKGROUND_LOCATION e FOREGROUND_SERVICE_LOCATION. Introspeccao Expo confirmou somente ACCESS_COARSE_LOCATION/ACCESS_FINE_LOCATION, sem modo iOS background. APK anterior recebe orientacao de atualizacao, sem importar modulo nativo ausente.
- Cadastro/ativacao consulta e, se necessario, solicita permissao em escopo de prompt nativo, sem ler GPS. Facade repete a verificacao antes de salvar nova protecao; edicao de protecao existente nao e desprotegida por permissao revogada. Senhas comuns e emergencia offline nao consultam localizacao.
- Pedido tenta um fix, com limite de espera de 12s, descarte de resultado tardio e cancelamento logico por foco/sessao. Posicao com mais de 60s, coordenadas invalidas ou precisao ausente e descartada; horario de envio e ancorado na API. Falha permite pedido com aviso, nunca coordenadas ficticias.
- Migration `20261102000100_request_location` aplicada ao PostgreSQL existente, sem reset, e Prisma Client regenerado. Snapshot separado, imutavel em retry, leitura apenas de PENDING vigente com vinculo ativo na mesma consulta e Cache-Control no-store. Aprovar/negar/cancelar apaga na transacao; cron e inicializacao limpam vencidos. Historico, estado, FCM e WebSocket nao incluem coordenadas.
- 127 testes mobile e 48 testes focados API passaram, incluindo nove cenarios de integracao PostgreSQL, concorrencia, revogacao, exclusao e DTOs. Tipos mobile/API, lint relacionado, introspeccao de permissoes e bundle Android completo do Metro passaram (HTTP 200, 13.180.744 bytes).
- Instalacao teve um EPERM transitorio e passou na repeticao offline. Prisma DLL precisou liberar brevemente somente o runtime da API e foi regenerado; API voltou a responder HTTP 401 sem credenciais, Metro HTTP 200. Emulador pausado com autorizacao apos falta de memoria, sem apagar dados ou alterar Windows/paginacao.
- Na entrega inicial nao havia novo APK. A atualizacao nativa descrita abaixo confirmou modulo e dialogo de permissao; GPS e fluxo completo entre dois atores continuam pendentes. Coordenadas apagadas dos dados ativos nao implicam eliminacao forense de WAL/backups de infraestrutura.

### APK local com localizacao (2026-11-02)

- Build local concluido em copia isolada `D:\Android\Builds\SF-20261102`, sem mover o workspace ou enviar codigo para build remoto. Java 21, SDK, Gradle, dependencias e temporarios no D:. pnpm 9.0 ignorava encurtamento; pnpm 9.15.9 com layout hoisted somente nessa copia resolveu os limites Windows de prefab/CMake/Ninja. Versoes/lockfile do projeto original preservados.
- Assinatura original recuperada pela sessao EAS existente e guardada fora do repositorio com ACL restrita, sem exibir senhas. Certificado verificado contra o APK realmente instalado antes da atualizacao.
- `SenhaFacil-location-20261102-x86_64.apk`: 87.293.124 bytes, SHA-256 `7685d1bb7d57032c7d66d316af7089405f135d4d5efcc393572edd56a22caa6c`. Apenas x86_64 para emulador, nao um APK ARM para celular nem release. Alinhamento e assinatura verificados; manifesto final inclui COARSE/FINE_LOCATION, sem BACKGROUND_LOCATION ou FOREGROUND_SERVICE_LOCATION, allowBackup=false.
- Instalado por `adb install -r --no-streaming`, com Success e firstInstallTime original preservado (2026-10-10 20:55:20). Nao houve desinstalacao, Wipe Data, limpeza do cofre ou recriacao de contas.
- Novo APK abriu conectado ao Metro do workspace original. Hermes confirmou ExpoLocation e os metodos nativos de consulta/solicitacao de permissao. Solicitacao diagnostica abriu GrantPermissionsActivity do Android, deixada para o usuario decidir; nenhuma permissao foi concedida por automacao e nenhuma posicao foi lida.
- Pico de memoria impediu a primeira inicializacao do emulador/API; nova tentativa sequencial passou, com API em processo unico compilado para reduzir memoria. Banco existente, API e Metro responderam ao final. Nenhuma alteracao de paginacao ou encerramento de programas pessoais.

### Ajustes de usabilidade e autenticacao (2026-11-02)

- Ativacao de acesso assistido exige consulta online e familiar ACTIVE com APPROVE_ACCESS e conta ativa. Regra aplicada ao formulario, facade mobile e criacao/edicao/sincronizacao da API. Revogacao nao remove protecao existente; tela orienta reparar o vinculo e pedidos aguardam sincronizacao do item.
- Biometria tornou-se opt-in em Seguranca, por conta/aparelho e com senha mestra confirmada. Usa uma unica leitura autenticada do SecureStore para desbloquear; nao substitui protecao da chave por uma verificacao visual. Digital e face dependem do suporte forte do sistema; cancelamento, indisponibilidade e invalidacao preservam a alternativa por senha.
- Login nao regrava a chave biometrica nem abre um segundo prompt. Ciclo de vida distingue prompts nativos controlados de saida real para segundo plano; sair durante autenticacao invalida o resultado tardio. Regressao cobre logout seguido de um unico login v2.
- Mensagens centralizadas traduzem validacoes, conflitos, permissoes, expiracao, indisponibilidade e rede; corpos HTTP, stack traces e detalhes desconhecidos nao sao exibidos. Cadastro/login/recuperacao/convites validam e-mail completo localmente.
- Abertura com logo existente: entrada de 360 ms e saida de 160 ms apos fontes/sessao prontas, sem repeticao; reduzir movimento remove a transicao.
- 110 testes mobile e 14 testes focados da API passaram, assim como tipos mobile/API, lint dos arquivos relacionados e bundle Android servido pelo Metro. Testes mobile usam PBKDF2 nativo Node com 600.000 iteracoes; nao reduzem parametros nem comprovam autenticacao biometrica no Android fisico.
- Validacao visual/facial/digital no aparelho permanece pendente. Emulador pausado com autorizacao para executar validacoes apos falhas por memoria; usuario escolheu concluir sem reabri-lo. API e Metro permaneceram disponiveis. A paginacao no D: ainda nao estava ativa na verificacao, sem nova alteracao do Windows nesta etapa.

### Evidencias anteriores

- Crypto: 18 testes locais e 1 HTTP passaram, incluindo timers, provedor nativo, limpeza e referencia Node com 600.000 iteracoes.
- API: 29 testes unitarios e 7 de integracao PostgreSQL passaram; 36 no total.
- Mobile: 40 testes passaram, incluindo SQLite real em memoria, cadastro/migracao v2, envelope offline, kit pendente, rejeicao de envelope ausente, cancelamento de login tardio, refresh perdido, assistente local e adaptador PBKDF2. Regressao confirma desbloqueio sem esperar perfil online e rejeita Expo Go sem calculo prolongado. O adaptador foi testado com `node:crypto`, nao com OpenSSL Android.
- Total: 95 testes passaram em `pnpm test` com `INTEGRATION_TESTS=1` e `HTTP_TESTS=1`. Sem flags externas, a suite normal executa 87 testes e ignora 8.
- `pnpm typecheck` e `pnpm lint` passaram nos quatro pacotes; diagnosticos de src/test sem erros. Export Android gerou bundle Hermes de 6,96 MB com 1779 modulos e 48 assets. Export nao e um APK/AAB assinado.
- Patch de timers resolveu starvation, mas nao o custo nativo: uma derivacao ficticia no Expo Go permanecia em execucao apos 325s com timers ativos. PBKDF2 nativo assincrono foi integrado sem mudar parametros/chaves. Expo Go agora encerra senha com orientacao de development build. Nao declarar login funcional no aparelho somente com testes Node/export.
- Build local no D: falhou com CMake/Ninja e caminhos longos. No EAS, o primeiro build (`20e5cf70-f5b2-4916-9056-985bee492dea`) falhou porque Quick Crypto 1.1.8 exige `PropNameIDCache`, ausente no Nitro 0.31.2. Nitro alinhado a 0.33.2 (versao usada pelo gerador da biblioteca), header verificado, dois testes do adaptador e tipos mobile passaram.
- Novo build EAS sem cache (`1d53e200-958d-447f-814b-509fd9f23994`) terminou com `FINISHED` em 2026-10-10 e gerou APK development assinado. Assinatura local verificada com Java 21; instalacao ADB sem streaming retornou `Success`, e o app abriu conectado ao Metro. O emulador travado foi reiniciado com autorizacao, sem wipe de dados, usando SwiftShader e Vulkan desativado. Dados do Expo Go preservados. Nenhuma publicacao ou AAB de release.
- Sonda ficticia no Hermes do APK instalado verificou PBKDF2-SHA256 com 600.000 iteracoes em 5.008 ms, 300 ticks de timer e resultado identico a referencia Node. Chave/buffers destruidos e metadados temporarios removidos. Processo do app ativo e sem erros nos logs JS/AndroidRuntime consultados. Isso valida uma derivacao no emulador, nao o login da conta do usuario nem todos os fluxos fisicos.
- Tres migrations adicionais aplicadas sem resetar volume: protecao do cofre, cancelamento e retry de refresh. Oito migrations no total incluindo a inicial.
- Nenhum teste fisico foi registrado; CI remota ainda nao executada nesta entrega.
- Smoke HTTP v2 reproduzivel passou: cadastro, contatos/permissoes, cancelamento, troca, recuperacao, kit anterior recusado, ciphertext preservado, pagina e refresh idempotente. Contas ficticias removidas no final.
- Previa web inspecionada com Playwright: login/cadastro/recuperacao, cofre e cuidador/seguranca com metadados ficticios; fonte e PNG renderizaram, alvos de pelo menos 56px e ausencia de overflow em 320px e desktop. Cuidador/seguranca tambem verificados com texto de 140%; switch exposto como um unico controle com estado marcado. Fixtures em memoria removidas e previa devolvida ao login. Isso nao e evidencia de autenticacao nativa ou dados reais.

## Bloqueios de Publicacao

1. Confirmar CI remota e ampliar validacao de dados existentes/rede/aparelhos; banco/migrations, integracao PostgreSQL e smoke HTTP local ja passaram.
2. Revisar o protocolo v2 e validar enrolamento/migracao/recuperacao em aparelhos; contas antigas enviam a senha uma vez antes de migrar. Senhas fracas e dispositivos comprometidos continuam riscos.
3. Validar ciclo nativo, autorizacao, acessibilidade, migracao e exclusao em aparelhos reais com contas ficticias.
4. Vincular Firebase/EAS com o usuario e configurar HTTPS, secrets, backups/retencao e monitoramento.
5. Fechar demais riscos da matriz, produzir artefatos e registrar evidencias verdadeiras antes de declarar o app pronto.