export type ErrorDetail = { [key: string]: string };

export default abstract class RaidenError extends Error {
  code: string;
  details?: ErrorDetail[];

  constructor(message: string, detail?: ErrorDetail[] | ErrorDetail) {
    super(message || 'General Error');
    this.name = 'RaidenError';
    this.code = this.getCode(message);

    if (detail) {
      this.details = Array.isArray(detail) ? detail : [detail];
    }
  }

  addDetail(detail: ErrorDetail) {
    if (this.details) {
      this.details.push(detail);
    } else {
      this.details = [detail];
    }
  }

  abstract getCode(message: string): string;
}
