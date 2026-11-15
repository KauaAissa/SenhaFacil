export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

const knownMessages: Record<string, string> = {
  SECURITY_LOGIN_WAIT: 'Foram feitas várias tentativas de entrada. Aguarde um pouco e tente novamente. A espera é temporária, de até dois minutos.',
  SECURITY_PENDING_LIMIT: 'Já há três pedidos aguardando resposta. Aguarde seu familiar ou cancele um pedido antes de enviar outro.',
  SECURITY_REQUEST_WAIT: 'Você enviou vários pedidos em pouco tempo. Aguarde um minuto para enviar um novo pedido.',
  SECURITY_REPORT_INVALID: 'Não foi possível validar um aviso deste aparelho. Confira a data do celular e tente sincronizar novamente.',
  SECURITY_REPORT_WAIT: 'O envio dos avisos está aguardando o limite de sincronização. Eles continuam neste aparelho e serão tentados novamente.',
  SECURITY_REPORT_RECEIPT_INVALID: 'O envio da auditoria não foi confirmado. Os avisos continuam neste aparelho para uma nova tentativa.',
  SECURITY_SESSION_SELECTION: 'Escolha outra sessão para encerrar. Para sair deste aparelho, use Sair da conta.',
  SECURITY_SESSION_UNAVAILABLE: 'Esta sessão não está mais disponível ou não pertence à sua conta. Atualize a lista.',
  HISTORY_LOCATION_UNAVAILABLE: 'Este ponto não está mais disponível ou você não tem permissão para consultá-lo. A localização só é guardada com autorização, por até 30 dias após o envio.',
  LOGIN_IDENTIFIER_INVALID: 'Informe um e-mail completo ou um celular brasileiro com DDD, como (11) 91234-5678.',
  LOGIN_IDENTIFIER_AMBIGUOUS: 'Escolha apenas um login: e-mail ou celular com DDD.',
  LOGIN_IDENTIFIER_REGISTERED: 'Este e-mail ou celular de entrada já tem uma conta. Use “Entrar” ou seu kit de recuperação.',
  LOGIN_CONTACT_NOT_FOUND: 'Não encontramos esse login de familiar. Confira o e-mail ou celular escolhido no cadastro e peça que ele crie uma conta para ajudar um familiar.',
  AI_PASSWORD_NOT_CONFIGURED: 'A ajuda da IA ainda não foi ativada no servidor. Use o gerador no aparelho; ele continua funcionando offline.',
  AI_PASSWORD_UNAVAILABLE: 'A ajuda da IA está indisponível agora. Tente mais tarde ou gere uma senha no aparelho.',
  AI_PASSWORD_PROVIDER_LIMIT: 'O serviço de IA atingiu seu limite de uso. Tente mais tarde ou use o gerador no aparelho.',
  AI_PASSWORD_DAILY_LIMIT: 'O limite diário da ajuda da IA foi atingido. Tente amanhã ou use o gerador no aparelho.',
  AI_PASSWORD_RATE_LIMIT: 'Aguarde um minuto antes de consultar a IA novamente. Você ainda pode gerar no aparelho.',
  AI_PASSWORD_BUSY: 'A IA já está atendendo uma consulta. Aguarde um pouco ou use o gerador no aparelho.',
  AI_PASSWORD_TIMEOUT: 'A IA demorou demais para responder. Nenhuma senha foi alterada. Tente novamente ou gere no aparelho.',
  AI_PASSWORD_INVALID_RESPONSE: 'A IA não retornou uma configuração segura e compatível. Nenhuma senha foi alterada. Use o gerador no aparelho ou tente novamente.',
  AI_PASSWORD_INVALID_PREFERENCES: 'Confira suas escolhas de tamanho e símbolos antes de consultar a IA.',
  DEVICE_AUTH_CANCELLED: 'O desbloqueio do aparelho foi cancelado. Tente novamente ou use sua senha mestra.',
  DEVICE_AUTH_LOCKED_OUT: 'O Android bloqueou novas tentativas por enquanto. Aguarde ou use sua senha mestra.',
  DEVICE_AUTH_NOT_CONFIGURED: 'Configure um PIN, padrão ou senha no bloqueio de tela do Android. Sua senha mestra continua disponível.',
  DEVICE_AUTH_KEY_INVALIDATED: 'A proteção do aparelho mudou. Use sua senha mestra e ative o bloqueio do aparelho novamente em Segurança.',
  DEVICE_AUTH_UNSUPPORTED: 'Esta opção exige Android 11 ou superior. Use sua senha mestra ou a biometria já ativada.',
  DEVICE_AUTH_FAILED: 'O Android não conseguiu abrir a chave com segurança. Tente novamente ou use sua senha mestra. Se continuar, reative a opção em Segurança.',
  'Email already registered': 'Este e-mail já tem uma conta. Use “Entrar” ou recupere sua senha mestra.',
  'E-mail ou telefone ja cadastrado.': 'Este e-mail ou telefone já está cadastrado. Confira os dados ou entre na sua conta.',
  'Telefone ja cadastrado.': 'Este telefone já está cadastrado em outra conta.',
  'No account found with this email': 'Não encontramos uma conta com esse e-mail. Peça ao familiar que crie uma conta antes do convite.',
  'You cannot invite yourself': 'Use o e-mail ou celular de entrada de outra pessoa para convidar um familiar.',
  'Invited user must have the CAREGIVER role': 'Essa conta não é de familiar cuidador. Convide uma conta criada para ajudar um familiar.',
  'Invite not found': 'Este convite não está mais disponível. Atualize a lista.',
  'Relationship not found': 'Este vínculo não está mais disponível. Atualize seus familiares.',
  'This invite does not belong to you': 'Este convite foi enviado para outra conta. Confira com qual e-mail você entrou.',
  'You are not part of this relationship': 'Sua conta não faz parte deste vínculo familiar.',
  'Relationship is already revoked': 'Este vínculo já foi encerrado. Atualize a lista.',
  'Permissions can only be changed for an active relationship': 'Espere o familiar aceitar o convite antes de alterar as permissões.',
  'O vinculo mudou. Atualize a lista.': 'O vínculo mudou em outro aparelho. Atualize a lista antes de continuar.',
  'Adicione um familiar ativo com permissao para aprovar acessos.': 'Para usar o acesso assistido, convide um familiar, aguarde o aceite e ative “Pode aprovar acessos” em “Meus familiares”.',
  'Vault item not found': 'Esta senha não foi encontrada. Volte ao cofre e atualize a lista.',
  'Senha nao encontrada.': 'Esta senha não foi encontrada. Volte ao cofre e atualize a lista.',
  'Senha ainda nao sincronizada.': 'Esta senha ainda não foi enviada. Atualize o cofre com internet e tente novamente.',
  'Access request not found': 'Este pedido não está mais disponível. Atualize a lista.',
  'Solicitacao nao encontrada.': 'Este pedido não está mais disponível. Atualize a lista.',
  'Access request has already expired': 'O prazo deste pedido terminou. Peça ao titular que envie uma nova solicitação.',
  'Localizacao antiga ou com horario invalido. Solicite acesso novamente.': 'A posição obtida não está recente. Envie o pedido novamente para tentarmos obter uma nova localização.',
  'A solicitacao foi respondida, expirou ou o vinculo foi revogado.': 'O pedido já foi encerrado ou o vínculo mudou. Atualize a lista para conferir.',
  'Pedido encerrado ou indisponivel para cancelamento.': 'O pedido já foi encerrado. Atualize a tela para conferir a resposta.',
  'You do not have permission to respond to this access request': 'Você não tem permissão para aprovar este pedido. O titular pode conferir isso em “Meus familiares”.',
  'Sem permissao para esta solicitacao.': 'Você não tem permissão para consultar este pedido.',
  'Esta senha nao requer aprovacao.': 'Esta senha não exige aprovação. Volte ao cofre e abra o item novamente.',
  'A aprovacao do familiar e necessaria.': 'Solicite a aprovação de um familiar antes de abrir esta senha.',
  'Aprovacao ausente ou expirada.': 'A autorização terminou ou não está válida. Solicite acesso novamente.',
  'Senha mestra incorreta.': 'A senha mestra não confere. Confira e tente novamente.',
  'Senha atual incorreta.': 'A senha mestra atual não confere. Confira e tente novamente.',
  'Senha incorreta.': 'A senha mestra não confere. Confira e tente novamente.',
  'Codigo de recuperacao invalido.': 'O código de recuperação não está válido. Confira todos os grupos do kit mais recente.',
  'Codigo de recuperacao ou conta invalidos.': 'O login ou o kit de recuperação não confere. Use o e-mail ou celular do cadastro e o kit mais recente desta conta.',
  'Esta conta ainda nao possui kit de recuperacao.': 'Esta conta ainda não tem um kit de recuperação. Se conseguir entrar, prepare um em Segurança.',
  'Sessao encerrada.': 'Sua sessão online terminou. Entre novamente para continuar.',
  'Sessao expirada. Entre novamente.': 'Sua sessão online terminou. Entre novamente para continuar.',
  'A seguranca da conta mudou. Entre novamente.': 'A segurança da conta mudou em outro aparelho. Entre novamente.',
  'A seguranca mudou em outro aparelho. Entre novamente.': 'A segurança da conta mudou em outro aparelho. Entre novamente antes de alterar os dados.',
  'Informe seu nome.': 'Informe seu nome antes de salvar.',
  'Data de nascimento invalida.': 'Confira a data de nascimento. Use uma data válida que não esteja no futuro.',
  'Cofre bloqueado.': 'Desbloqueie o cofre antes de continuar.',
  'Sessao indisponivel.': 'Sua sessão não está disponível. Entre novamente.',
  'Prepare o kit de recuperacao antes de trocar a senha.': 'Prepare seu kit de recuperação em Segurança antes de trocar a senha.',
  'Entre novamente com internet para preparar o acesso offline.': 'Entre com internet uma vez para preparar o desbloqueio offline.',
  'Use a aprovacao do familiar enquanto houver conexao.': 'Com internet, solicite a aprovação do familiar para abrir esta senha.',
  'A sessao ou a conexao mudou.': 'A conexão ou a sessão mudou. Abra a senha novamente para continuar com segurança.',
  'Aguarde a operacao atual.': 'Aguarde a operação atual terminar antes de tentar novamente.',
  'Conta excluida; falha na limpeza local.': 'Sua conta foi excluída, mas a limpeza deste aparelho não terminou. Feche o app e confira o armazenamento local.',
  SESSION_CHANGED: 'O cofre foi bloqueado ou a conta mudou. Desbloqueie e tente novamente.',
  SESSION_ACCOUNT_MISMATCH: 'A sessão online pertence a outra conta. Saia e entre novamente.',
  KEY_NOT_LOADED: 'Desbloqueie o cofre antes de continuar.',
  ENCRYPTION_KEY_NOT_FOUND: 'Prepare a biometria novamente em Segurança. Por enquanto, use sua senha mestra.',
  CONNECTIVITY_TIMEOUT: 'A conexão não voltou a tempo. Confira a internet e tente novamente.',
  INVALID_ENCRYPTED_PAYLOAD: 'Não foi possível abrir esta senha com segurança. Atualize o cofre e tente novamente.',
  INVALID_VAULT_ITEM: 'Não foi possível ler esta senha com segurança. Atualize o cofre e tente novamente.',
  SECURE_RANDOM_UNAVAILABLE: 'O aparelho não conseguiu gerar uma senha segura. Reinicie o aplicativo e tente novamente.',
};

function translate(message: string): string | undefined {
  if (Object.hasOwn(knownMessages, message)) return knownMessages[message];
  if (/^(caregiverEmail|email) must be an email$/.test(message)) return 'Informe um e-mail completo, como nome@exemplo.com.';
  if (/^name (must be longer than|must be shorter than)/.test(message)) return 'Use de 2 a 100 caracteres no nome.';
  if (/^surname must be shorter than/.test(message)) return 'Use até 100 caracteres no sobrenome.';
  if (/^phone /.test(message)) return 'Confira o telefone. Use o formato internacional, como +5511999999999.';
  if (/^dateOfBirth /.test(message)) return 'Confira a data de nascimento e use dia, mês e ano.';
  if (/^notes must be shorter than/.test(message)) return 'Escreva um motivo com até 500 caracteres.';
  if (/^A relationship with this caregiver already exists/.test(message)) return 'Este familiar já tem um convite ou vínculo com você. Confira a lista antes de convidar novamente.';
  if (/^Cannot accept: invite is already/.test(message)) return 'Este convite já foi aceito ou encerrado. Atualize a lista.';
  if (/^Cannot respond: request is already/.test(message)) return 'Este pedido já recebeu uma resposta ou foi encerrado. Atualize a lista.';
  if (message.includes('development build')) return 'Este recurso precisa do aplicativo Android instalado para desenvolvimento. Não use Expo Go nem o navegador.';
  return undefined;
}

export function apiErrorMessage(status: number, body: string, path = ''): string {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && 'message' in parsed && typeof parsed.message === 'string' &&
        parsed.message.startsWith('SECURITY_') && Object.hasOwn(knownMessages, parsed.message)) return knownMessages[parsed.message];
  } catch {
    // Proxies may not return the API error contract.
  }
  if (path.startsWith('/ai/password/') && status !== 401 && status !== 403) {
    try {
      const parsed: unknown = JSON.parse(body);
      if (parsed && typeof parsed === 'object' && 'message' in parsed && typeof parsed.message === 'string'
        && parsed.message.startsWith('AI_PASSWORD_') && Object.hasOwn(knownMessages, parsed.message)) {
        return knownMessages[parsed.message];
      }
    } catch {
      // Proxies may not return the API error contract.
    }
    if (status === 429) return 'Aguarde um pouco antes de consultar a IA novamente. O gerador no aparelho continua disponível.';
    if (status >= 500) return knownMessages.AI_PASSWORD_UNAVAILABLE;
  }
  if (status === 408 || status === 504) return 'A resposta demorou demais. Confira a conexão e tente novamente.';
  if (status >= 500) return 'O serviço está indisponível no momento. Aguarde um pouco e tente novamente.';
  if (status === 429) return 'Foram feitas muitas tentativas em pouco tempo. Aguarde um minuto antes de tentar novamente.';
  let messages: unknown = body;
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && 'message' in parsed) messages = parsed.message;
  } catch {
    // A proxy or network service can return a non-JSON response.
  }
  const translated = (Array.isArray(messages) ? messages : [messages])
    .filter((message): message is string => typeof message === 'string')
    .map(translate).filter((message): message is string => Boolean(message));
  if (translated.length) return [...new Set(translated)].join('\n');
  if (status === 401) {
    if (path === '/auth/login' || path === '/auth/parameters') return 'O e-mail/celular ou a senha mestra não confere. Use o login do cadastro e tente novamente.';
    if (path.startsWith('/auth/recover')) return 'O e-mail/celular ou o kit de recuperação não confere. Use o login do cadastro e o kit mais recente.';
    if (path === '/auth/security') return 'Confirme sua senha mestra. Se a sessão terminou, entre novamente.';
    return 'Sua sessão online terminou. Entre novamente para continuar.';
  }
  if (status === 403) return 'Sua conta não tem permissão para esta ação. Confira o vínculo e as permissões com o titular.';
  if (status === 404) return 'Não encontramos este registro. Atualize a lista e tente novamente.';
  if (status === 409) return 'Os dados mudaram ou já estão cadastrados. Atualize a tela e confira antes de tentar novamente.';
  if (status === 400 || status === 422) return 'Confira os dados preenchidos. Se estiverem corretos, atualize a tela e tente novamente.';
  return 'Não foi possível concluir agora. Tente novamente em alguns instantes.';
}

export function getErrorMessage(error: unknown, fallback = 'Não foi possível concluir. Tente novamente.'): string {
  if (error instanceof UserFacingError) return error.message;
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
    const translated = translate(error.code);
    if (translated) return translated;
  }
  if (error instanceof Error) {
    const translated = translate(error.message);
    if (translated) return translated;
    if (error.name === 'AbortError') return 'A operação foi interrompida. Confira a conexão e tente novamente.';
    if (/Network request failed|Failed to fetch|fetch failed|network lost/i.test(error.message)) return 'Não foi possível conectar. Confira a internet e tente novamente.';
    if (error.message.includes('ExpoSecureStore') || error.message.includes('SecureStore')) return 'O armazenamento seguro não está disponível. Use o aplicativo Android instalado e reinicie-o antes de tentar novamente.';
  }
  return fallback;
}
