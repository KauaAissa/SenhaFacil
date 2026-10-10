import { passwordAdvice } from '../src/services/password-advice.service';

test('local advice detects sequences and personal information without claiming breach detection', () => {
  expect(passwordAdvice('')).toBeNull();
  expect(passwordAdvice('12345678')!.score).toBeLessThan(3);
  expect(passwordAdvice('senha123456')!.score).toBeLessThan(3);
  expect(passwordAdvice('Maria1950', ['Maria'])!.score).toBeLessThan(3);
  const strong = passwordAdvice('H7q!9Xm2$vL6#Rp4');
  expect(strong!.score).toBeGreaterThanOrEqual(3);
  expect(strong!.advice).toContain('nao detecta');
});