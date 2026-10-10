module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  moduleNameMapper: { '^@senha-facil/crypto$': '<rootDir>/../../packages/crypto/src/index.ts' },
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs', target: 'ES2022' } }] },
};