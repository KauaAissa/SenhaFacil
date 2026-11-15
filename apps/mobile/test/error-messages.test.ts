import { ApiError } from '../src/services/api.client';
import { apiErrorMessage, getErrorMessage, UserFacingError } from '../src/services/error-messages';
import { emailError } from '../src/services/input-validation';

test.each(['familiar@teste', 'nome', 'nome@', 'nome @exemplo.com', ''])('rejects incomplete email %s before making a request', (email) => {
  expect(emailError(email)).toContain('nome@exemplo.com');
});

test.each(['familiar@exemplo.com', 'nome+teste@exemplo.com.br', ' familiar@exemplo.com '])('accepts a complete email %s', (email) => {
  expect(emailError(email)).toBeNull();
});

test.each([
  [400, 'email must be an email', 'e-mail completo'],
  [409, 'Email already registered', 'já tem uma conta'],
  [404, 'No account found with this email', 'Peça ao familiar'],
  [400, 'Invited user must have the CAREGIVER role', 'familiar cuidador'],
  [400, 'Adicione um familiar ativo com permissao para aprovar acessos.', 'Pode aprovar acessos'],
  [400, 'Cannot respond: request is already APPROVED', 'encerrado'],
  [400, 'Permissions can only be changed for an active relationship', 'aceitar o convite'],
  [403, 'You do not have permission to respond to this access request', 'não tem permissão'],
  [401, 'Unauthorized', 'sessão online terminou'],
  [429, 'ThrottlerException: Too Many Requests', 'Aguarde um minuto'],
  [503, 'database connection failed at internal-host', 'serviço está indisponível'],
])('maps HTTP %s / %s without exposing technical response text', (status, message, expected) => {
  const error = new ApiError(status as number, JSON.stringify({ message }));
  expect(getErrorMessage(error)).toContain(expected as string);
  expect(error.message).not.toMatch(/HTTP \d|Exception|internal-host|must be|Unauthorized/);
});

test('deduplicates translated field validations and never displays HTML, SQL or arbitrary server text', () => {
  expect(apiErrorMessage(400, '{"message":["email must be an email","email must be an email"]}').split('\n')).toHaveLength(1);
  for (const body of ['<html>stack trace</html>', '{"message":"SELECT password FROM users"}', '{"message":{"secret":"fixture"}}']) {
    expect(apiErrorMessage(400, body)).toBe('Confira os dados preenchidos. Se estiverem corretos, atualize a tela e tente novamente.');
  }
});

test('authentication errors distinguish login from recovery and expired sessions', () => {
  expect(apiErrorMessage(401, '{}', '/auth/login')).toContain('e-mail/celular ou a senha');
  expect(apiErrorMessage(401, '{}', '/auth/recover')).toContain('kit de recuperação');
  expect(apiErrorMessage(401, '{}', '/vault')).toContain('sessão online terminou');
});

test('local and network errors are translated while unknown details remain hidden', () => {
  expect(getErrorMessage(new Error('KEY_NOT_LOADED'))).toContain('Desbloqueie');
  expect(getErrorMessage(new TypeError('Network request failed'))).toContain('internet');
  expect(getErrorMessage(new Error('ExpoSecureStore.default.setValueWithKeyAsync is not a function'))).toContain('armazenamento seguro');
  expect(getErrorMessage(new Error('private SQL statement'), 'Não foi possível salvar.')).toBe('Não foi possível salvar.');
  expect(getErrorMessage(new UserFacingError('Ação segura explicada.'))).toBe('Ação segura explicada.');
});
