import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * The last line of defence around the whole page.
 *
 * React unmounts the entire tree on an uncaught render error, so one visit
 * document written half-way (a photo array that is not there yet, a missing
 * timestamp) would leave every visitor a blank white page with nothing to act
 * on. A reload is a real fix here: the site holds no state worth keeping, and
 * the bad document is usually complete a moment later.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('render failed', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    // Borrowing the load banner's chrome: it is the one styled box on the site
    // that is positioned, visible without the app around it, and already holds
    // a line of text next to an action.
    return (
      <div className="load-banner" role="alert">
        Something went wrong showing the journey.
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
