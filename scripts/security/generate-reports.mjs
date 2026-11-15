import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const runDirectory = process.env.SECURITY_RUN_DIR ?? 'D:/SenhaFacil-security/runs/2026-10-17';
const destination = path.join(root, 'docs/security/2026-10-17');
const rawSarif = await readFile(path.join(runDirectory, 'sast-devskim.sarif'), 'utf8');
const sarif = JSON.parse(rawSarif);
const dast = JSON.parse(await readFile(path.join(runDirectory, 'dast-results.json'), 'utf8'));
assert.equal(dast.completed, true, 'Do not publish an incomplete DAST execution');
assert.equal(dast.activeScan?.status, 'FINISHED');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const gitState = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const excluded = /(^|\/)(node_modules|dist|test|tests|docs|coverage|\.git|\.turbo|\.expo)(\/|$)|^scripts\/security\/|(^|\/)\.env|google-services\.json$|firebase-adminsdk|service-account|credentials\.json$|pnpm-lock\.yaml$/;
const sourceFiles = [...new Set(files)].filter((filename) => !excluded.test(filename) && /\.(?:[cm]?js|jsx|ts|tsx|json|ya?ml|sql|prisma|patch)$/.test(filename)).sort();
const manifest = [];
for (const filename of sourceFiles) {
  const contents = await readFile(path.join(root, filename));
  manifest.push({ path: filename, sha256: createHash('sha256').update(contents).digest('hex') });
}
const snapshotHash = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
const generatedAt = new Date().toISOString();
const sastAt = (await stat(path.join(runDirectory, 'sast-devskim.sarif'))).mtime.toISOString();
const findings = sarif.runs.flatMap((run) => run.results ?? []);
assert.equal(findings.length, 11, 'Review the SAST triage when scanner findings change');
const assessments = findings.map((finding) => {
  const location = finding.locations[0].physicalLocation;
  const filename = location.artifactLocation.uri.replaceAll('\\', '/');
  let assessment;
  let reason;
  if (finding.ruleId === 'DS172411') {
    assessment = 'Falso positivo para injecao';
    reason = 'Callback e uma funcao, nao uma string executavel controlada por usuario. O uso do timer nao demonstra injecao de codigo.';
  } else if (filename === '.github/workflows/checks.yml') {
    assessment = 'Falso positivo para producao';
    reason = 'Loopback e credencial ficticia pertencem ao servico PostgreSQL/ambiente da CI, nao a um endpoint publicado.';
  } else if (filename.endsWith('/vault/new.tsx')) {
    assessment = 'Falso positivo';
    reason = 'A URL HTTP esta em uma mensagem de validacao do site salvo no cofre. Nao e o transporte da API.';
  } else if (filename.endsWith('/eas.json')) {
    assessment = 'Informativo: desenvolvimento';
    reason = 'URL 10.0.2.2 esta somente no perfil development. Nao deve ser copiada para preview/production.';
  } else {
    assessment = 'Hardening pendente: media condicional';
    reason = 'Fallback da API aceita HTTP localhost se EXPO_PUBLIC_API_URL estiver ausente. Para distribuicao, exigir URL HTTPS e falhar com configuracao ausente/insegura.';
  }
  return { rule: finding.ruleId, level: finding.level, path: filename, line: location.region.startLine, assessment, reason };
});
const safeAlerts = (dast.alerts ?? []).map((alert) => ({
  pluginId: alert.pluginId, name: alert.alert, risk: alert.risk, confidence: alert.confidence,
  cwe: alert.cweid, url: alert.url, description: alert.description, solution: alert.solution,
  evidence: 'Valores e material de sessao omitidos; consultar tipo, URL e descricao do alerta.',
}));
assert.ok(safeAlerts.every((alert) => alert.pluginId === '10112' && alert.risk === 'Informational'), 'Review new ZAP findings before publishing this report template');
const publicDast = { ...dast, alerts: safeAlerts };
const publicSarif = JSON.parse(rawSarif, (key, value) => {
  if (typeof value !== 'string') return value;
  const sanitized = value.replaceAll(root, '').replaceAll(root.replaceAll('\\', '/'), '');
  return key === 'uri' ? sanitized.replaceAll('\\', '/') : sanitized;
});
const statusCounts = {};
for (const message of dast.zapTraffic ?? []) statusCounts[message.status] = (statusCounts[message.status] ?? 0) + 1;
const identity = [
  `Data de emissao (UTC): ${generatedAt}.`,
  `Commit de referencia: ${commit}. A arvore possui alteracoes locais nao commitadas; o alvo NAO e apenas o conteudo desse commit.`,
  `Snapshot de ${manifest.length} arquivos de codigo/configuracao inventariados: SHA-256 ${snapshotHash}. O inventario nao comprova que cada regra da ferramenta se aplica a cada linguagem.`,
  'Responsavel pela execucao: auditoria automatizada local assistida por GitHub Copilot. Relatorio tecnico interno, nao certificacao independente.',
];
const sastSections = [
  { title: 'Identificacao', paragraphs: identity },
  { title: 'Ferramentas Utilizadas', table: { headers: ['Ferramenta', 'Versao', 'Finalidade nesta analise'], rows: [
    ['Microsoft DevSkim CLI', '1.0.100+ea92e6f3cc', 'Scanner SAST: regras padrao para identificar padroes potencialmente inseguros no codigo e gerar resultados SARIF. Pacote oficial Microsoft.CST.DevSkim.CLI.'],
    ['Microsoft .NET Runtime', '8.0.32', 'Runtime portatil utilizado para executar o DevSkim; nao e um scanner adicional.'],
    ['Node.js', '24.15.0', 'Scripts de consolidacao, sanitizacao dos resultados e calculo dos hashes SHA-256; nao e um scanner SAST.'],
  ] }, paragraphs: ['Semgrep e MobSF nao foram executados nesta auditoria. Os achados estaticos automatizados deste relatorio foram produzidos pelo DevSkim e revisados conforme a triagem documentada abaixo.'] },
  { title: 'Resumo Executivo', paragraphs: [
    'Analise SAST executada com Microsoft DevSkim 1.0.100+ea92e6f3cc, regras padrao, sobre codigo e configuracao do monorepo. Artefato produzido em ' + sastAt + '.',
    'Foram emitidos 11 alertas: 2 warnings e 9 notes. A revisao classificou 9 como falsos positivos no contexto avaliado, 1 como informativo de desenvolvimento e 1 como recomendacao de hardening condicional. Nenhuma exploracao critica ou alta foi confirmada neste escopo.',
    'A observacao adicional sobre PostgreSQL abaixo veio de revisao de configuracao, nao de um alerta DevSkim. Resultado sem achados criticos nao significa ausencia de vulnerabilidades.',
  ] },
  { title: 'Escopo e Metodo', bullets: [
    'Codigo TypeScript/JavaScript da API, aplicativo React Native e pacotes compartilhados, alem de configuracoes/SQL reconhecidas pela ferramenta.',
    'Excluidos: node_modules, dist, testes, docs, scripts da auditoria, caches, credenciais, arquivos .env, google-services.json, lockfile e DOCX. Nenhum arquivo privado foi enviado para terceiros.',
    'DevSkim usa regras de padroes; nao substitui analise interprocedural de fluxo de dados, revisao criptografica ou SCA de dependencias.',
    'Analise do codigo gerenciado, nao do APK/binarios nativos. MobSF, reverse engineering, jailbreak/root e instrumentacao Android nao foram executados.',
  ] },
  { title: 'Alertas e Revisao', table: { headers: ['Regra / Nivel', 'Local', 'Classificacao', 'Justificativa'], rows: assessments.map((entry) => [
    `${entry.rule} / ${entry.level}`, `${entry.path}:${entry.line}`, entry.assessment, entry.reason,
  ]) } },
  { title: 'Recomendacoes Priorizadas', table: { headers: ['ID', 'Prioridade', 'Evidencia / Contexto', 'Acao'], rows: [
    ['SAST-H01', 'Media condicional; antes de release', 'apps/mobile/src/services/api.client.ts:12 permite fallback HTTP. O perfil development usa HTTP de forma intencional.', 'Exigir EXPO_PUBLIC_API_URL HTTPS no release, sem fallback silencioso. Validar o bundle antes da distribuicao. Nao foi demonstrada interceptacao ou producao exposta.'],
    ['SAST-H02', 'Media condicional; revisao manual adicional', 'docker-compose.yml publica 5432:5432 e tem credencial padrao de desenvolvimento. Docker confirmou bind em todas as interfaces.', 'Restringir bind local a 127.0.0.1 e usar credenciais/controles proprios na infraestrutura. Acessibilidade externa depende de firewall/rede e nao foi testada.'],
  ] } },
  { title: 'Reproducao', paragraphs: [
    'Usar a distribuicao oficial NuGet Microsoft.CST.DevSkim.CLI 1.0.100 com .NET 8.0.32. Comando executado (prefixo portatil do executavel omitido):',
  ], code: 'devskim analyze -I . -O sast-devskim.sarif -f sarif --skip-excerpts --ignore-globs "**/node_modules/**,**/.git/**,**/dist/**,**/test/**,**/tests/**,**/docs/**,**/scripts/security/**,**/.turbo/**,**/.expo/**,**/coverage/**,**/.env*,**/google-services.json,**/*firebase-adminsdk*.json,**/service-account*.json,**/credentials.json,**/*.docx,**/pnpm-lock.yaml" --disable-console' },
  { title: 'Conclusao e Limites', paragraphs: [
    'Os alertas foram preservados em SARIF, inclusive os falsos positivos, sem supressoes no codigo de negocio. As recomendacoes nao foram corrigidas durante a auditoria para nao alterar o alvo analisado.',
    'Necessarios antes de producao: TLS/configuracao de release, revisao de infraestrutura e segredos, SCA, revisao do protocolo criptografico e validacao Android. O scanner nao prova zero-knowledge nem garante seguranca completa.',
    'Referencias: https://github.com/microsoft/DevSkim e https://github.com/microsoft/DevSkim/wiki/Analyze-Command.',
  ] },
];
const dastSections = [
  { title: 'Identificacao', paragraphs: [...identity, `Execucao DAST (UTC): ${dast.startedAt} a ${dast.finishedAt}.`] },
  { title: 'Ferramentas Utilizadas', table: { headers: ['Ferramenta', 'Versao', 'Finalidade nesta analise'], rows: [
    ['OWASP ZAP', '2.17.0', 'Proxy e scanner DAST: analise passiva do trafego exercitado e varredura ativa limitada de SQL Injection e XSS refletido, conforme a cobertura descrita neste relatorio.'],
    ['Node.js', '24.15.0', 'Execucao do script run-dast.mjs com 43 verificacoes HTTP dirigidas, incluindo autenticacao, autorizacao e isolamento entre contas. Essas verificacoes complementam o ZAP.'],
    ['Eclipse Temurin OpenJDK', '21.0.12.1+1', 'Runtime Java utilizado para executar o ZAP; nao e um scanner adicional.'],
    ['Docker Engine', '29.7.2', 'Isolamento do PostgreSQL descartavel utilizado como apoio aos testes, sem acessar o banco atual da aplicacao.'],
    ['PostgreSQL', '16-alpine (tag da imagem)', 'Banco de teste separado para dados ficticios; nao e uma ferramenta de deteccao de vulnerabilidades.'],
  ] }, paragraphs: ['MobSF e DAST nativo Android nao foram executados. A analise dinamica deste relatorio se restringe a API local isolada e aos cenarios documentados abaixo.'] },
  { title: 'Resumo Executivo', paragraphs: [
    `OWASP ZAP ${dast.zapVersion}, com verificacoes HTTP autenticadas em Node.js. ${dast.checks.length} verificacoes de fluxo/seguranca (incluindo preparacao e controles positivos): ${dast.passed} aprovadas e ${dast.failed} reprovadas.`,
    `ZAP gerou ${safeAlerts.length} alerta(s), somente informativo(s) de gerenciamento de sessao. Nao reportou SQL injection ou XSS no alvo ativo limitado. Nenhuma vulnerabilidade critica, alta ou media foi confirmada nesta execucao.`,
    'Isso nao e um pentest completo nem evidencia de ausencia de falhas em rotas ou cenarios nao exercitados.',
  ] },
  { title: 'Ambiente e Protecao dos Dados', bullets: [
    'API recompilada do codigo atual em diretorio separado no D:, NODE_ENV=production, porta 3101. A API de desenvolvimento na porta 3000 nao foi alvo.',
    'PostgreSQL 16-alpine descartavel, porta 127.0.0.1:5433, banco security_test, oito migrations aplicadas e nenhum volume persistente. Banco atual na porta 5432 nao foi alvo.',
    'Tres contas ficticias por execucao: titular, cuidador e terceiro sem vinculo. Credencial JWT exclusiva da auditoria, Firebase desativado e nenhum push real enviado.',
    'ZAP acessivel apenas em 127.0.0.1:8091, com chave de API aleatoria. Logs/sessoes brutos permanecem no D:; estes documentos nao incluem JWT, refresh token, senha ou chave privada.',
    'Servicos temporarios encerrados apos a execucao; container descartavel removido no encerramento da auditoria. Nenhuma limpeza de dados ou alteracao nas contas dos emuladores.',
  ] },
  { title: 'Cobertura', bullets: [
    'JWT ausente, malformado e revogado; controles de papel; isolamento/IDOR em leitura, edicao e exclusao; vinculos e permissoes; aprovacao, decisao repetida e revogacao.',
    'Parametros objeto/SQL, mass assignment, chave __proto__, cursor invalido, CORS de origem nao autorizada, headers, exposicao .env/.git, TRACE, erros e limitacao de requisicoes.',
    'ZAP passivo no trafego exercitado e ativo somente em /access/history/page?cursor=<fixture>, com JWT do titular e regras 40018 (SQL Injection) e 40012 (XSS refletido).',
    'Varredura ativa com um worker, atraso de 1500 ms, limite global de dois minutos e limite por regra de um minuto. Validacao do cursor retornou 400 para entradas invalidas. Limitacao evita carga excessiva; nao equivale a varrer toda a API.',
  ] },
  { title: 'Resultados das Verificacoes', table: { headers: ['Verificacao', 'Metodo / Rota', 'Esperado', 'Obtido', 'Resultado'], rows: dast.checks.map((entry) => [
    entry.title, `${entry.method} ${entry.path}`, entry.expected.join('/'), String(entry.actual), entry.passed ? 'PASS' : 'FAIL',
  ]) } },
  { title: 'Alertas ZAP e Triagem', table: { headers: ['Plugin', 'Alerta', 'Risco / Confianca', 'Interpretacao'], rows: safeAlerts.map((alert) => [
    alert.pluginId, alert.name, `${alert.risk} / ${alert.confidence}`, 'Identifica token na resposta de cadastro. Comportamento esperado de uma API JWT; o proprio ZAP classifica como informativo, nao vulnerabilidade. Valores de sessao omitidos.',
  ]) } },
  { title: 'Evidencia de Trafego', paragraphs: [
    `${dast.zapTraffic.length} mensagens registradas pelo ZAP no ponto de coleta, antes da sondagem final de rate limit. Distribuicao de status registrados: ${JSON.stringify(statusCounts)}. Status 0 significa registro sem status numerico de resposta, nao um HTTP de sucesso.`,
    'A sondagem final de rate limit e contabilizada separadamente nos checks e trafego dirigido; confirmou HTTP 429 sem desativar ou elevar limites da API.',
  ] },
  { title: 'Reproducao', paragraphs: [
    'Requer ferramentas oficiais locais no D:, Java 21, PostgreSQL descartavel no nome/porta definidos e migrations aplicadas SOMENTE no banco security_test. Nunca apontar os scripts para producao.',
    'Iniciador verifica banco/porta exclusivos; o runner inicia/encerra API e ZAP. Para repetir, provisionar um novo container descartavel, compilar API no diretorio da execucao e executar:',
  ], code: 'pnpm --filter @senha-facil/crypto exec tsx ../../scripts/security/run-dast.mjs\nnode scripts/security/generate-reports.mjs' },
  { title: 'Limites e Pendencias', bullets: [
    'HTTP local intencional: TLS, certificados, reverse proxy, DNS e infraestrutura de producao nao avaliados.',
    'Nao houve DAST nativo Android, MobSF, biometria real, captura de tela, clipboard com processo encerrado, TalkBack, interceptacao de rede do aparelho ou teste de APK atualizado.',
    'WebSocket, transporte FCM real, recuperacao/troca de senha, concorrencia, negação/expiracao temporizada e todas as combinacoes de endpoints nao foram cobertos por este DAST. Testes anteriores do projeto nao foram contados como parte desta execucao.',
    'Testes locais e direcionados; falhas de logica, criptografia, dependencias e caminhos nao percorridos exigem revisao adicional. Nao e certificacao de conformidade LGPD/OWASP.',
    'Referencia: https://www.zaproxy.org/docs/desktop/cmdline/.',
  ] },
];

const escapeHtml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const escapeCell = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
function markdown(title, sections) {
  return `# ${title}\n\n` + sections.map((section) => {
    let text = `## ${section.title}\n\n`;
    if (section.paragraphs) text += section.paragraphs.join('\n\n') + '\n\n';
    if (section.bullets) text += section.bullets.map((entry) => '- ' + entry).join('\n') + '\n\n';
    if (section.code) text += '```text\n' + section.code + '\n```\n\n';
    if (section.table) text += '| ' + section.table.headers.join(' | ') + ' |\n| ' + section.table.headers.map(() => '---').join(' | ') + ' |\n' + section.table.rows.map((row) => '| ' + row.map(escapeCell).join(' | ') + ' |').join('\n') + '\n\n';
    return text;
  }).join('');
}
function html(title, sections) {
  const content = sections.map((section) => `<section><h2>${escapeHtml(section.title)}</h2>` +
    (section.paragraphs ?? []).map((entry) => `<p>${escapeHtml(entry)}</p>`).join('') +
    (section.bullets ? '<ul>' + section.bullets.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('') + '</ul>' : '') +
    (section.code ? `<pre>${escapeHtml(section.code)}</pre>` : '') +
    (section.table ? `<div class="table"><table><thead><tr>${section.table.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${section.table.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '') + '</section>').join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(title)}</title><style>body{margin:0;color:#202827;background:#f2f5f4;font:16px/1.6 'Segoe UI',sans-serif}main{max-width:1120px;margin:0 auto;padding:40px 24px;background:white}header{border-bottom:4px solid #237053;padding-bottom:18px}h1,h2{font-family:Georgia,serif;line-height:1.25;color:#174c3c}h1{font-size:32px}h2{font-size:23px;margin-top:32px}p,li,td{overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #b8c8c1;text-align:left;padding:9px;vertical-align:top}th{background:#e8f1ed}tr:nth-child(even){background:#f6f8f7}.table{overflow-x:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eef2f1;padding:16px;font-size:13px}footer{border-top:1px solid #b8c8c1;margin-top:32px;padding-top:12px;color:#53635d}@media print{body{background:white;font-size:11pt}main{max-width:none;padding:0}h1{font-size:24pt}h2{font-size:16pt;break-after:avoid}tr{break-inside:avoid}th{display:table-cell}.table{overflow:visible}table{font-size:8pt}pre{font-size:8pt}}@media(max-width:600px){main{padding:24px 14px}h1{font-size:27px}}</style></head><body><main><header><p>Senha Facil | Auditoria tecnica interna | 17/10/2026</p><h1>${escapeHtml(title)}</h1></header>${content}<footer>Resultados limitados ao alvo, versao e cenarios descritos. Nenhuma certificacao ou garantia de ausencia de vulnerabilidades.</footer></main></body></html>\n`;
}

await mkdir(destination, { recursive: true });
const artifacts = {
  'RELATORIO-SAST.md': markdown('Relatorio SAST - Senha Facil', sastSections),
  'RELATORIO-SAST.html': html('Relatorio SAST - Senha Facil', sastSections),
  'RELATORIO-DAST.md': markdown('Relatorio DAST - Senha Facil', dastSections),
  'RELATORIO-DAST.html': html('Relatorio DAST - Senha Facil', dastSections),
  'sast-devskim.sarif': JSON.stringify(publicSarif, null, 2),
  'dast-evidencias.json': JSON.stringify(publicDast, null, 2),
  'snapshot-codigo.json': JSON.stringify({ generatedAt, commit, dirty: Boolean(gitState.trim()), snapshotHash, files: manifest }, null, 2),
};
const hashes = [];
for (const [filename, contents] of Object.entries(artifacts)) {
  assert.ok(!/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/.test(contents), `JWT material must not be published in ${filename}`);
  assert.ok(!contents.includes('BEGIN PRIVATE KEY'), 'Private keys must never be published');
  await writeFile(path.join(destination, filename), contents);
  hashes.push({ file: filename, sha256: createHash('sha256').update(contents).digest('hex') });
}
await writeFile(path.join(destination, 'integridade.json'), JSON.stringify({ generatedAt, artifacts: hashes }, null, 2));
console.log(`Reports generated: ${destination}`);
console.log(`SAST: ${findings.length} alerts; DAST: ${dast.passed}/${dast.checks.length} checks passed; ${safeAlerts.length} ZAP informational alert(s).`);