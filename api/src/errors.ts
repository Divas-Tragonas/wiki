/* Errors amb codi estable (el tauler hi reacciona) i missatge en català (el tauler el pot ensenyar tal qual). */
export class ApiError extends Error {
  readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 500 | 503;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: ApiError['status'], code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what: string) => new ApiError(404, `${what}_not_found`, `No existeix (${what})`);
export const conflict = (code: string, message: string, details?: unknown) => new ApiError(409, code, message, details);
export const invalid = (code: string, message: string, details?: unknown) => new ApiError(422, code, message, details);
