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

Antes de deploy em banco existente, gerar backup autorizado e testar restauracao em ambiente separado. Novas migrations acrescentam versoes/tombstones/receipts, sessoes, perfil/cascatas e push por sessao. JWTs antigos sem sessao deixam de funcionar e tokens push legados ficam sem associacao; realizar novo login/registro de token.

## Testes Fisicos

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
| Emergencia | Reautenticacao; evento antes da revelacao; envio unico; identifica relato do aparelho |
| Clipboard | Limpeza em 30s/bloqueio/blur nao apaga texto diferente; avaliar historico do SO |
| Push nativo | Permissao negada nao bloqueia app; background/encerrado/toque/refresh/logout/multiplos aparelhos |
| Perfil/exclusao | Senha errada nao exclui; correta remove dados ativos; falha local/backup/offline informados |
| TalkBack/fontes | Ordem/rotulos/estados claros; acoes alcancaveis; 140% mais fonte do SO sem sobreposicao/corte; teclado nao esconde salvar |
| Participantes idosos | Criar/encontrar/revelar/copiar/pedir ajuda com consentimento; registrar dificuldades reais |

Os tres testes PostgreSQL passaram localmente e automatizam idempotencia/versao, decisao concorrente e cascata/anonimizacao. Nao testam HTTP, UI, biometria, notificacoes remotas ou usabilidade.

Um smoke separado contra a API HTTP real passou para cadastro/perfil, isolamento/idempotencia, contatos/aprovacao/revogacao e refresh/logout. Suas duas contas ficticias foram excluidas ao final. Isso tambem nao valida o cliente Android nem push externo.

## Firebase: Somente Com o Usuario

1. Confirmar projeto e Android package `com.senhafacil.app`; cadastrar aplicativo Android.
2. Vincular `google-services.json` por caminho/configuracao aprovada, sem inventar credenciais. Confirmar regras de versionamento.
3. Configurar `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY` no secret store da API. Nunca usar `EXPO_PUBLIC_` para secrets.
4. Configurar FCM v1/assinatura no EAS autorizado, sem expor JSON privado em conversa/logs.
5. Produzir e instalar novo development build; verificar canal, texto privado, token e invalidacao em duas contas/aparelhos.

Push e best effort: erros nao devem desfazer decisao persistida; polling/estado continuam obrigatorios. Token pertence a sessao, nao ao usuario inteiro.

## Artefatos EAS

Perfis em [../apps/mobile/eas.json](../apps/mobile/eas.json). Nenhum build remoto/publicacao foi executado.

```powershell
pnpm dlx eas-cli build --platform android --profile development
pnpm dlx eas-cli build --platform android --profile preview
pnpm dlx eas-cli build --platform android --profile production
```

Executar apos vinculo EAS/autorizacoes. Development/preview geram APK; production gera AAB. Configurar `EXPO_PUBLIC_API_URL` HTTPS no release; nao embarcar LAN/localhost. Modulos nativos como clipboard/screen capture exigem novo build, nao apenas reload Metro.

## Gate de Producao

- Recuperacao/troca de senha e separacao autenticacao/chave implementadas, com itens existentes, falhas e outro aparelho.
- Frozen install, tipos, lint, testes, migrations e export Android aprovados.
- Testes fisicos/two-actor/TalkBack aprovados, com evidencias anonimas.
- Icone/adaptive icon/splash reais aprovados; identidade, versao e assinatura conferidas.
- HTTPS, CORS, limites, secrets por ambiente e ausencia de segredos no bundle/logs.
- Backup PostgreSQL cifrado, restauracao ensaiada, retencao definida e exclusao aplicada tambem apos restauracoes.
- Historico resolvido: 365 dias com limpeza diaria. Sessoes expiradas removidas; revogadas removidas apos 30 dias. Cofre/tombstones/receipts permanecem enquanto a conta existir para preservar sync.
- Monitorar disponibilidade, cron/sync/push, armazenamento e restauracao sem logar segredos. Alarmes/backups ainda nao provisionados.
- Revisao LGPD, consentimento, suporte e privacidade revisados.
- DOCX alinhado ao estado real, sem declarar producao, zero-knowledge estrito ou recuperacao inexistente.