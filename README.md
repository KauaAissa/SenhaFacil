<p align="center">
  <img src="apps/mobile/assets/icon.png" width="96" height="96" alt="Ícone do Senha Fácil">
</p>

<h1 align="center">Senha Fácil</h1>

<p align="center">
  Um cofre de senhas pensado para idosos, com acessibilidade, autonomia e ajuda familiar quando necessária.
</p>

**Senha Fácil** é um aplicativo Android para guardar e organizar senhas com criptografia no próprio aparelho. Ele combina uso offline, desbloqueio pelo celular, geração local de senhas e um fluxo opcional de aprovação por familiares, sem entregar a eles as senhas do titular.

> **Estado do projeto:** escopo funcional Android implementado, com testes automatizados e validações locais em emulador e smartphone. A etapa seguinte é preparar a infraestrutura e a distribuição do aplicativo. Publicação, homologação de produção e testes externos pendentes são tratados no [checklist de publicação](#publicação-e-checklist-de-release).

## Sumário

- [O projeto](#o-projeto)
- [Funcionalidades](#funcionalidades)
- [Acessibilidade e experiência](#acessibilidade-e-experiência)
- [Tecnologias](#tecnologias)
- [Arquitetura](#arquitetura)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Segurança](#segurança)
- [Privacidade e localização](#privacidade-e-localização)
- [Como usar o aplicativo](#como-usar-o-aplicativo)
- [Preparação do ambiente](#preparação-do-ambiente)
- [Execução no Android](#execução-no-android)
- [Integrações opcionais](#integrações-opcionais)
- [Comandos e testes](#comandos-e-testes)
- [DevOps, branches e ambientes](#devops-branches-e-ambientes)
- [Builds Android](#builds-android)
- [Publicação e checklist de release](#publicação-e-checklist-de-release)
- [Solução de problemas](#solução-de-problemas)
- [Limites do escopo](#limites-do-escopo)
- [Documentação complementar](#documentação-complementar)
- [Contribuição e licença](#contribuição-e-licença)

## O projeto

O projeto foi desenvolvido no contexto de um **Projeto Integrador**, para facilitar o uso de senhas por pessoas idosas e reduzir a dependência de anotações desprotegidas ou de compartilhamento de credenciais com terceiros.

A proposta não é substituir a autonomia do usuário. O titular mantém o controle do cofre, escolhe quais senhas precisam de assistência e pode administrar seus familiares, configurações de segurança e kit de recuperação.

### Perfis de uso

| Perfil | Responsabilidade |
| --- | --- |
| **Titular / pessoa idosa** | Guarda, organiza e utiliza suas senhas; configura proteção, familiares e recuperação. |
| **Familiar** | Aceita convites e, quando autorizado, aprova ou nega pedidos, consulta o histórico permitido e acompanha avisos de segurança. |

**Ser familiar não concede acesso às senhas, à senha mestra, à chave do cofre ou ao kit de recuperação.**

## Funcionalidades

| Área | Recursos implementados |
| --- | --- |
| **Conta** | Cadastro e login com e-mail **ou** celular brasileiro, senha mestra, perfil e exclusão da própria conta. |
| **Cofre** | Cadastro, edição, exclusão, busca, categorias, favoritos e visualização controlada de login e senha. |
| **Uso offline** | Armazenamento local por conta, desbloqueio local e utilização de senhas comuns sem depender da API. |
| **Sincronização** | Fila de alterações, confirmações idempotentes, versões, exclusões e resolução explícita de conflitos. O status da lista muda sem atualização manual. |
| **Desbloqueio** | Senha mestra, bloqueio do celular no Android compatível e biometria forte opcional. |
| **Acesso assistido** | Convite e permissões de familiares, solicitação, aprovação, negativa, cancelamento e histórico. |
| **Emergência offline** | Reautenticação e registro local antes de revelar uma senha assistida, com envio do relato quando a conexão voltar. |
| **Recuperação** | Kit de recuperação de 256 bits, substituição do kit e troca da senha mestra sem trocar a chave dos itens. |
| **Geração de senhas** | Caracteres aleatórios, palavras portuguesas aleatórias e ajuda guiada por IA para escolher regras de geração. |
| **Localização pontual** | Uma posição por novo pedido online, mapa incorporado e retenção histórica opcional por pedido. |
| **Segurança de atividade** | Confirmação adicional em volumes incomuns, limites de pedidos, espera progressiva no login e avisos ao titular e familiares autorizados. |
| **Sessões** | Consulta das sessões online e encerramento de outras sessões após confirmação da senha mestra. |
| **Notificações** | Integração com Firebase Cloud Messaging e atualização de estado por Socket.IO e consultas autenticadas. |
| **Acessibilidade** | Leitura ampliada, contraste reforçado, controles grandes, orientação local e respeito à preferência de reduzir movimento. |

### Senhas comuns e senhas assistidas

- **Comum:** o titular pode utilizar a senha com o cofre desbloqueado, inclusive offline.
- **Assistida:** a revelação normal depende de um pedido online aprovado por um familiar autorizado.
- **Emergência offline:** preserva uma saída para falta de conexão, mas exige nova identidade e auditoria antes da revelação.

Criar ou ativar a proteção assistida exige internet, um familiar ativo com permissão **Pode aprovar acessos** e a permissão de localização em primeiro plano. Perder o vínculo não desprotege automaticamente uma senha existente.

## Acessibilidade e experiência

A interface foi pensada para Android e para pessoas que precisam de leitura clara, ações previsíveis e orientação sem excesso de informação.

- Fonte **Atkinson Hyperlegible**, texto base a partir de 16 px e leitura ajustável em 100%, 120% e 140%.
- Alvos de toque de pelo menos 56 px nos controles principais.
- Identidade visual em esmeralda e marfim, com acentos âmbar e coral.
- Estados identificados por **texto, ícone e cor**, não apenas pela cor.
- Contraste reforçado aplicado a campos, cartões, superfícies e navegação.
- Animações curtas, sem pulsos repetitivos e com respeito a **reduzir movimento**.
- Campos secretos com **Ver / Ocultar**, sem correção automática ou primeira letra maiúscula.
- Formulários que acompanham o teclado e telas roláveis para aparelhos pequenos.
- Navegação inferior com rótulos, área segura e espaço para fonte ampliada.
- Guias **Como funciona** e **Ajustar leitura** disponíveis também antes do login.
- Confirmações explícitas para exclusão, emergência, mudanças de proteção e recuperação.
- Retorno direto ao cofre após salvar, sem esperar a sincronização com o servidor.

A prévia web auxilia a inspeção visual, mas **não substitui o aplicativo Android nem a validação com TalkBack e pessoas idosas**.

## Tecnologias

| Camada | Tecnologias |
| --- | --- |
| **Organização** | Monorepo com pnpm 9, workspaces e Turborepo 2. |
| **Linguagem** | TypeScript. |
| **Aplicativo** | React Native 0.81.5, React 19.1, Expo SDK 54 e Expo Router 6. |
| **Estado e interface** | Zustand, TanStack React Query, React Native Reanimated e componentes acessíveis próprios. |
| **Armazenamento local** | Expo SQLite, Expo SecureStore e AsyncStorage para preferências não secretas. |
| **Criptografia** | AES-256-GCM, PBKDF2-HMAC-SHA256, pacote compartilhado de criptografia e provedor Android nativo com Quick Crypto / Nitro Modules. |
| **Proteção Android** | Android Keystore, módulo Expo local de credencial do aparelho e biometria forte. |
| **API** | NestJS 10, Fastify, validação de DTOs, JWT e Socket.IO. |
| **Banco do servidor** | PostgreSQL 16 e Prisma 5. |
| **Integrações** | Firebase Cloud Messaging, Gemini API, Expo Location e OpenStreetMap em WebView. |
| **Qualidade** | Jest, testes Node/tsx, SQLite em memória, testes PostgreSQL/HTTP, ESLint, TypeScript e GitHub Actions. |

As versões exatas e dependências estão nos manifestos de [API](apps/api/package.json), [mobile](apps/mobile/package.json), [criptografia](packages/crypto/package.json) e no [lockfile](pnpm-lock.yaml).

## Arquitetura

```mermaid
flowchart LR
  T["Titular no Android"] --> M["App React Native / Expo"]
  M --> K["Chave do cofre em memória"]
  M --> S["SecureStore / Android Keystore"]
  M --> L[("SQLite por conta<br/>Payloads sensíveis cifrados")]
  M -->|"Sincronização cifrada e operações autenticadas"| A["API NestJS / Fastify"]
  F["Familiar no Android"] -->|"Pedidos, decisões e avisos"| A
  A --> D[("PostgreSQL")]
  A --> W["Socket.IO"]
  A --> N["Firebase Cloud Messaging"]
  A -->|"Somente escolhas de geração"| G["Gemini API"]
  M -->|"Ponto e IP, após consentimento para o mapa"| O["OpenStreetMap"]
```

### Responsabilidades

1. **O aplicativo** cifra e decifra o conteúdo sensível, mantém o cofre local e aplica os fluxos de utilização e reautenticação.
2. **A API** autentica sessões, armazena payloads cifrados, coordena sincronização, familiares, aprovações, auditoria e notificações.
3. **O PostgreSQL** persiste contas, sessões, versões, pedidos, eventos e filas de entrega.
4. **O familiar** decide pedidos; não recebe material criptográfico para abrir o cofre.
5. **O Gemini** recomenda uma política de geração; os caracteres da senha são sorteados no celular.

A sincronização não sobrescreve alterações apenas pelo relógio do aparelho: utiliza versão base, identificador de operação e confirmação transacional. Conflitos precisam de uma decisão explícita.

## Estrutura do repositório

```text
SenhaFacil\
|-- apps\
|   |-- api\
|   |   |-- prisma\                 Modelos e migrations
|   |   |-- src\                    Módulos da API
|   |   `-- test\                   Testes da API
|   `-- mobile\
|       |-- assets\                 Ícones, splash e recursos visuais
|       |-- modules\
|       |   `-- device-credential\  Integração local com Android Keystore
|       |-- src\                    Rotas, componentes, stores e serviços
|       `-- test\                   Testes do aplicativo
|-- packages\
|   |-- crypto\                    Criptografia e geração compartilhadas
|   `-- types\                     Estrutura auxiliar para tipos compartilhados
|-- docs\                          Arquitetura, evidências e roteiro de release
|-- patches\                       Patches de dependências versionados
|-- .github\workflows\              Integração contínua
|-- .vscode\                       Tarefas locais do Windows
|-- docker-compose.yml             PostgreSQL de desenvolvimento
`-- pnpm-workspace.yaml            Definição dos workspaces
```

Os principais módulos da API estão em [apps/api/src](apps/api/src). As telas e serviços estão em [apps/mobile/src](apps/mobile/src), e a integração de bloqueio do aparelho em [device-credential](apps/mobile/modules/device-credential).

## Segurança

### Criptografia e proteção da chave

- **AES-256-GCM** cifra login, senha, site e notas no cliente.
- **PBKDF2-HMAC-SHA256**, com 600.000 iterações e salt aleatório, deriva a proteção baseada na senha mestra. No Android, o cálculo é nativo e assíncrono.
- A chave dos itens é separada da senha mestra. Trocar a mestra ou substituir o kit preserva essa chave e o conteúdo existente.
- Contas no protocolo atual utilizam uma **credencial de autenticação derivada**, separada da chave do cofre. A API armazena verificadores Argon2id.
- Chaves e bancos locais são separados por conta. Reiniciar o aplicativo restaura o estado bloqueado.
- Entrar em segundo plano ou ficar **dois minutos sem interação** bloqueia o cofre e descarta a chave carregada.
- Campos secretos são ocultados, há proteção de captura nas telas sensíveis e limpeza do conteúdo copiado. A política de clipboard tem limite de cinco minutos, sujeita à execução do processo e às limitações do histórico do próprio Android.

**O banco SQLite inteiro não é apresentado como cifrado:** os payloads sensíveis são cifrados; nomes, categorias, favoritos, versões e outros metadados necessários à interface permanecem legíveis. Perfil e auditoria também não são conteúdo secreto do cofre.

### Bloqueio do celular e biometria

O usuário pode ativar o bloqueio que já conhece no Android: **PIN, padrão ou senha do aparelho**. O aplicativo não cria outra senha curta nem chama toda credencial de PIN.

- Disponível a partir de **Android 11 / API 30**.
- Ativação por conta e aparelho, com senha mestra e confirmação nativa.
- Proteção real da chave com **AES-256-GCM no Android Keystore**, autenticada por operação e vinculada ao `CryptoObject`.
- Depois de ativado, o bloqueio do celular é a opção principal; biometria forte e senha mestra continuam disponíveis.
- Um diálogo visual isolado não libera a chave.
- Biometria é opcional. Reconhecimento facial simples não equivale a biometria forte compatível.
- Cancelamento ou indisponibilidade não desbloqueiam silenciosamente o cofre.

> **Aviso da ativação:** quem conhece o bloqueio do celular poderá abrir o cofre. Não compartilhe essa credencial se deseja manter essa proteção exclusiva.

Remover ou redefinir a credencial do Android pode invalidar a proteção local. Nesse caso, use a senha mestra e reative o recurso. Essa configuração não é transferida automaticamente para outro aparelho.

### Controles de atividade suspeita

| Situação | Comportamento |
| --- | --- |
| **5ª senha distinta em 60 segundos** | Exige nova identidade antes da revelação. Reabrir o mesmo item não soma outra senha distinta. |
| **10ª cópia de login/senha em 60 segundos** | Exige nova identidade antes da cópia. |
| **3ª exclusão distinta em 60 segundos** | Exige nova identidade antes da ação. A API também audita exclusões efetivamente confirmadas, sem contar retransmissões. |
| **Pedidos assistidos** | Até 5 novos pedidos por minuto por conta e 3 pendentes válidos. Repetir um pedido pendente reutiliza o existente. |
| **Login online incorreto** | Em 15 minutos: 3 falhas geram espera de 5 segundos; 5 falhas, 30 segundos; 8 falhas, até 2 minutos. |

A confirmação usa bloqueio do aparelho, biometria forte ou senha mestra, **reabrindo efetivamente a chave**. Após confirmar, há uma janela de continuidade de 60 segundos.

Esses controles não apagam senhas nem impõem bloqueio permanente. A emergência offline continua disponível mediante reautenticação e auditoria. A espera progressiva descrita acima é do **login online**, não um novo bloqueio da senha mestra offline.

### Avisos e sessões

Mudança de senha mestra, substituição do kit, recuperação, nova instalação, tentativas incomuns, volumes de ações e emergências correlacionadas geram avisos.

- O titular e familiares ativos com **Pode aprovar acessos** podem acompanhar os avisos.
- Os eventos não contêm senha, kit, site ou localização.
- A origem distingue **SERVER**, uma operação observada pela API, de **DEVICE_REPORT**, um relato do aplicativo.
- Instalações usam um UUID aleatório; a API armazena sua identificação como HMAC por conta, sem IMEI ou GPS.
- A fila de entrega é persistente, revalida destinatários e tenta novamente com espera progressiva. Avisos semelhantes podem agrupar notificações, mantendo os registros de auditoria.
- **Push não é garantia de recebimento.** Sem canal disponível, o aviso permanece consultável no aplicativo.
- A revisão de sessões permite encerrar outra sessão ou todas as outras, com confirmação da senha mestra e preservação da sessão atual.

Revogar uma sessão remove seu acesso online. **Não apaga cópias que outro aparelho já possui offline.**

### Recuperação

O kit de recuperação tem **256 bits** e deve ser guardado fora do aparelho, em local seguro. Recuperar a conta exige internet e um kit válido.

Gerar um kit novo invalida o anterior. Trocar apenas a senha mestra não significa gerar outro kit. Não existe um reset administrativo que recupere o conteúdo cifrado sem o material necessário.

## Privacidade e localização

### Dados e retenção

| Informação | Tratamento implementado |
| --- | --- |
| **Login, senha, site e notas** | Cifrados no cliente antes da sincronização. |
| **Perfil e metadados do cofre** | Legíveis para as operações autorizadas; não devem ser confundidos com conteúdo integralmente cifrado. |
| **Histórico de acessos na API** | Retenção de 365 dias, independentemente da retenção de coordenadas. |
| **Avisos de segurança na API** | Retenção de 90 dias após o registro no servidor. |
| **Posição sem retenção autorizada** | Removida ao resolver, cancelar ou expirar o pedido. |
| **Posição com retenção autorizada** | Até 30 dias a partir do envio do pedido, somente se aprovado ou negado. Cancelados e expirados sempre perdem o ponto. |

Apagamento na aplicação não comprova apagamento forense em backups, WAL, aparelhos offline ou registros de provedores. A infraestrutura publicada precisa de políticas próprias para esses dados.

### Localização pontual, não rastreamento

- A ativação assistida solicita permissão **em primeiro plano**, sem consultar GPS nessa etapa.
- Cada novo pedido online tenta obter **uma única posição**, com espera limitada a 12 segundos.
- Não há coleta de trajetos, rastreamento contínuo, serviço de localização em segundo plano ou GPS na emergência offline.
- Se uma senha já é assistida e a posição não estiver disponível, o pedido pode seguir com aviso.
- O titular decide, **por pedido e com a opção inicialmente desativada**, se deseja guardar o ponto no histórico por 30 dias.
- Repetir um pedido pendente não substitui o ponto, renova o prazo ou concede consentimento retroativo.
- O histórico carrega coordenadas somente sob demanda e revalida a autorização. As listagens e notificações não carregam coordenadas.

O mapa incorporado só abre após aviso e consentimento para enviar o ponto ao **OpenStreetMap**. O provedor também recebe o IP de quem abriu o mapa, mas não recebe nome, senha, JWT ou identificador do item pelo URL. A atribuição **© OpenStreetMap** e o acesso à licença são preservados.

A posição pode ser aproximada ou simulada: **não comprova identidade ou presença física**.

## Como usar o aplicativo

### Para o titular

1. Crie uma conta com e-mail ou celular brasileiro com DDD e nono dígito.
2. Escolha uma senha mestra e guarde o kit de recuperação fora do celular.
3. Ajuste leitura e contraste, se desejar.
4. Adicione senhas, organize categorias e marque favoritas.
5. Em **Minha conta**, ative opcionalmente o bloqueio do celular ou a biometria.
6. Em **Meus familiares**, convide a pessoa que poderá ajudar e configure suas permissões.
7. Ative acesso assistido apenas nas senhas em que deseja essa ajuda.
8. Consulte **Ver avisos de segurança** e **Revisar minhas sessões** quando necessário.

O identificador de entrada é imutável pelo formulário de perfil. O telefone de contato é separado: alterá-lo não muda o login.

### Para o familiar

1. Entre com uma conta de familiar e aceite o convite.
2. Com permissão para aprovar, acompanhe os pedidos recebidos.
3. Confira o contexto e, se houver ponto disponível, decida se deseja abrir o mapa.
4. Aprove ou negue o pedido.
5. Consulte o histórico permitido e os avisos de segurança.

A janela de acesso é de **dez minutos a partir do pedido**, não dez minutos depois da aprovação. Retenção de um ponto por 30 dias não amplia essa autorização.

## Preparação do ambiente

### Requisitos

- **Node.js:** 22.13 ou superior da linha 22, ou Node 24. Os testes SQLite do mobile utilizam recursos do Node.
- **pnpm:** linha 9; o manifesto fixa `pnpm@9.0.0`.
- **PostgreSQL 16**, ou Docker Desktop com o engine em execução.
- **Android:** aparelho ou emulador com development build compatível com Expo SDK 54. Bloqueio do celular exige Android 11+.
- **Para build nativo local:** Android SDK, Platform Tools e JDK compatível com o projeto Android.
- **Para builds EAS:** CLI EAS e autorização na conta/projeto Expo vinculado.

Os exemplos abaixo usam **PowerShell no Windows**, a partir da raiz do repositório.

### 1. Obter o projeto e instalar dependências

```powershell
git clone https://github.com/KauaAissa/SenhaFacil.git
Set-Location .\SenhaFacil
pnpm install --frozen-lockfile
```

Se o projeto já está instalado neste computador, use `D:\Development\SenhaFacil` e não repita clone ou instalação apenas para executá-lo.

### 2. Configurar os ambientes locais

Os exemplos são [apps/api/.env.example](apps/api/.env.example) e [apps/mobile/.env.example](apps/mobile/.env.example). Copie-os somente se os arquivos privados ainda não existirem:

```powershell
if (-not (Test-Path .\apps\api\.env)) {
  Copy-Item .\apps\api\.env.example .\apps\api\.env
}
if (-not (Test-Path .\apps\mobile\.env)) {
  Copy-Item .\apps\mobile\.env.example .\apps\mobile\.env
}
```

| Variável da API | Finalidade |
| --- | --- |
| `DATABASE_URL` | Conexão PostgreSQL. Use os dados do Compose apenas no desenvolvimento local. |
| `JWT_SECRET` | Segredo de assinatura, forte e exclusivo do ambiente. Substitua o valor ilustrativo do exemplo. |
| `JWT_EXPIRES_IN` | Duração do JWT; exemplo: `1h`. |
| `PORT` | Porta HTTP da API; padrão local: `3000`. |
| `NODE_ENV` | `development` local; `production` na infraestrutura publicada. |
| `ALLOWED_ORIGINS` | Origens web permitidas, separadas por vírgulas. |

Uma forma de gerar um segredo aleatório localmente é:

```powershell
node -e "console.log(require('node:crypto').randomBytes(64).toString('hex'))"
```

Guarde o resultado privadamente. Não o publique, envie pelo chat ou incorpore ao aplicativo.

No mobile, `EXPO_PUBLIC_API_URL` é o endereço da API. **Toda variável `EXPO_PUBLIC_*` é pública no bundle; nunca use esse prefixo para chaves ou credenciais.**

### 3. Subir o banco e aplicar migrations

```powershell
docker compose up -d --wait --wait-timeout 60 postgres
pnpm db:generate
pnpm db:deploy
```

Aguarde cada etapa e não prossiga se houver erro. O Compose sobe **somente PostgreSQL**, com volume persistente e porta 5432; não publica a API ou o aplicativo.

Em um banco existente, faça e valide um backup antes de atualizar migrations. `db:deploy` aplica migrations versionadas; `db:migrate` é destinado ao desenvolvimento de mudanças no schema.

### 4. Iniciar a API

```powershell
pnpm dev:api
```

Mantenha o terminal aberto. A API local usa a porta **3000**. Resposta `401` em uma rota protegida consultada sem autenticação é esperada.

## Execução no Android

### Importante: development build, não Expo Go

O aplicativo depende de módulos nativos de criptografia e proteção da chave. **Expo Go não atende ao cofre real.** É necessário instalar um development build e conectar o Metro, ou instalar um APK standalone de teste.

Alterações apenas em JavaScript normalmente usam recarga pelo Metro. Mudanças de dependências ou módulos nativos exigem um novo APK. Não reinstale ou limpe os dados para executar uma versão já instalada.

### Smartphone por USB no ambiente atual

1. Conecte um único aparelho, habilite **Depuração USB** e autorize este computador.
2. Instale o driver do fabricante, se necessário, e tenha o development build instalado.
3. Inicie Docker/PostgreSQL.
4. No VS Code, use **Tasks: Run Task** e execute:
   - **Senha Facil: API local (Windows)**;
   - **Senha Facil: Smartphone USB (Windows)**.
5. Abra o development client no celular e conecte ao Metro indicado no terminal.

As tarefas estão em [.vscode/tasks.json](.vscode/tasks.json). O perfil USB redireciona as portas 3000 e 8081 e configura localhost apenas no processo do Metro. Os caminhos específicos do ambiente atual, como SDK e temporários no D:, devem ser ajustados em outro computador.

Alternativa manual, em outro terminal na raiz do projeto, com a API já iniciada:

```powershell
& 'D:\sdks\platform-tools\adb.exe' -d reverse tcp:3000 tcp:3000
& 'D:\sdks\platform-tools\adb.exe' -d reverse tcp:8081 tcp:8081
$env:EXPO_PUBLIC_API_URL = 'http://127.0.0.1:3000'
$env:REACT_NATIVE_PACKAGER_HOSTNAME = '127.0.0.1'
pnpm --filter @senha-facil/mobile exec expo start --dev-client --localhost --max-workers 1 --port 8081
```

Confirme o sucesso dos redirecionamentos antes de iniciar o Metro. Eles podem precisar ser recriados após reconectar o aparelho.

### Emulador ou smartphone por Wi-Fi

| Destino | `EXPO_PUBLIC_API_URL` |
| --- | --- |
| Emulador Android padrão | `http://10.0.2.2:3000` |
| Smartphone por USB com `adb reverse` | `http://127.0.0.1:3000` |
| Smartphone na mesma rede Wi-Fi | `http://<IPv4-LAN-do-computador>:3000` |
| APK publicado | Endereço HTTPS público da API do ambiente. |

Para emulador, abra-o pelo Android Studio e utilize a tarefa **Senha Facil: Expo Android (Windows)**. Com um build instalado, a tecla **a** no terminal Metro pode abrir o aplicativo.

Para Wi-Fi, configure o IP LAN na API URL e, se necessário, em `REACT_NATIVE_PACKAGER_HOSTNAME`; inicie:

```powershell
pnpm dev:mobile:client
```

Não execute os perfis de emulador e smartphone ao mesmo tempo na porta 8081. HTTP local é destinado a testes com dados fictícios, não ao tráfego de produção.

### Encerrar sem perder os dados

Use **Ctrl+C** nos terminais da API e do Metro e, se desejar, pare o banco:

```powershell
docker compose stop postgres
```

Esse comando preserva o volume. Não remova volumes, desinstale o app ou resete o banco apenas para encerrar uma sessão.

## Integrações opcionais

### Gemini: ajuda guiada para gerar senhas

A ajuda de IA apresenta quatro etapas: uso da senha, símbolos, limite do site e consentimento/resumo. O usuário envia somente escolhas estruturadas, sem texto livre.

**Gemini não gera nem recebe a senha.** Recomenda tamanho e regras; API e mobile validam a resposta, e o celular sorteia os caracteres usando aleatoriedade criptográfica.

As três opções de geração são:

- **Caracteres aleatórios:** 12, 16, 20, 24 ou 32 caracteres, com padrão de 20.
- **Palavras fáceis de ler:** seis palavras portuguesas sorteadas no celular e dois dígitos, com símbolos opcionais. Não utiliza nomes, gostos ou datas pessoais; se o site não aceitar a senha longa, escolha caracteres, sem cortar as palavras.
- **Ajuda da IA:** recomenda uma política de 16, 20, 24, 32, 48 ou 64 caracteres, respeitando o limite informado e as regras de símbolos.

Não são enviados ao modelo nome, login, site, localização, identificador da conta, senha mestra, kit ou conteúdo do cofre. A explicação exibida é local e baseada em motivos permitidos.

Para habilitar:

1. Crie uma chave em [Google AI Studio](https://aistudio.google.com/).
2. Configure privadamente o ambiente da **API**, nunca o mobile:

```dotenv
AI_PASSWORD_ENABLED=true
GEMINI_API_KEY=<chave-configurada-privadamente>
GEMINI_PASSWORD_MODEL=gemini-3.5-flash-lite
AI_PASSWORD_DAILY_LIMIT=200
```

3. Confirme disponibilidade do modelo e cotas no seu projeto Google.
4. Reinicie a API. No aplicativo, abra **Adicionar senha → Ajuda da IA, passo a passo**.

A integração é desativada por padrão e não é necessária para o gerador offline. Erro, timeout, limite atingido ou resposta inválida são informados; uma regra local não é apresentada como se tivesse vindo da IA.

Limites implementados: **5 consultas/minuto e 20/dia por conta**, **2 chamadas externas simultâneas** e, por padrão, **200 tentativas/dia por processo da API**, em UTC.

> Os contadores da IA ficam em memória. Reiniciar ou multiplicar processos altera o limite efetivo. Eles não substituem cotas compartilhadas, limites financeiros ou controle de faturamento do provedor.

A consulta depende de consentimento explícito. Na modalidade gratuita, escolhas e respostas podem ser usadas para melhoria de produtos e revisão humana, conforme os [termos da Gemini API](https://ai.google.dev/gemini-api/terms).

Os modos de caracteres aleatórios e de palavras portuguesas aleatórias continuam locais e offline, sem nomes, gostos ou datas pessoais.

### Firebase Cloud Messaging

A integração está implementada, mas o recebimento real exige configuração externa e teste físico.

1. No Firebase, configure o aplicativo Android com o identificador **`com.senhafacil.app`**.
2. Obtenha o arquivo de configuração cliente e disponibilize-o como `google-services.json` na raiz, conforme a referência de [app.json](apps/mobile/app.json). Ele é necessário para compilar a configuração Android atual e está ignorado pelo Git; deve ser fornecido separadamente após clonar.
3. Para a API, configure `FIREBASE_PROJECT_ID` e, preferencialmente, `GOOGLE_APPLICATION_CREDENTIALS` apontando para um arquivo privado de conta de serviço **fora do repositório**.
4. Como alternativa de servidor, configure `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY` no ambiente privado, conforme o [exemplo da API](apps/api/.env.example).
5. Gere/instale o build correspondente, autorize notificações no aparelho e teste recebimento e abertura com dois usuários.

O arquivo cliente não substitui a credencial administrativa do servidor. Chaves privadas Firebase e Gemini nunca devem entrar no Git ou no bundle.

Notificações usam texto privado e genérico. Elas não carregam senha ou coordenadas. A indisponibilidade do push não substitui as consultas autenticadas de pedidos e avisos.

## Comandos e testes

Execute os comandos abaixo na raiz:

| Comando | Finalidade |
| --- | --- |
| `pnpm dev:api` | API em modo watch. |
| `pnpm dev:mobile:client` | Metro para development client. |
| `pnpm dev:mobile` | Expo padrão; não dispensa o build nativo necessário ao cofre. |
| `pnpm db:generate` | Gerar Prisma Client. |
| `pnpm db:deploy` | Aplicar migrations existentes. |
| `pnpm db:migrate` | Criar/aplicar migrations durante desenvolvimento do schema. |
| `pnpm db:studio` | Inspecionar o banco local com Prisma Studio. |
| `pnpm typecheck` | Checagem de tipos dos workspaces. |
| `pnpm lint` | Análise estática. |
| `pnpm test` | Suites dos workspaces. Integrações externas dependem de flags. |
| `pnpm test:crypto` | Suite do pacote de criptografia. |
| `pnpm build` | Compilar/exportar workspaces; não realizar deploy. |
| `pnpm --filter @senha-facil/api build` | Compilar a API. |
| `pnpm --filter @senha-facil/api start:prod` | Executar a API compilada; configure as variáveis e o banco antes. |
| `pnpm --filter @senha-facil/api db:deploy` | Aplicar migrations pelo workspace da API. |
| `pnpm --filter @senha-facil/mobile build:android:bundle` | Exportar o bundle Android; não gerar um APK/AAB. |

### Verificação habitual

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @senha-facil/mobile build:android:bundle
```

### Integração com PostgreSQL

Use um **banco exclusivo de testes**, nunca produção. Em um terminal dedicado, com PostgreSQL acessível e o banco `senha_facil_test` já criado:

```powershell
$env:DATABASE_URL = 'postgresql://senha_facil:senha_facil@localhost:5432/senha_facil_test?schema=public'
$env:INTEGRATION_TESTS = '1'
pnpm db:deploy
pnpm --filter @senha-facil/api exec jest --runInBand
```

As credenciais desse exemplo são apenas as do Compose local. Não prossiga para Jest se as migrations falharem. Feche o terminal de testes ao terminar para não reutilizar essas variáveis em outra execução.

Testes HTTP do protocolo de recuperação também existem no [pacote crypto](packages/crypto/test/protection.test.ts), são habilitados separadamente por `HTTP_TESTS` e devem apontar para uma API de teste autorizada.

### Evidências e alcance

Há testes de criptografia, isolamento de conta, ciclo de sessão, sincronização, conflitos, recuperação, permissões, localização, retenção e controles de atividade. Os testes mobile utilizam SQLite real em memória no Node; as integrações da API utilizam PostgreSQL e HTTP/JWT.

Na entrega dos controles de segurança, passaram **101 testes focados da API e 157 do mobile**, além de tipos, lint, build da API e export Android. Esses números são evidências dessa entrega, não uma promessa de cobertura total.

APKs de desenvolvimento foram executados em emulador e no **Galaxy A12 / Android 13**. Fixtures visuais e transportes FCM simulados não substituem biometria física, push real, TalkBack ou estudo de usabilidade. Veja as evidências datadas em [STATUS](docs/STATUS.md).

## DevOps, branches e ambientes

### Esteira atual de integração contínua

O workflow [Base Checks](.github/workflows/checks.yml) executa em push para `main`/`master`, pull requests e acionamento manual:

1. Checkout do código.
2. Preparação de pnpm e Node 22.
3. Instalação com lockfile congelado.
4. Inicialização de PostgreSQL 16 de CI.
5. Geração do Prisma Client e aplicação de migrations.
6. Checagem de tipos e lint.
7. Testes com integração PostgreSQL habilitada.
8. Export do bundle Android.
9. Build do container Linux da API, com Node 22 e Prisma Client gerado para essa plataforma.

**É uma esteira de CI, não um deploy automático.** Ela não hospeda a API, não publica na Play Store e não comprova testes físicos. O sucesso remoto precisa ser conferido no GitHub após o envio das alterações.

### Branches

A organização observada atualmente é **`main`**, com acompanhamento remoto **`origin/main`**. Não há GitFlow implantado nem branches permanentes de homologação demonstradas no repositório.

Para mudanças posteriores, uma prática recomendada é usar branches curtas, como `feature/...`, `fix/...` ou `docs/...`, e revisar via pull request antes de integrar à `main`. Isso é uma recomendação de evolução, não um histórico de branches já utilizadas.

### Ambientes e perfis

| Ambiente / perfil | Uso |
| --- | --- |
| **Desenvolvimento local** | PostgreSQL no Docker, API em watch, Metro e development client; configurações privadas locais. |
| **CI** | Banco temporário do workflow e execução automatizada de verificações. |
| **EAS development** | APK com development client, dependente do Metro para o desenvolvimento. |
| **EAS preview** | APK standalone para distribuição interna e homologação. |
| **EAS production** | Android App Bundle para a etapa de distribuição em loja. |

Os perfis EAS estão definidos em [eas.json](apps/mobile/eas.json), mas **não significam que três infraestruturas de backend já estejam publicadas**. Homologação e produção devem usar banco, segredos e URL próprios.

## Builds Android

### Desenvolvimento local

Com SDK/JDK configurados e a configuração Android Firebase disponível, o fluxo padrão de build nativo é:

```powershell
pnpm --filter @senha-facil/mobile exec expo run:android --device
```

Esse comando pode gerar o projeto nativo e compilar/instalar o aplicativo. No Windows, considere limites de caminhos e espaço para Gradle/CMake; o [roteiro de validação e release](docs/VALIDATION_AND_RELEASE.md) registra os cuidados e evidências do ambiente atual.

Para atualizações de uma instalação existente, preserve a assinatura e os dados. Não desinstale o app como atalho para corrigir incompatibilidade.

### Builds pelos perfis EAS

Com autorização no projeto Expo vinculado, execute a partir do diretório mobile:

```powershell
Set-Location .\apps\mobile
pnpm dlx eas-cli login
pnpm dlx eas-cli build --platform android --profile development
```

Para distribuição interna ou produção, escolha **um** dos perfis:

```powershell
pnpm dlx eas-cli build --platform android --profile preview
pnpm dlx eas-cli build --platform android --profile production
```

Esses comandos usam o serviço EAS. Custos, credenciais de assinatura e autorização devem ser verificados antes da execução.

- O perfil development atualmente usa a URL de API do emulador. Para o smartphone, configure o Metro conforme o modo de conexão.
- Preview e production precisam de `EXPO_PUBLIC_API_URL` definido para a API correta durante o build, por ambiente EAS ou configuração equivalente.
- APK standalone não depende do Metro, mas precisa de internet para operações online.
- Um AAB de production não é publicação automática na Play Store.
- Não embarque endereços locais ou credenciais administrativas em uma distribuição pública.

## Publicação e checklist de release

A funcionalidade desenvolvida e a operação em produção são etapas diferentes. Para disponibilizar o projeto:

### Pacote de API para Railway

O [Dockerfile](Dockerfile) na raiz empacota **somente a API**. A [.dockerignore](.dockerignore) restringe o contexto e exclui ambientes privados, dependências locais e credenciais; os arquivos de ambiente não são copiados para a imagem. Ela usa Node 22/Linux, OpenSSL, código compilado e usuário sem privilégios. O Prisma CLI permanece disponível para a etapa de migração.

Build local, na raiz:

```powershell
docker build --tag senha-facil-api:local .
```

No Railway, configure o serviço de API com:

| Configuração | Valor |
| --- | --- |
| Source | Repositório GitHub atualizado, branch escolhida para a entrega. |
| Root Directory | Raiz do repositório; não apontar apenas para o diretório da API. |
| Builder | Dockerfile detectado na raiz. |
| Start Command | Deixar sem override para utilizar o `CMD` da imagem. |
| Pre-Deploy Command | `node node_modules/prisma/build/index.js migrate deploy` |
| Pre-Deploy Timeout | 300 segundos como ponto inicial; ajustar com base na execução. |
| Healthcheck Path | `/health/ready` |
| Healthcheck Timeout | 300 segundos. |
| Replicas | Uma para a demonstração, com limites de recursos monitorados. |
| Serverless / Sleep | Desativado para não interromper os jobs e avisos em segundo plano. |

O comando de predeploy acima roda **dentro do container Linux**, na rede privada, com as variáveis do serviço. Se a migração falhar, o deploy deve ser interrompido, sem iniciar a API sobre um schema incompleto.

Configure `DATABASE_URL` por referência ao PostgreSQL do mesmo projeto, sem expor o banco publicamente. Use um banco de demonstração separado, sem resetar ou importar automaticamente o banco local. A versão testada localmente é PostgreSQL 16; confira a versão oferecida pelo template e valide a implantação efetiva.

Defina `NODE_ENV=production` e um `JWT_SECRET` privado de pelo menos 64 caracteres. Valores ilustrativos, banco ausente ou porta inválida impedem a inicialização explicitamente. Mantenha `TRUST_PROXY_HOPS` ausente até confirmar a cadeia de proxy; o recurso aceita somente um número limitado de hops, nunca confiança irrestrita em headers enviados pelo cliente. HTTP e WebSocket utilizam a mesma normalização de `ALLOWED_ORIGINS`.

- `/health/live`: confirma que o processo responde, sem consultar o banco.
- `/health/ready`: retorna `200` somente após uma consulta PostgreSQL bem-sucedida; falhas conhecidas do banco retornam `503`.
- Esses endpoints são públicos, `no-store`, não retornam dados da conta e mantêm o limite global de requisições.

Antes de criar serviços pagos, configure alerta e limite de **Compute Usage** no workspace Railway. O hard limit pode colocar os serviços offline; confira a margem antes da apresentação. Ele é um controle de consumo, não uma promessa de valor final com assinatura, impostos e outros provedores.

As configurações desta seção são feitas no painel. Não foi adicionado `railway.json`/`railway.toml`: Config as Code foi descontinuado para novos serviços; a alternativa atual é IaC ou dashboard.

### Checklist

- [ ] Definir infraestrutura da API e PostgreSQL, domínio, **HTTPS**, CORS e suporte a WebSocket.
- [ ] Separar homologação e produção, com segredos privados e bancos independentes.
- [ ] Gerar Prisma Client e aplicar migrations versionadas após backup validado; nunca usar reset como procedimento de atualização.
- [ ] Confirmar a CI remota com o código que será distribuído.
- [ ] Configurar Firebase e testar notificações reais: recebimento, toque, segundo plano e app encerrado, com titular e familiar.
- [ ] Validar os fluxos completos em aparelhos físicos: cadastro, login, bloqueio do aparelho, biometria, modo avião, recuperação, revogação, aprovações e falhas de rede.
- [ ] Validar TalkBack, fonte do sistema ampliada, reduzir movimento e uso por pessoas idosas.
- [ ] Definir verificação de posse de e-mail/celular e processo seguro para números reciclados ou mudança de identificador.
- [ ] Configurar monitoramento, tratamento de falhas, backup, ensaio de restauração e política de retenção da infraestrutura.
- [ ] Definir cotas compartilhadas e limites financeiros para Gemini, se a integração estiver ativa.
- [ ] Preparar política de privacidade, responsabilidades de tratamento de dados, licença e requisitos de distribuição.
- [ ] Configurar URL pública no app, versão/versionCode e assinatura; testar atualização preservando cofre e recuperação.
- [ ] Gerar o artefato apropriado, homologar e distribuir pelo canal escolhido.

Para compilar e executar a API fora do modo watch, com banco migrado e variáveis do ambiente já configuradas:

```powershell
pnpm --filter @senha-facil/api build
Set-Location .\apps\api
$env:NODE_ENV = 'production'
node .\dist\main.js
```

O comando inicia o processo da API; **não substitui hospedagem, supervisão do processo, proxy HTTPS, monitoramento ou publicação do banco**.

## Solução de problemas

| Situação | O que conferir |
| --- | --- |
| **Docker não conecta ao engine** | Abra Docker Desktop e aguarde ficar pronto antes de subir PostgreSQL. |
| **Porta 3000 ou 8081 ocupada** | Confira as tarefas/terminais existentes antes de iniciar outra instância. |
| **API indisponível no celular** | Confira API iniciada, URL correta e `adb reverse` ou IP LAN, conforme a conexão. |
| **Metro aponta para adaptador virtual** | Configure `REACT_NATIVE_PACKAGER_HOSTNAME` para o IP correto, ou utilize a tarefa USB. |
| **Erro de módulo nativo / Expo Go** | Use um APK compatível; recarga JavaScript não instala módulos nativos. |
| **Prisma não consegue substituir DLL no Windows** | Pare brevemente a API que está usando o Client, gere novamente e reinicie, sem resetar o banco. |
| **Biometria ou bloqueio indisponível** | Confira cadastro no Android, compatibilidade e ativação por conta; a senha mestra permanece alternativa. |
| **IA desativada ou com erro** | Confira as variáveis da API, autorização do modelo, cotas e conectividade. O gerador local continua independente. |
| **Notificação não chegou** | Confira Firebase, token/sessão, permissão do Android e ambiente. Consulte o aviso no app; push é best effort. |
| **Ponto não aparece no histórico** | É preciso consentimento no pedido, GPS válido, aprovação/negativa e prazo vigente. Pontos já apagados não são recuperados. |

Não reduza as iterações da criptografia, recrie contas, descarte o banco ou desative proteção para contornar um problema de ambiente.

## Limites do escopo

- **Android é o alvo principal.** Configuração iOS no projeto não equivale a publicação ou homologação iOS.
- **Web é prévia visual**, não um cliente seguro e homologado do cofre.
- O fluxo de aprovação é uma política do aplicativo: o titular já possui a chave local. Não é custódia criptográfica da chave pelo familiar nem resistência garantida a cliente adulterado.
- Relatos do aparelho e GPS não são provas independentes de fraude, identidade ou biometria.
- Contas legadas podem enviar a senha antiga uma vez durante a migração automática para o protocolo atual; não se afirma zero-knowledge estrito em todos os cenários.
- O projeto não envia SMS nem verifica atualmente a posse do e-mail/celular; recuperação por mensagem não está implementada.
- Não há garantia de resistência a root, captura por sistema comprometido ou apagamento forense de todas as cópias.
- Voz, rastreamento contínuo, chatbot aberto, consulta a vazamentos e autofill estão fora do escopo implementado.

## Documentação complementar

| Documento | Conteúdo |
| --- | --- |
| [Arquitetura](docs/ARCHITECTURE.md) | Contratos de criptografia, sessões, sincronização, recuperação, assistência e privacidade. |
| [Status e evidências](docs/STATUS.md) | Matriz de implementação, validações realizadas e verificações pendentes, com datas. |
| [Validação e release](docs/VALIDATION_AND_RELEASE.md) | Roteiros físicos, Firebase, atualização, migrations, builds e distribuição. |
| [Workflow de CI](.github/workflows/checks.yml) | Esteira automatizada existente. |
| [Tarefas Windows](.vscode/tasks.json) | Execução de API, emulador e smartphone por USB. |
| [Exemplo de ambiente da API](apps/api/.env.example) | Variáveis de banco, sessão, Firebase e Gemini, sem credenciais reais. |
| [Exemplo de ambiente mobile](apps/mobile/.env.example) | Configuração pública do endereço da API. |

Documentos acadêmicos e registros antigos podem descrever etapas anteriores. Para o estado técnico atual, consulte código, contratos e evidências datadas.

## Contribuição e licença

Para manter o projeto consistente:

1. Use o lockfile e as versões de ferramentas previstas.
2. Preserve os contratos criptográficos e a compatibilidade com cofres existentes.
3. Não remova reautenticação, auditoria ou consentimento como atalho de UX.
4. Atualize testes e documentação diretamente relacionados à mudança.
5. Não versione ambientes privados, chaves, contas de serviço ou credenciais de assinatura.

O repositório **ainda não contém uma licença de uso do projeto definida em arquivo LICENSE**. A licença deve ser escolhida antes de apresentar o código como software de livre reutilização.

Bibliotecas, fonte e serviços externos mantêm suas próprias licenças e termos. Os mapas preservam **© OpenStreetMap**, conforme a [licença e atribuição dos dados](https://www.openstreetmap.org/copyright).

---

**Senha Fácil: proteção que respeita a autonomia, com ajuda familiar sem compartilhamento de senhas.**
