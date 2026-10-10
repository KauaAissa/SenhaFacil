# Senha Facil

Gerenciador de senhas com cofre cifrado localmente e aprovacao opcional por familiares. Familiares autorizados recebem solicitacoes e historico, nao as senhas do titular.

**Estado:** desenvolvimento. Nao usar senhas reais ate concluir os bloqueios de seguranca, integracao e validacao fisica descritos em [docs/STATUS.md](docs/STATUS.md).

## Ambiente

- Node 22.13 ou superior da linha 22, ou Node 24; pnpm 9.
- PostgreSQL 16. Docker Desktop deve estar em execucao.
- Android: Expo SDK 54. Push remoto exige development build, nao Expo Go.
- API NestJS/Prisma; mobile React Native/Expo Router; monorepo pnpm/Turbo.

Instalar dependencias com `pnpm install --frozen-lockfile`. Configurar os ambientes locais pelos exemplos em [apps/api/.env.example](apps/api/.env.example) e [apps/mobile/.env.example](apps/mobile/.env.example). Nao versionar credenciais.

```powershell
docker compose up -d
pnpm db:generate
pnpm db:deploy
pnpm dev:api
```

Em outro terminal, iniciar `pnpm dev:mobile:client`. Para aparelho fisico, `EXPO_PUBLIC_API_URL` deve usar o IP LAN do computador, nao `localhost` ou `10.0.2.2`. Forcar `REACT_NATIVE_PACKAGER_HOSTNAME` se Metro escolher um adaptador virtual. HTTP local e apenas para contas e senhas ficticias.

## Verificacao

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @senha-facil/mobile build:android:bundle
```

Com PostgreSQL e migrations aplicadas:

```powershell
$env:INTEGRATION_TESTS='1'
pnpm --filter @senha-facil/api exec jest --runInBand
Remove-Item Env:INTEGRATION_TESTS
```

Os testes unitarios da API usam Prisma simulado; os testes mobile usam SQLite real em memoria no Node. Isso nao substitui SQLite/biometria/clipboard no Android. A CI configura PostgreSQL, aplica migrations e habilita os testes de integracao, mas sua execucao remota ainda precisa ser confirmada.

## Limites Importantes

- Autenticacao por senha no Android usa PBKDF2-HMAC-SHA256 nativo assincrono com as mesmas 600.000 iteracoes e chaves anteriores. Requer development build com `react-native-quick-crypto`; Expo Go encerra a tentativa com erro explicito, pois o calculo JavaScript levou varios minutos no emulador. Apos instalar o build, iniciar Metro com `pnpm dev:mobile:client` e a URL da API correta. Nao reduzir iteracoes nem recriar a conta para contornar esse limite.
- Chaves e bancos SQLite separados por conta. Reinicio restaura a sessao bloqueada; desbloqueio local nao depende de JWT.
- Itens protegidos sao descriptografados pela politica do app somente apos consultar a autorizacao. O proprietario ja possui a chave local; isso nao e custodia criptografica pelo familiar.
- Emergencia offline exige reautenticacao e registra uma fila local antes da revelacao. O servidor recebe um relato do aparelho, nao prova independente da biometria.
- Novas contas usam credencial de autenticacao derivada, separada da chave do cofre. A migracao automatica de contas antigas ainda precisa enviar a senha antiga uma vez. Nao ha garantia de zero-knowledge estrito contra cliente/servidor comprometidos nem protecao absoluta contra adivinhacao de senhas fracas.
- Kit de recuperacao de 256 bits, troca de senha e substituicao do kit preservam a chave dos itens. A API recebe envelopes cifrados e hashes Argon2id de credenciais derivadas, nunca o codigo do kit ou a chave. Operacoes de seguranca revogam sessoes online; nao apagam copias offline em outros aparelhos.
- O kit pendente fica temporariamente no SecureStore ate a confirmacao de armazenamento fora do aparelho. Recuperacao exige internet e um kit valido; nao existe reset administrativo que recupere conteudo cifrado sem ele.
- A primeira tela e o login. Frontend usa Atkinson Hyperlegible, alvos de toque de 56 px, fonte ampliada/contraste, animacoes curtas com reduzir movimento e assets PNG. `http://localhost:8081` e uma previa visual web, nao um cliente web seguro do cofre: SecureStore, biometria e captura exigem Android.
- Exclusao remove a conta ativa e limpa este aparelho; nao apaga magicamente copias em aparelhos offline ou backups de infraestrutura.

## Documentacao

- [docs/STATUS.md](docs/STATUS.md): matriz dos 25 itens e pendencias.
- [docs/VALIDATION_AND_RELEASE.md](docs/VALIDATION_AND_RELEASE.md): testes fisicos, migrations, Firebase e distribuicao.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): contratos e diagramas para alinhamento do documento academico.

Voz, geolocalizacao, rastreamento de aparelho, chatbot externo, autofill e publicacao iOS permanecem fora do escopo aprovado.

## Smoke HTTP de Recuperacao

Com a API local em execucao e o banco migrado, o teste abaixo cria duas contas ficticias e as remove no `finally`. Nao executar contra producao ou com dados reais.

```powershell
$env:HTTP_TESTS='1'
pnpm --filter @senha-facil/crypto exec tsx --test --test-name-pattern=HTTP test/protection.test.ts
Remove-Item Env:HTTP_TESTS
```

`HTTP_API_URL` permite apontar outro ambiente de teste autorizado. O teste verifica contrato v2, permissao de contato, cancelamento, troca de senha, recuperacao, rejeicao do kit antigo, preservacao do ciphertext e repeticao de refresh perdido. Sem essa flag, ele e ignorado pela suite normal.