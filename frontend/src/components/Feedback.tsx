/** Shared semantic feedback keeps initial loading and retryable errors accessible. */
export function LoadingState() {
  return (
    <div className="center-state" role="status">
      Opening your workspace…
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return (
    <section className="center-state" aria-labelledby="error-title">
      <h1 id="error-title">Unable to open your workspace</h1>
      <p role="alert">{message}</p>
      <button className="button primary" onClick={retry}>
        Try again
      </button>
    </section>
  );
}
