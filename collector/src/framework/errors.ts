const URL_WITH_QUERY = /https?:\/\/[^\s?]+\?[^\s]+/giu;

export interface SafeError {
  code?: string;
  message: string;
  name: string;
}

function sanitizeMessage(message: string): string {
  return message.replace(URL_WITH_QUERY, "[URL REDACTED]").slice(0, 1_000);
}

export function toSafeError(error: unknown): SafeError {
  if (error instanceof Error) {
    const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
    return {
      ...(code === undefined ? {} : { code }),
      message: sanitizeMessage(error.message || "Unspecified error"),
      name: error.name || "Error",
    };
  }

  return {
    message: "Non-Error value thrown",
    name: "UnknownError",
  };
}
