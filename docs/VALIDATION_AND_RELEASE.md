# Validacao e Distribuicao Android

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

## Testes Fisicos

Autenticacao Android exige development build com `react-native-quick-crypto`, Nitro Modules e quick-base64. Expo Go nao inclui esses modulos e rejeita a derivacao explicitamente. Chaves e iteracoes antigas sao preservadas; entrar com a conta existente, sem reset de banco nem recadastro. Armazenamento do development build e separado do Expo Go: preservar a instalacao anterior ate verificar dados nao sincronizados e kit.

Build local Windows requer Java 21 compativel com Gradle 8.14.3; o Java 25 do Studio instalado nao e compativel. Usar SDK/NDK/caches em disco com espaco e caminhos curtos. pnpm 9.15 aceita `--config.virtual-store-dir-max-length=40`; regenerar autolinking depois de mudar caminhos na copia de compilacao. A tentativa local no D: ainda falhou no CMake/Ninja; nenhum APK foi produzido. Alternativa EAS exige vinculo/autorizacao com o usuario.

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
| Clipboard | Limpeza em 30s/bloqueio/blur nao apaga texto diferente; avaliar historico do SO |
| Push nativo | Permissao negada nao bloqueia app; background/encerrado/toque/refresh/logout/multiplos aparelhos |
| Perfil/exclusao | Senha errada nao exclui; correta remove dados ativos; falha local/backup/offline informados |
| TalkBack/fontes | Ordem/rotulos/estados claros; acoes alcancaveis; 140% mais fonte do SO sem sobreposicao/corte; teclado nao esconde salvar |
| Participantes idosos | Criar/encontrar/revelar/copiar/pedir ajuda com consentimento; registrar dificuldades reais |

Os sete testes PostgreSQL passaram localmente e automatizam idempotencia/versao, decisao/cancelamento, cascata/anonimizacao, recuperacao/revogacao, refresh, emergencia/paginacao e convites/aceites concorrentes. Nao testam UI, biometria, FCM remoto ou usabilidade.

Um smoke opt-in contra a API HTTP real passou para cadastro v2, contatos/permissoes, cancelamento, troca, recuperacao com kit novo, rejeicao do kit anterior, preservacao do ciphertext, pagina e retry de refresh. As duas contas ficticias foram excluidas no finally. Executar com `HTTP_TESTS=1` conforme README. Isso nao valida o cliente Android nem push externo.

A previa web foi usada para inspecao visual de login/cadastro/recuperacao, cofre, cuidador e seguranca, com fixtures em memoria, sem senhas ou contas reais. Largura de 320px, desktop e texto de 140% foram verificados; fixtures removidas ao terminar. Ela nao fornece substituto web de SecureStore/biometria/captura, nem evidencia de acessibilidade no Android. Atkinson Hyperlegible, botoes/switches de 56px, reduzir movimento e assets PNG estao em codigo; validar no novo development build.

## Firebase: Somente Com o Usuario

1. Confirmar projeto e Android package `com.senhafacil.app`; cadastrar aplicativo Android.
2. Vincular `google-services.json` por caminho/configuracao aprovada, sem inventar credenciais. Confirmar regras de versionamento.
3. Configurar `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY` no secret store da API. Nunca usar `EXPO_PUBLIC_` para secrets.
4. Configurar FCM v1/assinatura no EAS autorizado, sem expor JSON privado em conversa/logs.
5. Produzir e instalar novo development build; verificar canal, texto privado, token e invalidacao em duas contas/aparelhos.

Push e best effort: erros nao devem desfazer decisao persistida; polling/estado continuam obrigatorios. Token pertence a sessao, nao ao usuario inteiro.

## Artefatos EAS

Perfis em [../apps/mobile/eas.json](../apps/mobile/eas.json). Projeto vinculado a `@senhafacil/senha-facil` (`bf7a3e81-97af-4127-93fa-945791f84f71`). Em 2026-10-10, chave de assinatura Android gerada no EAS com autorizacao do usuario. Primeiro build `20e5cf70-f5b2-4916-9056-985bee492dea` falhou: Quick Crypto 1.1.8 foi gerado com Nitro 0.33.2 e exige `PropNameIDCache`, ausente no runtime 0.31.2. Runtime alinhado a 0.33.2, header e testes do adaptador verificados. Novo build sem cache `1d53e200-958d-447f-814b-509fd9f23994` terminou com `FINISHED` e gerou APK, com assinatura local verificada. Instalacao ADB sem streaming retornou `Success` e o app abriu conectado ao Metro. Sonda ficticia PBKDF2 no Hermes concluiu em 5.008 ms com resultado identico ao Node, sem bloquear timers; chave/buffers/metadados temporarios removidos. Login da conta existente e demais fluxos ainda pendentes; nenhuma publicacao executada.

O emulador API 37 ficou sem resposta durante a primeira instalacao. Reinicio autorizado preservou armazenamento, Expo Go e contas. Inicializacao padrao encerrou antes do boot; cold boot com `-gpu swiftshader -feature -Vulkan` completou e permitiu instalar. Para reconectar esse APK ao Metro local, usar `adb reverse tcp:8081 tcp:8081`. Nao usar Wipe Data para contornar falhas.

O perfil development aponta somente para a API local do emulador (`http://10.0.2.2:3000`); nao usar esse APK como release. `.easignore` na raiz exclui arquivos de ambiente, documentos e credenciais locais. Inspecao do arquivo de upload validou 187 arquivos, sem os arquivos excluidos, incluindo workspaces, assets e patch da criptografia.

```powershell
Set-Location .\apps\mobile
pnpm --config.store-dir=D:\Android\pnpm-store --config.cache-dir=D:\Android\pnpm-cache dlx eas-cli build --platform android --profile development
```

Executar apos vinculo EAS/autorizacoes. Para preview ou production, alterar o perfil somente apos configurar o ambiente correspondente. Development/preview geram APK; production gera AAB. Configurar `EXPO_PUBLIC_API_URL` HTTPS no release; nao embarcar LAN/localhost. Modulos nativos como clipboard/screen capture exigem novo build, nao apenas reload Metro.

## Gate de Producao

- Recuperacao/troca e separacao v2 implementadas e testadas automaticamente; concluir revisao do protocolo e testes fisicos com dados existentes/falhas/outro aparelho.
- Frozen install, tipos, lint, testes, migrations e export Android aprovados.
- Testes fisicos/two-actor/TalkBack aprovados, com evidencias anonimas.
- Icone/adaptive icon/splash reais aprovados; identidade, versao e assinatura conferidas.
- HTTPS, CORS, limites, secrets por ambiente e ausencia de segredos no bundle/logs.
- Backup PostgreSQL cifrado, restauracao ensaiada, retencao definida e exclusao aplicada tambem apos restauracoes.
- Historico resolvido: 365 dias com limpeza diaria. Sessoes expiradas removidas; revogadas removidas apos 30 dias. Cofre/tombstones/receipts permanecem enquanto a conta existir para preservar sync.
- Monitorar disponibilidade, cron/sync/push, armazenamento e restauracao sem logar segredos. Alarmes/backups ainda nao provisionados.
- Revisao LGPD, consentimento, suporte e privacidade revisados.
- DOCX alinhado ao estado real, sem declarar producao, zero-knowledge estrito ou testes com idosos ainda nao realizados.