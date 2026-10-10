# Matriz de Desenvolvimento

Estado desta entrega de 2026-10-10. "Em codigo" nao significa aprovado para producao. Mocks, export Hermes e checagem de tipos nao comprovam um fluxo nativo completo.

| Item | Entrega Atual | Verificacao Ainda Necessaria |
| --- | --- | --- |
| 1. Execucao/criptografia | SDK 54, crypto portatil, interoperabilidade AES-GCM | Runtime Android e desempenho PBKDF2 |
| 2. Ambiente | Scripts, env examples, Compose PostgreSQL; banco iniciado e migrations aplicadas | Configuracao de ambientes externos |
| 3. Development build | Perfil EAS APK com cliente nativo | Vinculo EAS, assinatura, geracao e instalacao |
| 4. Isolamento | SQLite/chaves por conta; legado importado apenas se a chave autentica o payload | Atualizacao com banco legado real, multiplas contas/aparelhos |
| 5. Desbloqueio offline | Perfil em SecureStore, restaura bloqueado, senha/biometria local | Reinicio em modo aviao, cancelamento e mudanca de biometria |
| 6. Sincronizacao | Versoes, receipts idempotentes, tombstones, conflitos, aliases atomicos; PostgreSQL passou | Rede instavel e multiplos aparelhos reais |
| 7. Bloqueio automatico | Background e dois minutos sem toque; destruicao da chave em memoria | Ciclo AppState/biometria/screen capture no Android |
| 8. Revelacao autorizada | Lista so com metadados; facade consulta aprovacao antes da descriptografia | Aprovar/negar/expirar/revogar com dois atores fisicos |
| 9. Autenticacao | Rotacao refresh, sessoes revogaveis, throttling global, WS validado | Separacao master/autenticacao; resposta perdida na rotacao; limites reais de polling |
| 10. Contatos | Convites, aceite/rejeicao, revogacao, permissao explicita de aprovacao | Concorrencia de convites/permissoes e testes funcionais |
| 11. Acesso assistido | Atualizacao condicional, polling, estado/historico; corrida de cuidadores passou em PostgreSQL | Atores fisicos; cancelamento de pedido ainda pendente |
| 12. Emergencia | Reautenticacao local, fila antes da revelacao, envio idempotente | Biometria real e notificacao especifica de emergencia ao familiar |
| 13. Historico | Metadados autorizados, ultimos 100, retencao resolvida 365 dias | Paginacao e evidencia com atores reais |
| 14. Cofre | Criar/editar/excluir, copy/clipboard 30s, limpeza no bloqueio | Fluxos de tela, teclado e historico de clipboard do sistema |
| 15. Organizacao | Busca por nome, categoria, favoritos, decisao explicita de conflito | Interface em aparelhos pequenos e fonte ampliada |
| 16. Push | Token por sessao, aparelhos ativos, limpeza invalidos, toque verificado, texto privado | Firebase externo adiado; permissao/refresh/encerrado/background em build fisico |
| 17. Recuperacao | Nao implementada | Envelope de chave, segredo de recuperacao, troca atomica e novo aparelho sem perda |
| 18. Gerador/assistente local | Gerador CSPRNG, grupos/limites e aviso de senha curta | Ampliar recomendacoes locais sem prometer deteccao de vazamentos |
| 19. Perfil | Nome/sobrenome/telefone/nascimento opcionais editaveis; migracao aplicada | Formularios nativos |
| 20. Acessibilidade | Primeiro acesso por conta, fonte 100/120/140%, contraste, controles acessiveis | TalkBack, fonte do sistema ampliada, idosos participantes |
| 21. Privacidade | Exclusao/cascatas/anonimizacao testadas em PostgreSQL; retencao, captura, sem backup/permissao de armazenamento Android | Limpeza/captura no aparelho, backups e revisao LGPD |
| 22. Qualidade/CI | ESLint, testes API/mobile/crypto, CI PostgreSQL/migrations/export | Confirmar execucao no GitHub; integracao HTTP e testes nativos |
| 23. Testes fisicos | Roteiro em VALIDATION_AND_RELEASE | Participantes, aparelhos Android e resultados reais |
| 24. Distribuicao | Perfis development/preview APK e production AAB; roteiro operacional | Assets, EAS/FCM/HTTPS/assinatura/monitoramento/backups; nenhum APK/AAB produzido |
| 25. Documento academico | Diagramas/contratos em ARCHITECTURE | DOCX original preservado; inserir evidencias anonimas apos testes reais |

## Evidencias Automatizadas

- Crypto: 15 testes passaram.
- API: 24 testes unitarios e 3 de integracao PostgreSQL passaram; 27 no total.
- Mobile: 27 testes passaram, incluindo SQLite real em memoria, chaves/offline, lifecycle, clipboard, acessibilidade, legado/aliases/conflitos.
- Total: 69 testes passaram. `pnpm typecheck` passou nos quatro pacotes; lint, export Android e diagnosticos finais passaram.
- Quatro novas migrations aplicadas no PostgreSQL existente, sem resetar volume; cinco migrations no total incluindo a inicial.
- Nenhum teste fisico foi registrado; CI remota ainda nao executada nesta entrega.
- Smoke HTTP local passou: cadastro/perfil, isolamento/idempotencia do cofre, convite/aceite/permissao/aprovacao/revogacao, refresh e logout. Duas contas ficticias criadas para ele foram removidas ao final.

## Bloqueios de Publicacao

1. Confirmar CI remota e ampliar validacao de dados existentes/rede/aparelhos; banco/migrations, integracao PostgreSQL e smoke HTTP local ja passaram.
2. Implementar recuperacao/troca de senha e separar a autenticacao da senha/chave do cofre. A API atual pode derivar a chave se observar a senha de entrada.
3. Validar ciclo nativo, autorizacao, acessibilidade, migracao e exclusao em aparelhos reais com contas ficticias.
4. Vincular Firebase/EAS com o usuario e configurar HTTPS, secrets, backups/retencao e monitoramento.
5. Fechar demais riscos da matriz, produzir artefatos e registrar evidencias verdadeiras antes de declarar o app pronto.