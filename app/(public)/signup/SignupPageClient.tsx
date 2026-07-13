"use client";

import { useEffect, useState } from "react";
import { SignupWizard } from "@/components/payment/SignupWizard";
import { Shield, Loader2 } from "lucide-react";

interface Plan {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  priceMonthlyDisplay: number;
  priceYearlyDisplay: number;
  currency: string;
  maxAccounts: number;
  maxSites: number;
  features: string[];
  trialDays: number;
  isPopular: boolean;
}

export function SignupPageClient() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPlans() {
      try {
        const response = await fetch("/api/signup/pricing");
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch plans");
        }

        setPlans(data.plans);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load pricing");
      } finally {
        setLoading(false);
      }
    }

    fetchPlans();
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--bg-base)]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--brand)] mx-auto mb-4" aria-hidden="true" />
          <p className="text-[var(--text-secondary)]">Loading plans...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--bg-base)]">
        <div className="text-center">
          <p className="text-[var(--danger)] mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="btn-primary">
            Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--bg-base)] py-8 px-4" id="main-content">
      {/* Header */}
      <header className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Shield className="w-8 h-8 text-[var(--brand)]" aria-hidden="true" />
          <span className="text-2xl font-bold text-[var(--text-primary)]">Glimmora Pharma</span>
        </div>
        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
          Create Your Account
        </h1>
        <p className="text-[var(--text-secondary)] max-w-md mx-auto">
          Start your GxP compliance journey with Glimmora Pharma. Set up your organization in minutes.
        </p>
      </header>

      {/* Signup Wizard */}
      <SignupWizard plans={plans} />

      {/* Footer */}
      <footer className="text-center mt-12 text-sm text-[var(--text-muted)]">
        <p>
          Already have an account?{" "}
          <a href="/login" className="text-[var(--brand)] hover:underline">
            Sign in
          </a>
        </p>
        <p className="mt-4">
          By signing up, you agree to our{" "}
          <a href="/terms" className="text-[var(--brand)] hover:underline">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="/privacy" className="text-[var(--brand)] hover:underline">
            Privacy Policy
          </a>
        </p>
      </footer>
    </main>
  );
}
