export interface HttpConfiguration {
  port: number;
  trustProxy: false | number;
  origins: string[];
}

export function getAllowedOrigins(environment: NodeJS.ProcessEnv = process.env): string[] {
  return environment.ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? [];
}

export function getHttpConfiguration(environment: NodeJS.ProcessEnv): HttpConfiguration {
  const value = environment.PORT ?? '3000';
  const port = Number(value);
  if (!/^\d+$/.test(value) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  let trustProxy: false | number = false;
  if (environment.TRUST_PROXY_HOPS !== undefined) {
    if (!/^[1-5]$/.test(environment.TRUST_PROXY_HOPS)) {
      throw new Error('TRUST_PROXY_HOPS must be an integer between 1 and 5, or remain unset');
    }
    trustProxy = Number(environment.TRUST_PROXY_HOPS);
  }

  if (environment.NODE_ENV === 'production') {
    const secret = environment.JWT_SECRET;
    if (!secret || secret.length < 64 || secret.startsWith('change-me')) {
      throw new Error('Configure a private JWT_SECRET of at least 64 characters for production');
    }
    if (!environment.DATABASE_URL || !/^postgres(?:ql)?:\/\/\S+$/.test(environment.DATABASE_URL)) {
      throw new Error('Configure a PostgreSQL DATABASE_URL for production');
    }
  }

  return { port, trustProxy, origins: getAllowedOrigins(environment) };
}
