import pino, { type Logger } from "pino";

export function createLogger(level: string): Logger {
  return pino({
    base: {
      service: "osiris-worldstate-collector",
      version: "0.1.0",
    },
    level,
    redact: {
      censor: "[REDACTED]",
      paths: [
        "databaseUrl",
        "databaseConfig.password",
        "DATABASE_URL",
        "PGPASSWORD",
        "authorization",
        "headers.authorization",
        "headers.cookie",
        "password",
        "token",
      ],
    },
  });
}
