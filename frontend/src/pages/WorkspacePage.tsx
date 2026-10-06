/** M1's real authenticated home: identity and access, with no fake library/program data. */
import { useSession } from '../features/auth/SessionProvider';

export function WorkspacePage() {
  const { user } = useSession();
  return (
    <>
      <p className="eyebrow">Your team, in harmony</p>
      <h1 className="page-title">
        Welcome, <span dir="auto">{user?.username}</span>.
      </h1>
      <p className="page-intro">A shared space for thoughtful music planning.</p>
      <section className="welcome-workspace" aria-labelledby="workspace-title">
        <div className="workspace-emblem" aria-hidden="true">
          ♫
        </div>
        <div>
          <h2 id="workspace-title">You're connected to your team.</h2>
          <p>
            Your hymn library is ready. Browse your team's repertoire and keep its classifications
            up to date. Mass planning tools will follow in the next increment.
          </p>
        </div>
      </section>
      <p>
        <a className="button primary" href="/hymns">
          Open hymn library
        </a>
      </p>
      <section className="access-card" aria-labelledby="access-title">
        <p className="eyebrow">Account</p>
        <h2 id="access-title">Your workspace access</h2>
        <dl>
          <div>
            <dt>Username</dt>
            <dd dir="auto">{user?.username}</dd>
          </div>
          <div>
            <dt>Access</dt>
            <dd>{user?.role}</dd>
          </div>
        </dl>
        <p className="muted">Your team coordinator manages account access.</p>
      </section>
    </>
  );
}
