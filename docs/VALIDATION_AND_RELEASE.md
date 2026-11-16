# Validacao e Distribuicao Android

## APK independente do TCC (2026-11-15)

[Download do APK preview](https://expo.dev/artifacts/eas/4Z06AMW3plUYWaPc1pmclBm5pFbdq8j0qyaGmZhAy6c.apk). Copia local: `D:\Android\Builds\SenhaFacil-TCC-preview-20261115.apk`.

Build EAS `2975b140-ad6e-43e5-a012-014d76f9001c`, versao0.1.0/versionCode2, assinatura original preservada. APK release nao-debuggable, bundle incorporado com APIHTTPS e alinhamento16KiB verificados. SHA-256 `814228f680924d2701924d3567ae4c1336a9e30ac286f7805b2aa704443649e3`.

1. Instalar como atualizacao nos aparelhos de teste, sem uninstall/limpeza. Confirmar assinatura e pacote antes de atualizar uma instalacao existente.
2. Criar contas ficticias no banco de demonstracao publicado; banco local anterior nao foi importado automaticamente.
3. Usar internet movel/Wi-Fi normal, sem Metro, API local ou adb reverse, para comprovar independencia do computador.
4. Testar cofre, gerador local, Gemini, vinculo familiar, pedidos/aprovacoes e notificacoes nos dois aparelhos, incluindo background/toque no aviso.
5. Testar modo aviao/desbloqueio/kit, leitura ampliada e TalkBack. Verificar captura/espelhamento antes do TCC, sem remover a protecao.

Firebase Admin foi configurado no servidor e Gemini real validado, mas FCM e fluxos nativos deste APK ainda precisam dos testes acima. O build nao foi submetido a Play Store nem homologado para usuarios reais.

## Implantacao online de demonstracao

O pacote e as configuracoes de Railway estao em [README > Pacote de API para Railway](../README.md#pacote-de-api-para-railway). A preparacao local nao publica servicos nem importa o banco atual.

Em 2026-11-15, API e PostgreSQL18 de demonstracao foram publicados. HealthHTTPS e smoke de contratos com duas contas ficticias passaram; ambas foram removidas. Detalhes/limites em [STATUS](STATUS.md#api-de-demonstracao-publicada-2026-11-15).

Ordem:

1. Enviar a versao atual do codigo ao GitHub, excluindo ambientes privados, contas de servico, chaves de assinatura e arquivos pessoais; conferir CI.
2. Entrar no Railway, configurar plano e controle de Compute Usage. Hard limit pode parar workloads; nao chegar ao dia da apresentacao sem margem.
3. Criar PostgreSQL com armazenamento persistente em projeto de demonstracao; manter banco local intacto e rede do banco privada.
4. Criar/configurar servico API na raiz do repositorio para detectar Dockerfile. Definir variaveis privadas, predeploy Prisma, readiness e processo continuo antes da publicacao.
5. Confirmar migrations e health HTTPS do ambiente real, autenticar contas ficticias e testar HTTP/WS. Usar predeploy com falha bloqueante, nunca reset.
6. Configurar Gemini/Firebase no servidor e validar consulta/push reais com titular e familiar; nao mostrar credenciais em captura ou chat.
7. Definir URL HTTPS em EXPO_PUBLIC_API_URL do perfil preview e gerar APK standalone, preservando assinatura e dados da instalacao existente.
8. Testar com dois aparelhos por internet movel, sem API/Metro locais, incluindo perdas de rede, recuperacao, acesso assistido e emergencia.
9. Ensaiar a apresentacao com dados ficticios, disponibilidade/cotas, backup e captura/espelhamento: telas protegidas podem nao ser transmitidas.

Para repetir apenas o smoke de protecao no ambiente de demonstracao autorizado, usando contas ficticias temporarias:

```powershell
$env:HTTP_TESTS = '1'
$env:HTTP_API_URL = 'https://senha-facil-api-production.up.railway.app'
pnpm --filter @senha-facil/crypto exec tsx --test --test-name-pattern=HTTP .\test\protection.test.ts
```

Execute em um terminal dedicado e feche-o ao terminar. Nao apontar para um ambiente com dados reais sem autorizacao. O teste cria fixtures, exige familiar ativo antes do item assistido e verifica ciphertext persistido, permissoes e recuperacao; o hook de cleanup tenta remover todas as contas e confirma rejeicao das sessoes, propagando falhas.

Validacao local do pacote em 2026-11-15: 30 testes novos focados, tipos/lint/build API, Docker Linux/Argon2, 12 migrations em PostgreSQL 16 isolado, live/ready 200, JWT 401 e ready 503/live 200 apos indisponibilidade do banco. Recursos de teste removidos. Nenhum desses testes comprova o deploy online, TLS do provedor, push real ou APK preview.

## Preparacao Segura

Usar contas, senhas, rotulos e telefones ficticios. HTTP LAN e apenas para desenvolvimento. Nao remover volumes Docker, resetar o banco ou apagar cache legado para fazer um teste passar.

Abrir Docker Desktop manualmente. Quando o engine estiver disponivel:

```powershell
docker compose up -d
pnpm db:generate
pnpm db:deploy
$env:INTEGRATION_TESTS='1'
pnpm --filter @senha-facil/api exec jest --runInBand
Remove-Item Env:INTEGRATION_TESTS
```

Antes de deploy em banco existente, gerar backup autorizado e testar restauracao em ambiente separado. Migrations acrescentam versoes/tombstones/receipts, sessoes, perfil/cascatas, push, envelopes de protecao, cancelamento e janela de retry. Aplicar migrations e API antes do cliente v2. A migracao do login legado conserva a chave dos itens, revoga sessoes anteriores e exige guardar o novo kit. JWTs sem sessao e tokens push legados exigem novo login/registro de token.

## IA Guiada: Configuracao e Validacao (2026-11-08)

Configuracao privada no servidor e passos em [../README.md](../README.md#gemini-ajuda-guiada-para-gerar-senhas). Desativada por padrao; nao salvar GEMINI_API_KEY no mobile, EXPO_PUBLIC_, chat, logs ou Git. Habilitar sem chave/modelo validos falha explicitamente na inicializacao. O endpoint de disponibilidade nao contata o provedor. Nao houve ativacao de faturamento ou chamada real ao Google nesta validacao.

Validacoes executadas: 49 testes API (servico e HTTP Fastify/JWT com credenciais ficticias), 119 mobile focados, cinco crypto focados; tipos/lint relacionados, build API e export Android/Hermes passaram. Preview web simulado confirmou consentimento, ausencia de texto livre, consulta sem gerar/salvar, tamanho gerado exato, descarte apos fechamento/preferencias e acessibilidade a 320/390px/140%/contraste/teclado. Fixture temporaria foi removida antes do bundle definitivo. Isso nao comprova uso nativo, aceite real do Gemini, quotas, custo ou aprovacao com usuarios idosos.

Roteiro apos configurar chave:

1. Reiniciar API e carregar o mobile no development build. Sem flag/chave, orientar indisponibilidade e manter gerador local offline; nao fingir resposta de IA.
2. Abrir criar/editar item > Ajuda da IA. Sem permitir envio, POST de sugestao deve permanecer bloqueado. Conferir aviso de tratamento dos dados no tier gratuito. Capturar somente escolhas ficticias.
3. Consultar com copiar/digitar, simbolos aceitos/obrigatorios/proibidos e maximos 16/20/32/64. Resposta deve respeitar as escolhas, minimo 16 e formatos; nenhuma senha/texto livre deve vir do modelo. API rejeita campos extras de clientes alterados antes da chamada externa.
4. Verificar payload na fronteira externa autorizada: apenas instrucoes fixas e as tres preferencias. Nome/login/URL/senha/localizacao/ID/token da conta nunca enviados. Chave do provedor fica em header HTTPS, nao em query ou bundle; nao publicar capturas com headers/credenciais.
5. Consultar nao altera senha nem salva item. "Gerar com essas opcoes" cria no aparelho, outra geracao produz outra senha; substituicao de senha existente exige confirmacao e salvar continua separado. zxcvbn avalia localmente, sem enviar senha a IA.
6. Negar consentimento, ficar offline, fechar/sair/bloquear durante resposta, trocar preferencia, perder conexao e cancelar substituicao. Nenhum resultado tardio deve sobrescrever o formulario. Gerador local anterior continua disponivel.
7. Conferir respostas bloqueadas/truncadas/JSON invalido/contradicao, erro de chave/cota/modelo, HTTP 429/503 e timeout. Exibir mensagens amigaveis, sem body do provedor, retries automaticos ou fallback local rotulado IA.
8. Testar TalkBack, 140% mais fonte do Android, teclado e dialogo de substituicao em dispositivo fisico. Confirmar limites reais do site; a IA nao conhece nem consulta esse site. Nao aceitar restricoes abaixo de 16 neste modo guiado.

Orcamento: 5/minuto/conta, 20/dia/conta, 2 externas simultaneas e limite global diario do processo (200 por padrao). Falhas consomem tentativa; fechamento do cliente nao garante cancelar processamento/custo externo ja iniciado. Reinicio e multiplos processos nao compartilham cotas: usar armazenamento compartilhado persistente e limite de faturamento antes de producao. Gemini gratuito pode usar escolhas/respostas para melhoria/revisao humana conforme os [termos](https://ai.google.dev/gemini-api/terms). Nao prometer gratuidade ou ausencia de retencao.

## Testes Fisicos

Autenticacao Android exige development build com `react-native-quick-crypto`, Nitro Modules e quick-base64. Expo Go nao inclui esses modulos e rejeita a derivacao explicitamente. Chaves e iteracoes antigas sao preservadas; entrar com a conta existente, sem reset de banco nem recadastro. Armazenamento do development build e separado do Expo Go: preservar a instalacao anterior ate verificar dados nao sincronizados e kit.

Build local Windows requer Java 21 compativel com Gradle 8.14.3; o Java 25 do Studio instalado nao e compativel. Usar SDK/NDK/caches em disco com espaco e caminhos curtos. pnpm 9.15 aceita `--config.virtual-store-dir-max-length=40`, mas o layout isolado ainda excedeu o limite de caminhos prefab/CMake neste ambiente. O build local de 2026-11-02 passou com layout hoisted apenas na copia de compilacao, conforme evidencia abaixo. Regenerar autolinking depois de mudar caminhos. Alternativa EAS exige vinculo/autorizacao com o usuario.

Registrar modelo/Android, build/commit, participantes consentidos, resultado, tempo e evidencia sem segredos. Ainda nao ha resultados fisicos desta entrega.

| Cenario | Criterio de Aceite |
| --- | --- |
| Duas contas no aparelho | Nenhum item, chave, pedido ou resposta da outra conta aparece |
| Atualizacao antiga | Itens nao sincronizados preservados; chave errada nao importa; banco legado nao apagado |
| Reinicio em modo aviao | Restaura bloqueado; senha correta abre; errada/biometria cancelada nao abre |
| Bloqueio | Background e 120s sem toque ocultam senhas, destroem chave e cancelam requests |
| Captura/recentes Android | Screenshot/gravacao impedidos e recentes sem senha; verificar por aparelho |
| Escrita offline | Rede nao duplica, nao ressuscita exclusao e nao apaga edicao durante upload |
| Conflito em dois aparelhos | Decisao explicita; preservar edicao de item excluido cria outro ID |
| Tela durante sync | ID local continua resolvendo e editar nao cria copia |
| Aprovacao com dois atores | Familiar so ve metadados; negativa/expirada/revogada nao revela |
| Dois cuidadores | Uma decisao/notificacao; outra recusada; perda de WS reconciliada |
| Cancelamento | Somente solicitante cancela PENDING; aprovar/cancelar produz um vencedor e nunca revela com CANCELLED |
| Historico longo | Paginas de 30 sem sobreposicao, carregar mais/refresh e retorno apos resposta atrasada |
| Emergencia | Reautenticacao; evento antes da revelacao; envio unico; identifica relato do aparelho |
| Kit no primeiro acesso | Codigo legivel com TalkBack, guarda externa confirmada e codigo local removido; kit pendente confirmado abre offline |
| Troca de senha | Itens offline/sincronizados preservados, senha antiga recusada online e outras sessoes revogadas |
| Recuperacao em novo aparelho | Kit valido abre os mesmos itens; codigo errado/adulterado nao abre; kit anterior deixa de funcionar apos recuperar |
| Resposta perdida | Login com a nova senha apos commit; refresh repete mesmo UUID em 60s, UUID diferente ou vencido nao reutiliza token |
| Clipboard | Copia por ate cinco minutos, inclusive apos bloqueio automatico; manual/logout/blur ativo antecipam limpeza sem apagar texto diferente; avaliar suspensao e historico do SO |
| Push nativo | Permissao negada nao bloqueia app; background/encerrado/toque/refresh/logout/multiplos aparelhos |
| Perfil/exclusao | Senha errada nao exclui; correta remove dados ativos; falha local/backup/offline informados |
| TalkBack/fontes | Ordem/rotulos/estados claros; acoes alcancaveis; 140% mais fonte do SO sem sobreposicao/corte; teclado nao esconde salvar |
| Participantes idosos | Criar/encontrar/revelar/copiar/pedir ajuda com consentimento; registrar dificuldades reais |

### Ajustes de acesso, erros e biometria (2026-11-02)

- Sem familiares, com convite pendente, vinculo revogado, cuidador inativo ou sem permissao: nao permitir ativar acesso assistido. Mostrar o caminho para configurar familiares, sem impedir senhas comuns. Repetir offline; criar senha comum deve funcionar, nova ativacao assistida deve orientar conectar.
- Com familiar apto: criar uma senha assistida, aguardar sincronizacao e solicitar acesso. Remover a permissao antes de salvar deve recusar a ativacao sem salvar parcialmente; remover depois nao deve desproteger ou revelar a senha existente. API verifica criacao, atualizacao e sync, nao apenas o switch.
- Enviar e-mail incompleto como `familiar@teste` em cadastro, login, recuperacao e convite: apresentar exemplo de e-mail completo antes de requisicao/derivacao. Conferir conta ja cadastrada, familiar nao encontrado/perfil errado, 401, 403, 404, 409, 429, 5xx, timeout e modo aviao: texto compreensivel, sem HTTP/JSON, stack trace ou corpo tecnico.
- Em Minha conta > Biometria, senha e recuperacao, confirmar senha mestra antes de ativar. Sem sensor/cadastro/biometria forte, explicar o motivo. Ativar com senha errada ou cancelar o prompt nao pode gravar uma ativacao bem-sucedida. Nenhum dado facial/digital deve ir ao servidor.
- Bloquear, reiniciar e testar desbloqueio offline com uma unica confirmacao biometrica. Cancelar ou falhar nao pode desbloquear; senha mestra continua disponivel. Alterar digitais/rosto nas configuracoes pode invalidar a chave protegida: usar senha e ativar novamente. Desativar deve remover a copia biometrica sem apagar senhas.
- Validar digital e face forte em hardware compativel. Facial simples pode ser recusado pelo Android; nao usar camera/comparacao de fotos como alternativa. A simulacao Fingerprint do emulador nao comprova reconhecimento facial.
- Sair e entrar novamente deve exigir um formulario de login, nao uma segunda senha ou regravacao biometrica. Prompts de biometria/notificacao controlados nao devem causar outro desbloqueio ao retornar; sair realmente do app durante o prompt ou login deve manter o cofre bloqueado.
- Ao abrir, conferir entrada suave da logo e breve saida para login/desbloqueio, sem repeticao ao navegar ou retomar do background. Com reduzir movimento, transicao imediata apos sessao/fontes estarem prontas. Conferir TalkBack, 140% e telas pequenas.

110 testes mobile e 14 testes focados da API passaram, junto com tipos mobile/API, lint relacionado e compilacao do bundle Android pelo Metro. Testes automatizados usam biometria simulada e PBKDF2 nativo Node com os mesmos 600.000 ciclos; nao comprovam biometria em aparelho fisico. Emulador pausado com autorizacao por falta de memoria; usuario escolheu concluir esta etapa sem reabri-lo. Nenhuma conta real foi usada nestas validacoes.

### Localizacao pontual de pedidos (2026-11-02)

Preparacao: aplicar a migration `20261102000100_request_location`, regenerar Prisma Client e instalar um novo development build com `expo-location ~19.0.8`. Nao basta Fast Refresh no APK anterior. Usar contas ficticias e posicao simulada (por exemplo latitude/longitude 0), nunca expor coordenadas reais em logs, capturas, push ou evidencias.

1. Criar/ativar item assistido com familiar apto: explicar finalidade e pedir somente permissao foreground. Negar impede a ativacao, mas nao cadastrar senha comum. Conferir que esse passo nao inicia leitura de posicao.
2. Conceder permissao e salvar: nenhuma leitura no cadastro. Revogar antes de salvar impede nova ativacao; item ja protegido nao e desprotegido automaticamente nem exige nova permissao apenas para editar dados.
3. Enviar pedido online com posicao simulada: uma leitura, sem watcher/background. Familiar ativo com APPROVE_ACCESS ve horario e raio aproximado. Ver mapa neste pedido abre aviso/autorizacao antes de enviar coordenadas/IP ao OpenStreetMap; sem consentimento, nenhuma carga externa. Nao ha geocodificacao.
4. Revogar permissao, desligar GPS, simular erro ou atraso maior que 12s no momento de pedir: titular e familiar veem aviso, pedido e enviado sem coordenadas. Resultado tardio nao atualiza o pedido. Trocar conta/bloquear/sair da tela durante a tentativa nao envia resultado para outra sessao.
5. Repetir pedido PENDING: mesmo ID, mesma posicao original e nenhum segundo push. Posicao aproximada deve ser apresentada como aproximada, nunca como prova de identidade; GPS simulado nao e prova de presenca.
6. Sem consentimento historico, aprovar/negar apaga a posicao na mesma transacao. Desde2026-11-15, autorizar a retencao por pedido conserva o ponto de APPROVED/DENIED por30dias apos envio; cancelar/expirar sempre apaga. Decisoes concorrentes tem um vencedor. Familiar sem vinculo/permissao ou inativo nao recebe coordenadas em nova consulta.
7. Vencer o prazo: API deixa de retornar posicao imediatamente; job remove fisicamente no proximo ciclo de ate um minuto enquanto o servico estiver ativo. Reiniciar API limpa vencidos na inicializacao. WAL/backups precisam de politica propria, nao sao apagados por DELETE.
8. No familiar, sair da tela, bloquear/app em background, falhar atualizacao, responder ou atingir o prazo remove coordenadas do estado local. Validar tambem resposta HTTP atrasada apos logout e resolucao por outro familiar. Uma copia recebida nao pode ser revogada remotamente durante falta de rede; polling reconcilia ao retornar.
9. Emergencia offline mantem reautenticacao e fila duravel sem localizacao, inclusive sem ponto historico. Conferir ausencia de coordenadas no SQLite, listagem de historico, endpoint de estado, payload FCM e evento WebSocket.
10. Conferir permissoes do APK: somente COARSE/FINE_LOCATION; sem ACCESS_BACKGROUND_LOCATION, FOREGROUND_SERVICE_LOCATION ou servico de rastreamento ativo.

Evidencia automatizada: 127 testes mobile e 48 testes focados API passaram, incluindo nove cenarios com PostgreSQL real e limpeza das contas ficticias no finally/afterAll. Tipos mobile/API e lint relacionados passaram. Introspeccao Expo confirmou as permissoes acima, sem UIBackgroundModes location. Bundle Android completo servido pela URL real do manifest com lazy=false: HTTP 200, 13.180.744 bytes e modulo de localizacao presente.

O primeiro typecheck sofreu falta de memoria do Windows; somente o emulador confirmado foi pausado com autorizacao, sem exclusao de dados ou ajuste da paginacao. Instalacao repetida offline apos EPERM; migration aplicada sem reset; Prisma Client regenerado apos liberar brevemente o runtime da API. API e Metro disponiveis ao final. Novo APK e validacao fisica permanecem pendentes; os testes nao acionaram GPS real.

### Regressao da interface renovada

- Verificar login, cadastro, bloqueio, onboarding e kit, cofre vazio/preenchido, busca sem resultados, filtros, novo item/edicao, todos os estados de acesso, contatos, solicitacoes do familiar, historico, perfil e seguranca.
- Em 320 e 360 pixels de largura, conferir texto de 100%, 120% e 140%, combinado com a fonte do Android ampliada. Formularios e cabecalhos devem rolar; nenhum campo, botao ou item de navegacao pode ficar inacessivel.
- Abrir "Ajustar leitura" sem conta e com o cofre bloqueado. Alterar tamanho/contraste, fechar, reabrir e reiniciar o app: no Android, os ajustes devem persistir. Confirmar fechamento por botao, Voltar do Android e leitura do modal no TalkBack.
- Conferir contraste reforcado em botoes, chips, campos, badges, cartoes e abas; estados devem continuar identificaveis por texto e icone, nao so cor. Navegacao por teclado deve mostrar foco.
- "Como funciona" deve abrir sem rede, sem autenticar e sem expor itens do cofre; bloquear o cofre deve manter as regras de remocao de conteudo sensivel.
- Verificar navegacao inferior dos dois perfis, Voltar nos detalhes/edicao/seguranca, barra de gestos e teclado Android. Textos de abas nao podem ser truncados pela escala de fonte.
- Gerar senhas em cada tamanho oferecido: 12, 16, 20, 24 e 32. Confirmar o comprimento exato, salvar/reabrir e verificar que editar um item protegido continua exigindo autorizacao valida.
- Com reduzir movimento habilitado antes de abrir o app, verificar entradas, modais, onboarding e transicoes sem movimentos decorativos. Nao deve haver pulsacao ou animacao infinita fora dos indicadores necessarios de carregamento.
- Verificar que erro de carregamento nao aparece como cofre vazio ou ausencia confirmada de pedidos; testar tentar novamente e retorno apos rede instavel. Exclusao da conta exige abertura explicita da area, texto EXCLUIR, senha e confirmacao nativa.

Verificacao local da renovacao: suite mobile com 65 testes aprovados, incluindo 7 testes de acessibilidade; typecheck, lint e exportacao do bundle Android aprovados. Os testes de paleta cobrem texto, cores semanticas, botoes e contornos nas duas paletas (4,5:1 para texto normal, 7:1 para texto principal e 3:1 para contornos de campos/controles).

A inspecao web incluiu amostras de 320, 390, 768 e 1280 pixels, texto em 100%/140%, contraste reforcado e reduzir movimento. Foram conferidos busca/filtros, estados vazio/erro/repetir, geracao com os cinco comprimentos exatos, formularios, navegacao dos dois perfis e retorno de seguranca para a conta. Estados de acesso e confirmacao do kit usaram dados ficticios em memoria; nenhuma conta, chave ou senha real foi usada. Switches mantem um unico alvo de foco, inclusive na web; Espaco/Enter, selecao, ocupado e expansao foram conferidos. As fixtures foram removidas por recarga. Estes resultados nao certificam TalkBack, fonte do sistema, teclado, biometria ou capturas no Android fisico.

Os sete testes PostgreSQL passaram localmente e automatizam idempotencia/versao, decisao/cancelamento, cascata/anonimizacao, recuperacao/revogacao, refresh, emergencia/paginacao e convites/aceites concorrentes. Nao testam UI, biometria, FCM remoto ou usabilidade.

Um smoke opt-in contra a API HTTP real passou para cadastro v2, contatos/permissoes, cancelamento, troca, recuperacao com kit novo, rejeicao do kit anterior, preservacao do ciphertext, pagina e retry de refresh. As duas contas ficticias foram excluidas no finally. Executar com `HTTP_TESTS=1` conforme README. Isso nao valida o cliente Android nem push externo.

A previa web foi usada para inspecao visual de login/cadastro/recuperacao, cofre, cuidador e seguranca, com fixtures em memoria, sem senhas ou contas reais. Largura de 320px, desktop e texto de 140% foram verificados; fixtures removidas ao terminar. Ela nao fornece substituto web de SecureStore/biometria/captura, nem evidencia de acessibilidade no Android. Atkinson Hyperlegible, botoes/switches de 56px, reduzir movimento e assets PNG estao em codigo; validar no novo development build.

## Firebase: Somente Com o Usuario

Em 2026-10-17, configuracao Android fornecida pelo usuario validada para o projeto `senha-facil-8547b` e pacote `com.senhafacil.app`. Expo aponta `android.googleServicesFile` para `../../google-services.json`, na raiz do repositorio. Arquivo de cliente ignorado pelo Git, mas incluido explicitamente no EAS. Introspeccao nativa e inspecao do upload passaram.

Build EAS de desenvolvimento Android `357cd547-ad5d-40f7-bfe1-bb18c021e442` concluido sem limpar cache ou repetir suite completa. APK de 247832154 bytes baixado, assinatura v2 verificada com `apksigner` e atualizado no `emulator-5554` usando `adb install --no-streaming -r`, sem desinstalacao ou limpeza de dados. Aplicativo aberto pelo dev client com Metro existente; processo Android ativo e log `FirebaseApp initialization successful` confirmado. API local iniciada em `http://localhost:3000`, com compilacao sem erros e resposta HTTP 401 esperada em `/users/me` sem credenciais.

API passou a aceitar `GOOGLE_APPLICATION_CREDENTIALS` via Application Default Credentials, preservando a alternativa por variaveis individuais. Ambiente local guarda somente projeto e caminho do arquivo externo. Cinco testes focados de notificacoes e tipos da API passaram; suite completa nao repetida.

Autenticacao OAuth e permissao FCM HTTP v1 confirmadas em 2026-10-17 usando a credencial externa. `messaging.send(message, true)` passou em modo dry-run, sem entregar notificacao nessa etapa. Bloqueio anterior `invalid_grant` foi resolvido apos usuario corrigir pontualmente o relogio Windows por horario HTTPS do Google: diferenca passou de 388 para 0 segundos na comparacao sem cache. Sincronizacao automatica NTP do Windows continua sem reparo confirmado. Registro de token em sessao ativa, entrega real generica em primeiro e segundo plano e contrato HTTP de aprovacao/negativa confirmados posteriormente, conforme evidencia abaixo; fluxo visual entre dois aplicativos Android ainda pendente.

Diagnostico Android posterior confirmou `POST_NOTIFICATIONS` ja concedida, portanto sem novo dialogo de permissao. Rotina obteve token nativo, mas PATCH de registro retornou HTTP 401; listener de mudanca de token podia executar sem sessao online. Registro agora exige JWT antes de iniciar e verifica novamente apos obter o token, evitando envio sem sessao ou apos logout durante essa espera. Avisos mostram somente etapa, status HTTP ou categoria nativa predefinida, nunca token ou corpo de erro. Seis testes focados de push, tipos e lint dos arquivos alterados passaram. No Hermes, checagem retornou sessao ausente e rotina encerrou sem aviso; usuario precisa entrar novamente para validar associacao autenticada e entrega real. Nenhum novo APK foi necessario para essa correcao JavaScript.

Avisos posteriores HTTP 429 revelaram outro defeito: no Expo Notifications 0.32.17, `getDevicePushTokenAsync` tambem emite `onDevicePushToken` no Android. Listener consultava o token novamente, criando ciclo e saturando a rota. Listener agora encaminha o token do evento diretamente ao registro, sem nova consulta nativa. Dois testes de regressao acrescentados: token fornecido e callback sem reconsulta; oito testes de push passaram em 3,713 s, com tipos e lint aprovados. Limites da API preservados. Permissao Android reconfirmada como concedida; checagem atual no Hermes encontrou sessao online ausente, portanto registro autenticado apos essa correcao e entrega real continuam pendentes de login do usuario. Correcao somente JavaScript, sem novo build.

Teste de transporte real em 2026-10-17: token nativo do `emulator-5554` obtido pelo depurador local sem exibicao, correspondendo exatamente a uma sessao ativa com usuario ativo no PostgreSQL. Aplicativo colocado em segundo plano pela tecla Inicio, sem force-stop. Enviada uma unica mensagem generica pelo Firebase Admin, fora do fluxo de Acesso Assistido, no canal `sf_access_requests`, com TTL de 60 segundos e tipo `CONFIGURATION_TEST`. FCM aceitou a mensagem; `cmd notification list` e `cmd notification get` confirmaram notificacao ativa com titulo exato `Teste do Senha Facil`. Expo publicou com identificador proprio, portanto verificar somente a tag enviada ao FCM nao basta. Nenhum token, JWT, senha ou dado do cofre foi exibido. Teste confirma entrega generica em segundo plano no emulador, nao som/banner percebido pelo usuario, toque/navegacao, entrega em primeiro plano, aparelho fisico ou pedido/aprovacao entre dois atores.

Teste de primeiro plano em 2026-10-17: aplicativo confirmado como `topResumedActivity` no envio, token correspondente a uma sessao ativa e uma unica mensagem generica `Teste com app aberto` aceita pelo FCM. Android confirmou notificacao ativa com esse titulo exato. Usuario havia relatado sucesso ao conferir o teste anterior de segundo plano; isso nao substitui verificacao fisica de som, bloqueio, TalkBack ou navegacao de pedidos reais.

Smoke HTTP existente em `packages/crypto/test/protection.test.ts` ampliado e executado sozinho contra a API local: passou em 22,6 segundos, sem suite completa ou novo APK. Duas contas ficticias v2 criadas por HTTP, vinculo aceito, item cifrado protegido e permissoes definidas; pedidos distintos terminaram em APPROVED e DENIED. Verificados lista pendente somente com metadados, ausencia de ciphertext/senha nessa lista, papel ELDERLY impedido de responder, estado consultavel pelo solicitante, retirada da lista pendente e rejeicao de nova decisao apos encerramento. Cancelamento, troca e recuperacao anteriores continuam cobertos no mesmo smoke. Contas excluidas pelo finally e tipos/lint aprovados. Fixtures nao receberam tokens FCM: esse teste valida o contrato real da API, nao entrega de push de pedidos entre dois aplicativos. Ha somente um Android conectado; validacao visual simultanea requer outro emulador ou aparelho.

Usuario escolheu um segundo emulador para a etapa visual. Ferramentas oficiais `commandlinetools-win-15859902_latest.zip` baixadas no D: e SHA-256 conferido com a pagina oficial; instaladas em `D:/sdks/cmdline-tools/latest`, sem alteracao global de Java/PATH. Novo AVD independente `SenhaFacil_Cuidador`, descritor e dados em `D:/Android/AVD`, reutiliza imagem Google Play ja instalada. Perfil original nao foi copiado, apagado ou reiniciado. Tentativa em porta 5556 com dois nucleos, temporarios no D:, SwiftShader e Vulkan desabilitado falhou: emulador elevou RAM solicitada de 2048 para 4096 MB e reportou memoria comprometida insuficiente no Windows (limite 31410 MB, uso 27302 MB, pouca margem para 4096 MB adicionais). Processo da tentativa encerrado; `emulator-5554` continua conectado. Na checagem, C: tinha aproximadamente 0,1 GB livre e D: 239,8 GB. Nao houve limpeza de arquivos, encerramento de programas do usuario ou alteracao de memoria virtual. Liberar memoria e espaco no C: manualmente antes de retomar; novo AVD ainda nao completou boot e nao recebeu APK nem contas.

Retomada apos usuario liberar recursos: memoria fisica livre 9,1 GB e virtual disponivel 9,7 GB. `SenhaFacil_Cuidador` iniciou na porta 5556 com 4096 MB e dois nucleos, mantendo dados/temporarios no D:. `sys.boot_completed=1` confirmado; APK existente instalado com `Success`, reverse 8081 configurado e dev client aberto. ADB confirmou simultaneamente `emulator-5554` e `emulator-5556`; Metro confirmou dois runtimes JavaScript, Firebase inicializou com sucesso no segundo e sua MainActivity ficou em primeiro plano. Nenhuma conta criada ou dados do primeiro dispositivo alterados nessa retomada. C: ainda tinha aproximadamente 0,16 GB livre, exigindo liberacao manual. Bloqueio anterior de memoria superado; dispositivos prontos para configurar contas de idoso/cuidador, mas fluxo visual de pedido/aprovacao entre eles ainda nao executado.

Correcao de expiracao imediata em 2026-10-17, apos usuario confirmar push funcionando: ADB mostrou primeiro emulador aproximadamente 387 segundos adiantado em relacao ao Windows/API, enquanto o segundo estava alinhado. Prazo da solicitacao permanece dois minutos no servidor. App comparava `expiresAt` com `Date.now()` do Android, encerrando imediatamente o temporizador e rejeitando inclusive aprovacoes validas. Cliente HTTP agora ancora o horario no cabecalho `Date` da API e usa `performance.now()` para avancar sem depender de mudancas no relogio civil. Precisao de segundos do HTTP e tempo de transito sao contabilizados conservadoramente, sem estender o prazo. Historico, temporizador, revelacao, copia e verificacao de validade do JWT usam essa referencia. Datas de validade invalidas nao autorizam descriptografia.

Trinta testes focados em `test/api-client.test.ts` e `test/vault.test.ts` passaram em 17,7 segundos, incluindo aparelho adiantado/atrasado 387 segundos, mudanca manual de hora, limite real de expiracao, cabecalho ausente/invalido, latencia e renovacao de sessao. Typecheck, lint dos arquivos alterados e diagnosticos do editor sem erros. Fast Refresh confirmou correcao carregada nos dois Hermes. Sonda sem autenticacao consultou uma rota inexistente, aproveitando apenas seu cabecalho HTTP `Date`, sem acessar contas/cofre ou criar pedidos: prazo sintetico de dois minutos conservou aproximadamente 118,98 e 118,96 segundos, apesar de primeiro aparelho ainda cerca de 386 segundos adiantado. Nenhum APK novo, ajuste de relogio ou alteracao de dados reais; novo pedido/aprovacao pelo usuario ainda necessario para confirmar o fluxo visual completo apos a correcao.

Nova solicitacao do usuario em 2026-10-17: prazo de novos pedidos ampliado de dois para dez minutos, contados da criacao no servidor; registros existentes mantem `expiresAt` original. Clipboard passou de 30 segundos para cinco minutos, com texto de confirmacao/onboarding atualizado. Bloqueio automatico por background/inatividade continua apagando a chave e encerrando servicos, mas preserva a copia temporaria para colar em outro app. Bloqueio manual/logout continuam limpando imediatamente; sair da tela sem bloquear e expiracao enquanto visivel tambem podem antecipar a limpeza. Timer JavaScript nao garante limpeza com processo encerrado ou suspenso; historicos/terceiros nao estao sob controle do app.

Para o relato de duas autenticacoes ao abrir push, removida verificacao de `AppState.currentState` que repetia bloqueio a cada mudanca de `isLoading`; o listener agora e instalado uma vez e trata transicoes reais para background, sem bloquear por inactive durante retorno de janela nativa. Acao manual `lock()` preservada e separada de `lockAutomatically()`. Dezenove testes mobile de ciclo de sessao/clipboard e sete da API passaram; tres cenarios afetados pela separacao final das acoes repetidos e aprovados. Tipos e lint de API/mobile passaram. Testes simulam o retorno e nao substituem novo toque real no push pelo usuario, nem comprovam biometria/aparelho fisico. Sem novo APK, limpeza de dados ou suite completa do monorepo.

1. Confirmar Firebase Cloud Messaging API v1 habilitada no projeto; nao usar a API legada.
2. Preparar credencial de conta de servico da API, preferindo permissoes limitadas ao envio FCM. Chave privada deve ficar fora do repositorio, OneDrive, chat e APK; informar somente o caminho local durante a configuracao assistida.
3. Configurar `FIREBASE_PROJECT_ID` e `GOOGLE_APPLICATION_CREDENTIALS` no ambiente privado da API, com caminho absoluto para a chave local. Como alternativa, manter `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY`. O caminho ADC tem prioridade quando configurado. Nunca usar `EXPO_PUBLIC_` para secrets. Relogio do servidor precisa estar sincronizado para autenticacao OAuth.
4. O app usa token nativo e a API envia diretamente pelo Firebase Admin: nao e necessario enviar a chave administrativa ao EAS para o Expo Push Service. EAS precisa da configuracao Android de cliente e da assinatura ja autorizada. Arquivos `*firebase-adminsdk*.json` e `service-account*.json` ficam excluidos do Git e do upload como protecao adicional; outras chaves privadas tambem devem permanecer fora do repositorio.
5. Produzir e instalar novo development build; verificar permissao, canal, texto privado, token e invalidacao em duas contas/aparelhos. Alterar configuracao Firebase nativa exige novo APK, nao somente Fast Refresh.

Push e best effort: erros nao devem desfazer decisao persistida; polling/estado continuam obrigatorios. Token pertence a sessao, nao ao usuario inteiro.

## Armazenamento local de desenvolvimento (Windows)

Migracao validada em 2026-11-02 neste computador. A copia principal esta em `D:\Development\SenhaFacil`; o caminho anterior no OneDrive foi mantido como junction de compatibilidade. Abrir o projeto pelo D:. Historico Git, alteracoes nao commitadas e arquivos locais foram preservados. Estes caminhos sao configuracoes locais, nao requisitos para outros contribuidores.

- Caches de pnpm, npm e Expo em `D:\Development\Caches`. O pnpm usa os aliases antigos com destino fisico no D:, mantendo compatibilidade com o store registrado na instalacao.
- `TEMP` e `TMP` do usuario persistidos em `D:\Development\Temp`. Reiniciar VS Code e terminais ja abertos para herdarem os novos valores; temporarios do Windows nao foram alterados.
- Caminhos antigos sao redirecionamentos, nao copias duplicadas. Nao remover as junctions sem reconfigurar as ferramentas correspondentes.
- SDK e AVD ativo ja estavam no D: e foram preservados. Nao houve limpeza de dados de aplicativo, banco ou volumes Docker, nem alteracao da paginacao do Windows.
- Inventarios SHA-256 e originais de arquivos de dependencias substituidos durante a restauracao ficaram em `D:\Development\.migration-20261102`, fora do repositorio.

Para um terminal que ainda esteja com o ambiente antigo:

```powershell
Set-Location D:\Development\SenhaFacil
$env:TEMP = 'D:\Development\Temp'
$env:TMP = $env:TEMP
```

Nova verificacao em 2026-11-02 encontrou somente 0,10 GiB livre no C: e um arquivo de paginacao ativo com tamanho em disco de aproximadamente 11,20 GiB. Projeto, SDK/AVD e armazenamento do Docker estao no D:, mas a memoria virtual do Windows ainda usava o C: com gerenciamento automatico global. O emulador comprometia aproximadamente 6,5 GiB de memoria; programas ja abertos tambem mantinham TEMP/TMP antigos no C:.

Com autorizacao do usuario e elevacao administrativa, a configuracao persistente passou a `C:\pagefile.sys 1024 1024` (1 GiB fixo) e `D:\pagefile.sys 0 0` (tamanho gerenciado pelo Windows). A configuracao foi conferida no registro; backup anterior e comprovante estao em `D:\Development\.migration-20261102\pagefile-before.json` e `pagefile-result.json`. E necessario salvar o trabalho e reiniciar o Windows para aplicar os arquivos de paginacao e renovar o ambiente dos programas. Nenhum reinicio foi executado: o C: ainda tinha 0,10 GiB livre na verificacao, sem liberacao de espaco confirmada. Nao apagar manualmente arquivos de paginacao. Configuracao de minidumps, dados e servicos foram preservados.

Apos reinicio informado pelo usuario, o C: passou a 10,61 GiB livres e os processos novos herdaram TEMP/TMP no D:. Entretanto, `Win32_PageFileUsage` confirmou somente o arquivo de 1 GiB no C:, sem paginacao ativa no D:; persistencia da configuracao anterior nao significou ativacao. Banco, API e Metro reiniciaram, mas duas tentativas de iniciar o emulador nao completaram boot. Na verificacao, a margem de memoria comprometida era menor que os 4 GiB solicitados pelo AVD, antes mesmo do custo adicional do emulador.

Com nova autorizacao, `Win32_PageFileSetting` foi usado para reservar no D: tamanho inicial de 8192 MiB e maximo de 32768 MiB, preservando 1024 MiB fixos no C:. Valores confirmados por CIM e no registro; backup em `D:\Development\.migration-20261102\pagefile-before-reservation.json`, comprovante em `pagefile-reservation-result.json`. Outro reinicio e necessario; nao foi executado automaticamente. Antes de declarar a migracao da memoria virtual concluida, confirmar `D:\pagefile.sys` em `Get-CimInstance Win32_PageFileUsage` e depois verificar boot do Android e conexao do app ao Metro. Nao reduzir a seguranca, limpar dados do AVD ou recriar o banco para contornar essa pendencia.

Copiar as junctions das dependencias nao bastou: o Metro ainda encontrava destinos absolutos antigos. `pnpm install --offline --frozen-lockfile` recriou a instalacao sem mudar o lockfile, seguido de `pnpm --filter @senha-facil/api db:generate`. O modo offline do pnpm nao impede downloads feitos por scripts nativos: o instalador do Argon2 baixou seu binario nesta etapa. Nenhuma migracao de banco foi executada.

Validacao no novo caminho: typecheck dos quatro pacotes, 19 testes focados de acessibilidade/cliente HTTP, carregamento do Prisma Client, hash/verificacao Argon2 nativa e exportacao Android com um worker passaram. A exportacao foi direcionada a uma pasta temporaria no D:, removida ao concluir. Essas evidencias validam a mudanca de ambiente; o diagnostico do cadastro no runtime Android e os testes fisicos/TalkBack continuam pendentes.

## Artefatos EAS

Perfis em [../apps/mobile/eas.json](../apps/mobile/eas.json). Projeto vinculado a `@senhafacil/senha-facil` (`bf7a3e81-97af-4127-93fa-945791f84f71`). Em 2026-10-10, chave de assinatura Android gerada no EAS com autorizacao do usuario. Primeiro build `20e5cf70-f5b2-4916-9056-985bee492dea` falhou: Quick Crypto 1.1.8 foi gerado com Nitro 0.33.2 e exige `PropNameIDCache`, ausente no runtime 0.31.2. Runtime alinhado a 0.33.2, header e testes do adaptador verificados. Novo build sem cache `1d53e200-958d-447f-814b-509fd9f23994` terminou com `FINISHED` e gerou APK, com assinatura local verificada. Instalacao ADB sem streaming retornou `Success` e o app abriu conectado ao Metro. Sonda ficticia PBKDF2 no Hermes concluiu em 5.008 ms com resultado identico ao Node, sem bloquear timers; chave/buffers/metadados temporarios removidos. Login da conta existente e demais fluxos ainda pendentes; nenhuma publicacao executada.

O emulador API 37 ficou sem resposta durante a primeira instalacao. Reinicio autorizado preservou armazenamento, Expo Go e contas. Inicializacao padrao encerrou antes do boot; cold boot com `-gpu swiftshader -feature -Vulkan` completou e permitiu instalar. Para reconectar esse APK ao Metro local, usar `adb reverse tcp:8081 tcp:8081`. Nao usar Wipe Data para contornar falhas.

O perfil development aponta somente para a API local do emulador (`http://10.0.2.2:3000`); nao usar esse APK como release. `.easignore` na raiz exclui arquivos de ambiente, documentos e credenciais locais. Inspecao do arquivo de upload validou 187 arquivos, sem os arquivos excluidos, incluindo workspaces, assets e patch da criptografia.

```powershell
Set-Location .\apps\mobile
pnpm --config.store-dir=D:\Android\pnpm-store --config.cache-dir=D:\Android\pnpm-cache dlx eas-cli build --platform android --profile development
```

Executar apos vinculo EAS/autorizacoes. Para preview ou production, alterar o perfil somente apos configurar o ambiente correspondente. Development/preview geram APK; production gera AAB. Configurar `EXPO_PUBLIC_API_URL` HTTPS no release; nao embarcar LAN/localhost. Modulos nativos como clipboard/screen capture exigem novo build, nao apenas reload Metro.

## Smartphone por USB (2026-11-08)

APK ARM64 instalado e aberto no Galaxy A12 (SM-A127M), Android 13/API 33. Nao usamos Expo Go, emulador ou compilacao remota. Driver Samsung instalado pelo usuario; Depuracao USB habilitada separadamente da permissao de transferencia de arquivos. Nao registrar numero de serie, IMEI ou PIN em evidencias.

Artefato de desenvolvimento local, fora do repositorio e sem link publico de download: `D:\Android\Builds\SenhaFacil-smartphone-20261108-arm64-v8a.apk`, 85.200.140 bytes, SHA-256 `b5347f3bd3301a2b76c27797ccd197225e778e79527eff4d597d5271608d1884`. ABI somente arm64-v8a, minSdk 24, targetSdk 36, certificado original e alinhamento 16 KiB verificados. Instalacao via `adb install -r --no-streaming`, sem desinstalar, limpar dados ou resetar banco.

Build reutilizou a copia isolada no D:, Java 21 e dependencias existentes, atualizando o modulo local de credencial. Primeira tentativa falhou por excesso de compiladores C++ simultaneos/limite de memoria comprometida do Windows. Nova tentativa passou em 9m25s: um worker Gradle e pools CMake/Ninja de dois compiladores e um linker, confirmados no grafo gerado. Limites aplicados por init script somente nesta invocacao; nao alteramos SDK, linker do workspace ou paginacao do Windows.

Para voltar a testar depois de reiniciar o computador:

1. Inicie Docker Desktop e o PostgreSQL existente. Na raiz do projeto, execute `pnpm dev:api` em um terminal. Preserve o arquivo privado de configuracao da API.
2. Conecte/desbloqueie o celular, habilite Depuracao USB e autorize este computador. Confira a conexao e recrie os redirecionamentos:

```powershell
& 'D:\sdks\platform-tools\adb.exe' devices -l
& 'D:\sdks\platform-tools\adb.exe' -d reverse tcp:3000 tcp:3000
& 'D:\sdks\platform-tools\adb.exe' -d reverse tcp:8081 tcp:8081
```

`-d` seleciona o unico aparelho fisico, mesmo com um emulador aberto. Se houver mais de um celular, selecione o correto explicitamente com `-s`, sem publicar seu identificador.

3. Em outro terminal, inicie Metro com configuracao temporaria para USB:

```powershell
Set-Location 'D:\Development\SenhaFacil'
$env:TEMP='D:\Android\Temp'
$env:TMP=$env:TEMP
$env:EXPO_PUBLIC_API_URL='http://127.0.0.1:3000'
$env:REACT_NATIVE_PACKAGER_HOSTNAME='127.0.0.1'
pnpm --filter @senha-facil/mobile exec expo start --dev-client --localhost --port 8081 --max-workers 1
```

Isso nao altera o `.env` usado pelo emulador. No aparelho, localhost chega ao computador via `adb reverse`; nao usar 10.0.2.2 em um celular fisico.

4. Abra o development client:

```powershell
& 'D:\sdks\platform-tools\adb.exe' -d shell am start -W -a android.intent.action.VIEW -d 'exp+senha-facil://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081' -p com.senhafacil.app
```

Mantenha cabo, API e Metro ativos durante este teste de desenvolvimento. Reconectar o cabo pode exigir repetir os redirecionamentos; nao precisa reinstalar APK para cada alteracao JavaScript. Login/IA continuam sujeitos ao estado online do aplicativo. Novo modulo/configuracao nativa exige outro APK.

Evidencias: PostgreSQL original healthy, API 401 esperado sem credenciais, Metro running, app em primeiro plano e Hermes principal conectado. No proprio runtime Android, ExpoLocation e SenhaFacilDeviceCredential presentes e fetch localhost retornou 401 da API via USB. Bundle servido inclui a URL USB e nao contem a chave Gemini da API (verificacao local sem exibir o segredo). Nenhuma chamada ao Google, captura de GPS, desbloqueio biometrico/credencial, acesso a conta ou alteracao de PIN executados nesta sonda. Autenticacao completa, sugestao Gemini real, acessibilidade/TalkBack e fluxo assistido permanecem para teste manual.

## Controles de Seguranca e Avisos (2026-11-15)

Perfil aprovado: 5 leituras distintas, 10 copias ou 3 exclusoes em 60 segundos exigem nova identidade e liberam 60 segundos apos confirmacao. Ate 5 novos pedidos/minuto/conta e 3 pendentes. Login online: esperas de 5s/30s/120s apos 3/5/8 falhas em 15 minutos. Familiares ativos que aprovam tambem recebem avisos. Retencao de 90 dias desde recordedAt, sem conteudo do cofre ou GPS. Relato do aparelho nao e prova de fraude; volume nao nega emergencia offline.

Migration `20261115000200_security_activity` cria eventos, outbox, estados de rate, dispositivos e campos opcionais da sessao. Backup custom com ACL restrita no D: verificado com `pg_restore --list` antes de aplicar no banco local. Testes executam as 12 migrations em base isolada, removida no finally. Nao resetar banco, contas ou aparelho; nao ha dependencia nova ou APK requerido.

Passaram 101 testes API focados (HTTP/JWT/PostgreSQL real, transporte FCM simulado) e 157 mobile (SQLite real em memoria). Cobertura: limiares, receipts/idempotencia, esperas persistentes, revogacao/auditoria atomica, 90 dias/cleanup, workers concorrentes, retry/dedup, instalacao, permissoes, emergencia e regressao de cofre/PIN/biometria/login. Tipos, lint e build API aprovados. Isso nao certifica hardware ou entrega real de push.

Previa ficticia: quinta senha interrompida antes do plaintext; senha incorreta nao revela, correta reabre a chave e continua. Um incidente, fonte do aparelho explicita, revogacao somente com mestra correta e sessao atual preservada. A 320px, texto 140%/contraste sem controles cortados. Nenhuma credencial ou GPS real utilizado.

Export final aprovado (1.842 modulos,HBC7,44MB), sem fixture no bundle do workspace. Layout/copia de UI restaurados e previa encerrada. Com autorizacao, app normal reaberto no smartphone para iniciar os servicos novos, preservando APK/dados/datas da instalacao. API/Metro/runtime respondem; entrega FCM real dos novos avisos ainda requer teste manual.

### Roteiro fisico recomendado

1. Login online incorreto: 3/5/8 falhas geram 5s/30s/2min. Tentativas bloqueadas nao renovam a espera. Login correto apos o prazo remove falhas; desbloqueio offline permanece conforme configuracao.
2. Quatro senhas diferentes: quinta exige identidade antes de revelar. Mesmo item/remap de ID nao soma outra senha. A decima copia ou terceira exclusao distinta em 60s exige confirmacao. Cancelar/erro nao atua; plaintext/clipboard ocultos, sem apagar por suspeita.
3. PIN/biometria deve abrir a chave. Dialogo sem sucesso nativo ou mestra incorreta nao libera. Confirmacao valida permite 60s; lock/logout/conta diferente nao reaproveita contexto. Testar edicao, copias, exclusoes e aprovacao expirada durante o dialogo.
4. Emergencia offline reautentica e audita mesmo apos burst. Releitura confirmada do mesmo item nao gera falso segundo acesso, nao libera outro item e e invalidada por lock. Fila idempotente ao reconectar.
5. Tres pedidos diferentes pendentes: quarto orienta aguardar/cancelar. Repetir PENDING reusa. Ate cinco novos/minuto; sexto espera. Protecao e dados preservados.
6. Mestra, kit e recuperacao: eventos/push para titular e familiar APPROVE, revogacao online e senhas preservadas. Sem kit/mestra no aviso. Falha da auditoria antes do commit deve desfazer a operacao.
7. Instalação nova gera aviso; mesmo UUID nao repete. Reinstalar pode avisar, sem IMEI/GPS. Cliente antigo funciona sem identificacao. Revogacao de vinculo/permissao/conta corta leitura e entrega pendente.
8. Revisar sessoes: somente as proprias, sem tokens/hashes. Mestra incorreta, ID estranho ou sessao atual nao revogam. Encerrar outras preserva a atual e copias offline; novas chamadas devem recusar sessao revogada.
9. FCM real: canais, permissoes, tokens, background/encerrado/toque SECURITY_EVENT e retry. Aviso permanece no app sem FCM. Entrega at-least-once pode repetir o mesmo eventId. Monitorar cron, leases, estados expirados e limpeza de 90 dias.
10. TalkBack, fonte do SO, reduzir movimento e idosos consentidos. Rede oscilante nao repassa dados a outra conta. Relatos com segredos, GPS, site, campos extras ou tipo SERVER devem ser recusados.

Limites de login sao online; leitura/copia/exclusao sao controles do cliente. Aparelho comprometido pode extrair material ou falsificar/omitir relatos. Nao declarar custodia pelo familiar, presenca comprovada ou fraude detectada com certeza. Nao coletar localizacao adicional.

## Status de Sincronizacao e Mapa Enxuto (2026-11-15)

Mudanca somente de JavaScript: lista focada recebe notificacoes de cache confirmado, sem refresh/loader total. Status e Sincronizada somente quando synced=true no SQLite; conflito mostra Revisar sincronizacao. Erro de envio conserva pendencia, e sucesso parcial ja gravado nao e escondido por falha posterior. Conta/foco/geracao impedem aplicar um snapshot tardio.

73 testes focados mobile, tipos e lint relacionados aprovados. Previa ficticia confirmou transicao de estado sem reload, busca preservada, desconexao de listener ao sair, recusa de outra conta e aviso de conflito.320px/fonte140%/contraste sem status cortado. Browser integrado inativo suspende CSS; conferir o fade180ms, fonte do SO e TalkBack no Android fisico. Reduzir movimento manteve o status visivel sem animacao.

Credito minimo do mapa: © OpenStreetMap com link de origem/licenca; doacao/termos opcionais/reportar e separadores retirados. Script real no embed publico de0,0 preservou uma unica atribuicao, inclusive quando o provedor reconstroi o rodape. WebView permite apenas a URL HTTPS exata de copyright abrir fora do app, sem coordenadas; erro de abertura gera aviso. Nao retirar o credito obrigatorio.

Roteiro: criar senha e permanecer no cofre sem puxar refresh; confirmar troca automatica apos recibo. Repetir offline/reconexao, erro no envio/PULL, mudanca de conta e conflito. Campos/filtros/rolagem nao devem ser reiniciados. Testar mapa novo/historico sem doacao/termos e conferir acesso a licenca. Recarregar o JavaScript para reiniciar servicos apos mudar SyncService; nao reinstalarAPK nem limpar dados.

Export final aprovado (1.831 modulos,HBC7,39MB), sem fixture no workspace principal. Com autorizacao, Senha Facil foi fechado/reaberto no smartphone para carregar o servico novo; datas da instalacao/atualizacao do APK permaneceram iguais. Nenhuma conta foi acessada pela sonda. API/Metro principais e runtime normal responsivos ao concluir.

## Retorno Apos Salvar e Localizacao Historica (2026-11-15)

Mudanca de finalidade aprovada pelo usuario: conservar30dias apos envio somente a localizacao consentida de pedidos autorizados/negados. Nao houve nova coleta, rastreamento ou recuperacao de pontos apagados. O APK comWebView anterior basta; atualizar API/Prisma/migration e recarregar Metro.

Migration `20261115000100_location_history` adiciona historyExpiresAt nullable/indexado, sem preencher datas antigas. Aplicada localmente apos pg_dump custom em diretorio restrito no D: e verificacao com pg_restore --list, sem reset do banco. Testes usam base separada e removem somente suas fixtures/bases. Antes de producao, ensaiar restauracao e reaplicar as regras de limpeza a backups restaurados.

66 testes API e74 mobile focados passaram: HTTP Nest/Fastify/JWT com PostgreSQL real, titulares/familiares ativos, recusas apos revogacao/inatividade, limite exato, nao extensao da retencao, opt-in semGPS, cancelamento/expiracao e clientes legados. Tipos/lint relacionados e buildAPI aprovados. Previa isolada confirmou salvamento por entrada direta/normal, preservacao apos falha, ausencia de duplicacao e fechamento do formulario.

Export Android final aprovado (1.831 modulos,HBC7,38MB), sem fixtures no bundle principal. Gravacao tardia apos sair da tela confirmou preservacao da navegacao atual. API/Metro principais e runtime normal do smartphone responsivos ao concluir; nao foi necessario reinstalarAPK.

Mapa historico em preview recebeu ponto ficticio somente ao expandir; nenhuma carga externa antes da autorizacao. Fechar/sair e avancar relogio mais de30dias retirou a posicao.320px/fonte140%/contraste sem overflow ou controle cortado. Script real do Android aplicado ao embed publico de0,0 removeu apenas report-link/separador, preservando creditos mesmo apos zoom.

### Roteiro de reteste

1. Criar/editar senha comum ou assistida e Salvar: abrir cofre/lista imediatamente apos gravacao local, inclusive quando nao ha tela anterior. Erro de gravacao preserva dados e nao muda de tela; duplo toque nao cria duas senhas. Aguardar sincronizacao nao e requisito para voltar.
2. Enviar pedido com Guardar este ponto no historico por30dias desativado: comportamento efemero preservado. Ativar explicitamente e enviar comGPS: prazo contado no servidor desde requestedAt, nunca a partir da decisao; repeticao dePENDING nao estende nem altera consentimento.
3. Autorizar ou negar pedido consentido e abrir Historico > Ver localizacao deste pedido. Conferir horario original/margem de precisao, nao GPS atual. Ver mapa exige aviso/autorizacao de envio ao OpenStreetMap e nao exibe convite de reportar problema no Android.
4. Titular e familiares ainda ativos/APPROVE_ACCESS veem o ponto; revogar permissao/vinculo ou desativar a conta impede a nova leitura. Cliente reconfirma a cada15s enquanto os detalhes ficam abertos e remove o ponto apos falha, perda de internet, background ou saida.
5. No instante historyExpiresAt, API recusa leitura e cliente retira mapa; cron exclui a linha em ate um minuto enquanto ativo, preservando AccessLog normal. Nenhum timer de30dias excede o limite32-bit.
6. Cancelar, expirar, semGPS, emergencia offline e cliente antigo nunca deixam ponto no historico apos encerrar. Pontos previamente apagados nao ganham localizacao artificial. Listagens/WS/push/estado continuam sem coordenadas.
7. Retestar no A12 com contas ficticias e dois atores, TalkBack/fonte ampliada/rede instavel, sem publicar localizacao ou credenciais reais. O mapa de historico nao reabre autorizacao da senha: os10minutos originais continuam independentes dos30dias do ponto.

## Ajustes de Usabilidade e Identidade (2026-11-11)

Novo APK ARM64: `D:\Android\Builds\SenhaFacil-ajustes-20261111-arm64-v8a.apk`, 93.822.382 bytes, SHA-256 `bb4765d6037ea633c6d1878ffb2b926defa7170fb93f6ab4f142ced00c0b9385`. Compilacao isolada no D: com Java21, pools CMake/Ninja2/1 e Gradle1 worker; passou em5m43s. WebView exigiu baixar dependencia Gradle ausente (AGP7.0.4) apos falha offline; nenhum codigo foi enviado a servico de build. Assinatura original e alinhamento16KiB verificados. Atualizacao no A12 preservou firstInstallTime2026-11-08 e dados do app. APK de desenvolvimento depende do Metro, nao e release autonomo.

Migration `20261111000100_phone_login` aplicada sem reset, apos backup custom com acesso restrito no D: e verificacao do arquivo com pg_restore --list. Banco de testes separado recebeu todas as dez migrations; testes removeram somente fixtures/bases temporarias proprias. A verificacao de integridade do arquivo nao substitui ensaio de restauracao antes de producao.

Evidencias: 96 testes API focados (inclui HTTP/JWT/PostgreSQL real),135 mobile e8 crypto, tipos/lint relacionados, build API e export Android final (1.831 modulos,HBC7,37MB) aprovados. Root/rota temporarios de UI removidos antes do export. Usuario confirmou funcionamento real da IA; nao repetimos chamada externa/cobranca para essa confirmacao.

Previa em320/360px, texto140%/contraste: Ver/Ocultar e autoCapitalize=none, seis palavras locais, consulta IA em quatro passos com consentimento/sem geracao automatica, login de entrada nao editavel, formularios de seguranca separados, quatro abas sem quebra e lista sem sobreposicao. Mapa web testado com resposta simulada para conferir zero envio antes do consentimento, montagem/desmontagem e ausencia do input Motivo.

No Galaxy A12/Android13, somente fixtures em memoria: nome/senha acompanharam teclado; limite inferior do campo~471dp e teclado~495dp em140%. Revelar nao perdeu foco/texto ficticio, ocultar restaurou campo secreto. WebView nativa carregou mapa de0,0 apos autorizacao, sem GPS/cofre/conta real. Scripts/fixtures/capturas temporarias removidos; APK normal atualizado e servicos locais preparados nas tarefas do VS Code.

### Reteste manual recomendado

1. Login e cadastro: entrar/sair/reentrar deve abrir o cofre uma vez; voltar de notificacoes/permissoes nao solicita senha novamente. Restaurar o processo, sair para outro app e120s inativo continuam bloqueando.
2. Cadastro por celular com DDD, variantes com+55 e duplicidade; login/recovery/convite devem reconhecer a mesma identidade. Contas por email conservam a entrada; telefone de contato nao e login. Kit segue obrigatorio; nao ha SMS ou verificacao de posse.
3. Em todos os campos secretos, Ver/Ocultar deve manter valor/foco e nao forcar maiuscula. Focar campos inferiores nas telas Conta, criar/editar, login, kit e convites; teclado nao cobre o campo e Salvar continua alcancavel por rolagem.
4. Minha conta > Configurar PIN,digital ou rosto: selecionar metodo, preencher senha e Confirmar e ativar. Cancelar/erro nao ativa; Android antigo/sensor fraco/mudanca de bloqueio orientam senha mestra. Testar digital real, credencial por operacao e face forte somente em aparelho compativel.
5. Palavras faceis de ler: seis palavras/dois digitos, simbolos opcionais, no aparelho e sem nomes/gostos pessoais. Conferir limite real do site sem truncar a senha; nova geracao exige confirmacao quando ja existe senha no formulario.
6. IA: avancar/voltar/alterar escolhas descarta sugestao anterior; consentimento necessario. Gerar e substituir so apos confirmacao, sem salvar automaticamente, sem alterar a senha quando a consulta falha.
7. Copiar login e senha separados, com mesma autorizacao/expiracao de cinco minutos. Alternar entre eles, bloquear/sair e colar no app de teste; nao publicar o clipboard.
8. Familiar: pedido sem Motivo, horario/precisao legiveis, mapa com aviso antes da carga. Fechar, sair, perder atualizacao, decidir/cancelar/expirar remove o mapa. Negar consentimento ou falhar internet nao impede decidir. Usar dois atores e posicoes simuladas; nenhum teste exige rastrear o aparelho.
9. TalkBack, leitura140% mais fonte do SO, alvos/contraste/reduzir movimento em dispositivo fisico e estudo consentido com idosos. Interface externa do mapa tambem deve ser avaliada; o texto de horario/precisao permanece disponivel sem ele.

Para iniciar novamente com USB, apos Docker/PostgreSQL: executar as tarefas **Senha Facil: API local (Windows)** e **Senha Facil: Smartphone USB (Windows)** em [tasks.json](../.vscode/tasks.json). Nao executar simultaneamente o perfil de emulador. Recriar `adb reverse` apos reconexao e manter cabo/computador ligados.

## APK local atualizado com localizacao (2026-11-02)

Compilacao em `D:\Android\Builds\SF-20261102`, isolada do workspace. Copia de mobile/crypto/configuracoes/assets e cliente Firebase, sem .env, banco ou .git. Dependencias do lockfile restauradas offline com scripts desabilitados; pnpm 9.15.9 e `node-linker=hoisted` resolveram caminhos longos. O pnpm 9.0 instalado ignora virtual-store-dir-max-length; somente encurtar esse parametro com 9.15 ainda deixava prefab acima do limite. Autolinking regenerado depois da mudanca de layout. Nao alterar o layout do workspace original para repetir este procedimento.

Build `:app:assembleDebug` com Java 21, Gradle 8.14.3, ABI x86_64, dois workers, heap Gradle de 2 GiB e paralelismo de projetos desativado. Java/SDK/Gradle/TEMP/TMP apontaram para D:. Nao foi usado servico remoto de compilacao.

Keystore original obtido por consulta autenticada ao proprio projeto EAS, sem gerar outra chave, imprimir segredos ou enviar codigo. Arquivos de assinatura ficam fora do repositorio, com acesso restrito; nunca anexar ou versionar a chave/senhas. APK anterior efetivamente instalado foi lido somente para verificar seu certificado publico. Novo APK reassinado com a mesma chave e validado por apksigner e zipalign (paginas de 16 KiB).

Artefato: `D:\Android\Builds\SenhaFacil-location-20261102-x86_64.apk`, 87.293.124 bytes, SHA-256 `7685d1bb7d57032c7d66d316af7089405f135d4d5efcc393572edd56a22caa6c`. Certificado publico SHA-256 `5a7ed2e5c03ec1bf184840f619afe2dcd88b541b37e8cdc0f1856a5d969dfd29`. Somente emulador x86_64, nao celular ARM nem release.

Atualizacao segura, depois de conferir o certificado da instalacao:

```powershell
& 'D:\sdks\platform-tools\adb.exe' -s emulator-5554 install -r --no-streaming 'D:\Android\Builds\SenhaFacil-location-20261102-x86_64.apk'
```

ADB retornou Success, firstInstallTime permaneceu 2026-10-10 20:55:20 e lastUpdateTime mudou. Nenhuma desinstalacao, Wipe Data, limpeza de armazenamento, recadastro ou reset de banco. Manifesto final e pacote instalado confirmam COARSE/FINE_LOCATION, sem acesso background/foreground-service de localizacao e allowBackup=false.

App aberto pela MainActivity e deep link do development client com IPv4 LAN do Metro original. Runtime Hermes confirmou ExpoLocation, getForegroundPermissionsAsync e requestForegroundPermissionsAsync. Uma chamada diagnostica apenas de permissao abriu a atividade nativa GrantPermissionsActivity do Android, deixada para decisao manual; nao houve concessao automatica ou leitura de GPS. Isso confirma correcao da ausencia do modulo, nao o fluxo completo de coleta/decisao familiar.

Primeira inicializacao simultanea de Docker/emulador/API sofreu falta de memoria; emulador encerrou sem boot. Nova tentativa com recursos estabilizados passou. API ficou em processo unico `node dist\main.js` para evitar o custo do watch; `/users/me` retornou 401 esperado e Metro `/status` respondeu 200. Banco original preservado. Sem ajustes de memoria virtual, fechamento de aplicativos pessoais ou relocalizacao do workspace.

## Credencial do aparelho: validacao e ativacao (2026-11-02)

Modulo local em `apps/mobile/modules/device-credential`, incluido automaticamente pelo autolinking Expo. Precisa acompanhar o codigo no prebuild/copia de compilacao; nao exige dependencia npm ou alteracao de linker do workspace. Requer novo APK, nao Expo Go/Fast Refresh. Android 11/API 30+ e bloqueio de tela seguro sao obrigatorios para a nova opcao; Android anterior conserva biometria/senha mestra. Guards de versao explicitos e Android Lint sem issues, com abortOnError ativo somente no modulo novo.

APK do emulador: `D:\Android\Builds\SenhaFacil-device-credential-20261102-x86_64.apk`, 87.444.676 bytes, SHA-256 `f81861b6fdd76635160e6912c35a43c0c1e062cdfaae06c7e9a43db312a1973e`. Compilacao local isolada no D:, mesmo certificado original, alinhamento de 16 KiB verificado e instalacao com `adb install -r --no-streaming`; sem Wipe Data, uninstall ou reset de banco. firstInstallTime preservado em 2026-10-10 20:55:20; lastUpdateTime final 2026-11-02 17:58:33, conforme relogio Android. Nao distribuir esse APK x86_64 de desenvolvimento como release ou para celulares ARM.

Evidencia automatizada: suite mobile completa de 147 testes e rodada final focada de 73 testes apos tres casos adicionais; tipos, lint TS das superficies alteradas, compilacao Kotlin/Gradle e Android Lint do modulo passaram. Mocks JS nao comprovam protecao Keystore; por isso houve validacao adicional no Android real do emulador.

Com autorizacao, configurado PIN ficticio temporario apenas no emulador e usado um identificador/chave ficticios, sem desbloquear contas existentes. Modulo real cifrou a chave com autenticacao DEVICE_CREDENTIAL, abriu os mesmos bytes somente depois de novo prompt, recusou cancelamento sem devolver chave e exigiu prompt em cada nova operacao mesmo logo apos autenticar. Remover e recriar a credencial invalidou a chave anterior. Fixture e PIN de teste removidos ao terminar, restaurando a configuracao inicial sem bloqueio de tela.

No APK definitivo, getStatus confirmou supported=true/secure=false/enabled=false/needsReactivation=false para a fixture removida; tentativa de ativacao sem bloqueio retornou DEVICE_AUTH_NOT_CONFIGURED, sem criar copia. Banco healthy, API respondeu 401 esperado sem credenciais e Metro 200. Segredos/credenciais de contas nao foram consultados. Testes criptograficos nao concluem validacao end-to-end da UI na conta do usuario.

### Roteiro de compatibilidade restante

1. No Android, configure seu bloqueio de tela (PIN, padrao ou senha). Nao envie essa credencial a outra pessoa nem digite no formulario de senha mestra.
2. No app, abra Minha conta > Desbloqueio, senha e recuperacao, preencha senha mestra e ative o bloqueio do aparelho. Confira o aviso de acesso por quem conhece a credencial. Cancelar o aviso/prompt ou informar senha mestra errada nao pode ativar a opcao.
3. Bloqueie/reabra offline: bloqueio do celular primeiro, biometria ativada como alternativa e senha mestra sempre disponivel. Cancelamento/erro nao devem selecionar automaticamente outro metodo nem abrir o cofre. Conferir PIN, padrao e senha, Android 11 e fabricantes diferentes; apenas PIN/API 37 foi testado no emulador.
4. Ative biometria separadamente. Falha de status de um metodo nao deve esconder o outro. Confira rosto/digital fortes, cancelamento e bloqueio temporario em aparelho fisico.
5. Desative o desbloqueio do aparelho no app: copia/aliases daquela conta removidos, senha mestra e biometria preservadas, bloqueio de tela do Android inalterado. Outra conta nao herda a ativacao.
6. Remover/resetar bloqueio no Android pode invalidar a chave. Use senha mestra, reconfigure bloqueio e reative. Troca normal da credencial pode preservar a chave conforme o Android. Novo aparelho/reinstalacao nao transfere essa protecao.
7. Teste background/bloqueio/logout durante ativacao/leitura; resposta tardia nao pode abrir chave ou habilitar outra conta. Login remoto apos logout exige e-mail/senha uma vez e nao regrava a chave protegida. Recuperacao com DEK diferente invalida a copia antiga sem pedir prompt no login.
8. Em emergencia offline, exija nova confirmacao e auditoria antes da revelacao; com internet continua valendo aprovacao familiar. Nenhuma localizacao deve ser coletada na emergencia.
9. Conferir TalkBack, texto ampliado, foco e retorno do teclado/prompt nativo. O cofre nao certifica hardware-backed/StrongBox, root ou todos os fabricantes; manter limitacoes de release.

## Gate de Producao

- Recuperacao/troca e separacao v2 implementadas e testadas automaticamente; concluir revisao do protocolo e testes fisicos com dados existentes/falhas/outro aparelho.
- Frozen install, tipos, lint, testes, migrations e export Android aprovados.
- Testes fisicos/two-actor/TalkBack aprovados, com evidencias anonimas.
- Icone/adaptive icon/splash reais aprovados; identidade, versao e assinatura conferidas.
- HTTPS, CORS, limites, secrets por ambiente e ausencia de segredos no bundle/logs.
- Backup PostgreSQL cifrado, restauracao ensaiada, retencao definida e exclusao aplicada tambem apos restauracoes.
- Auditoria resolvida:365dias com limpeza diaria. Coordenadas consentidas deAPPROVED/DENIED:30dias apos envio, cleanup por minuto; demais encerramentos/sem consentimento apagam imediatamente. Sessoes expiradas removidas; revogadas removidas apos30dias. Cofre/tombstones/receipts permanecem enquanto a conta existir para preservar sync.
- Monitorar disponibilidade, cron/sync/push, armazenamento e restauracao sem logar segredos. Alarmes/backups ainda nao provisionados.
- Revisao LGPD, consentimento, suporte e privacidade revisados.
- DOCX alinhado ao estado real, sem declarar producao, zero-knowledge estrito ou testes com idosos ainda nao realizados.