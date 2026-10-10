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

- Chaves e bancos SQLite separados por conta. Reinicio restaura a sessao bloqueada; desbloqueio local nao depende de JWT.
- Itens protegidos sao descriptografados pela politica do app somente apos consultar a autorizacao. O proprietario ja possui a chave local; isso nao e custodia criptografica pelo familiar.
- Emergencia offline exige reautenticacao e registra uma fila local antes da revelacao. O servidor recebe um relato do aparelho, nao prova independente da biometria.
- A API ainda recebe a senha mestra na autenticacao. Apesar de guardar hash Argon2id e payload cifrado, a arquitetura atual **nao e zero-knowledge estrito**.
- Kit de recuperacao e troca segura de senha mestra ainda nao implementados. Nao redefinir senha/KDF sem preservar a chave dos itens existentes.
- Exclusao remove a conta ativa e limpa este aparelho; nao apaga magicamente copias em aparelhos offline ou backups de infraestrutura.

## Documentacao

- [docs/STATUS.md](docs/STATUS.md): matriz dos 25 itens e pendencias.
- [docs/VALIDATION_AND_RELEASE.md](docs/VALIDATION_AND_RELEASE.md): testes fisicos, migrations, Firebase e distribuicao.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): contratos e diagramas para alinhamento do documento academico.

Voz, geolocalizacao, rastreamento de aparelho, chatbot externo, autofill e publicacao iOS permanecem fora do escopo aprovado.