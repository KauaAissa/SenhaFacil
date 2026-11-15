import { SecurityService } from '../src/security/security.service';

export function securityMock(): SecurityService {
  return {
    beforeLogin: jest.fn(async () => undefined), failedLogin: jest.fn(async () => undefined),
    clearLoginFailures: jest.fn(async () => undefined), device: jest.fn(async () => ({})),
    record: jest.fn(async () => undefined), reserveAccess: jest.fn(async () => undefined),
    accessLimitReached: jest.fn(async () => undefined), emergency: jest.fn(async () => undefined),
    observeDeletions: jest.fn(async () => undefined),
  } as unknown as SecurityService;
}
