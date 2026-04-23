"use client";

import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  moduleName?: string;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.props.onError?.(error, errorInfo);
    console.error(`[${this.props.moduleName ?? "App"}] Unhandled error:`, error.message, errorInfo.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "var(--danger-bg)" }}>
          <AlertTriangle className="w-7 h-7" style={{ color: "var(--danger)" }} aria-hidden="true" />
        </div>
        <h2 className="text-[16px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
          {this.props.moduleName ? `${this.props.moduleName} encountered an error` : "Something went wrong"}
        </h2>
        <p className="text-[13px] mb-1" style={{ color: "var(--text-secondary)" }}>
          {this.state.error?.message ?? "An unexpected error occurred."}
        </p>
        <p className="text-[11px] mb-4" style={{ color: "var(--text-muted)" }}>
          Try refreshing, or contact support if the problem persists.
        </p>
        <button
          type="button"
          onClick={this.handleReset}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold cursor-pointer border-none transition-colors"
          style={{ background: "var(--brand)", color: "#fff" }}
        >
          <RotateCcw className="w-4 h-4" aria-hidden="true" /> Try again
        </button>
      </div>
    );
  }
}
