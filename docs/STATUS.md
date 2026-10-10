# Matriz de Desenvolvimento

Estado desta entrega de 2026-10-10. "Em codigo" nao significa aprovado para producao. Mocks, export Hermes e checagem de tipos nao comprovam um fluxo nativo completo.

| Item | Entrega Atual | Verificacao Ainda Necessaria |
| --- | --- | --- |
| 1. Execucao/criptografia | SDK 54, interoperabilidade AES-GCM e provedor PBKDF2 nativo assincrono | Fluxo completo no development build Android; Expo Go rejeita senha explicitamente |
| 2. Ambiente | Scripts, env examples, Compose PostgreSQL; banco iniciado e migrations aplicadas | Configuracao de ambientes externos |
| 3. Development build | Projeto EAS vinculado, APK assinado instalado/aberto no emulador; PBKDF2 nativo verificado | Login da conta existente e fluxos completos no emulador/aparelho |
| 4. Isolamento | SQLite/chaves por conta; legado importado apenas se a chave autentica o payload | Atualizacao com banco legado real, multiplas contas/aparelhos |
| 5. Desbloqueio offline | Perfil em SecureStore, restaura bloqueado, senha/biometria local; nao aguarda perfil/JWT online | Reinicio em modo aviao, cancelamento e mudanca de biometria |
| 6. Sincronizacao | Versoes, receipts idempotentes, tombstones, conflitos, aliases atomicos; PostgreSQL passou | Rede instavel e multiplos aparelhos reais |
| 7. Bloqueio automatico | Background e dois minutos sem toque; destruicao da chave em memoria | Ciclo AppState/biometria/screen capture no Android |
| 8. Revelacao autorizada | Lista so com metadados; facade consulta aprovacao antes da descriptografia | Aprovar/negar/expirar/revogar com dois atores fisicos |
| 9. Autenticacao | Credencial v2 separada, migracao automatica, refresh com diario local e retry idempotente por 60s, sessoes/WS revogaveis | Rede real, janela de retry excedida e desempenho PBKDF2; legado envia a senha antiga uma vez |
| 10. Contatos | Convites/reconvites serializaveis, aceite/revogacao/permissoes condicionais, conflitos HTTP 409 | Fluxos funcionais em aparelhos; corridas passaram no PostgreSQL |
| 11. Acesso assistido | Decisao e cancelamento condicionais, polling, estado/historico; um vencedor nas corridas | Atores fisicos e cancelamento durante perda de rede |
| 12. Emergencia | Reautenticacao, fila antes da revelacao, envio idempotente e aviso privado ao familiar | Biometria e FCM reais; push continua best effort |
| 13. Historico | Paginas de 30 com cursor e desempate por ID, carregar mais, metadados autorizados, retencao 365 dias | Evidencia com atores reais e muitos registros |
| 14. Cofre | Criar/editar/excluir, copy/clipboard 30s, limpeza no bloqueio | Fluxos de tela, teclado e historico de clipboard do sistema |
| 15. Organizacao | Busca por nome, categoria, favoritos, decisao explicita de conflito | Interface em aparelhos pequenos e fonte ampliada |
| 16. Push | Token por sessao, aparelhos ativos, limpeza invalidos, toque verificado, texto privado | Firebase externo adiado; permissao/refresh/encerrado/background em build fisico |
| 17. Recuperacao | DEK preservada, envelopes AES-GCM, kit 256 bits, troca atomica/CAS, revogacao, rotacao do kit e telas completas | Novo aparelho fisico, queda entre etapas, guarda do kit e migracao com dados reais |
| 18. Gerador/assistente local | Gerador CSPRNG e zxcvbn com dicionario brasileiro, dados pessoais e recomendacoes locais | Desempenho no aparelho; nao consulta nem promete detectar vazamentos |
| 19. Perfil | Nome/sobrenome/telefone/nascimento opcionais editaveis; migracao aplicada | Formularios nativos |
| 20. Acessibilidade | Atkinson Hyperlegible, 100/120/140%, contraste, botoes/switches de 56px, animacao com reduzir movimento, teclado/scroll e navegacao revisados | TalkBack, fonte do sistema ampliada e idosos participantes |
| 21. Privacidade | Exclusao/cascatas/anonimizacao testadas em PostgreSQL; retencao, captura, sem backup/permissao de armazenamento Android | Limpeza/captura no aparelho, backups e revisao LGPD |
| 22. Qualidade/CI | 95 testes com PostgreSQL e HTTP opt-in, flags propagadas e testes sem cache Turbo, lint/tipos/export; CI PostgreSQL/migrations/export | Confirmar execucao remota e testes nativos; smoke HTTP exige API de teste em execucao |
| 23. Testes fisicos | Roteiro em VALIDATION_AND_RELEASE | Participantes, aparelhos Android e resultados reais |
| 24. Distribuicao | Perfis EAS, APK development assinado, icone/adaptive/splash/notificacao PNG e roteiro operacional | FCM/HTTPS/monitoramento/backups e validacao de release; nenhum AAB/publicacao |
| 25. Documento academico | Diagramas/contratos em ARCHITECTURE | DOCX original preservado; inserir evidencias anonimas apos testes reais |

## Evidencias Automatizadas

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