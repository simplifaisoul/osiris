'use client';

import React from 'react';

interface Props {
  children: React.ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[OSIRIS] ${this.props.name || 'Component'} Error:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center w-full h-full bg-[var(--bg-secondary)] rounded-lg border border-red-900/30 p-4">
          <div className="text-center">
            <div className="text-xs font-mono text-red-400 tracking-widest mb-2">
              ⚠ {this.props.name?.toUpperCase() || 'COMPONENT'} ERROR
            </div>
            <div className="text-[10px] font-mono text-[var(--text-muted)] max-w-[300px] truncate">
              {this.state.error?.message}
            </div>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="mt-3 px-3 py-1 text-[9px] font-mono tracking-widest text-[var(--gold-primary)] border border-[var(--border-primary)] rounded hover:bg-[var(--hover-accent)] transition-colors"
            >
              RETRY
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
