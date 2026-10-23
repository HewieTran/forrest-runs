// Expected request failures are safe to show without exposing another account's data.
export class TrainingRequestError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409) {
    super(message);
    this.name = 'TrainingRequestError';
  }
}
