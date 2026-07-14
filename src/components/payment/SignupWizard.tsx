"use client";

/**
 * SignupWizard - Multi-step signup form with Razorpay integration.
 *
 * Steps:
 * 1. Company & Admin details
 * 2. Plan review
 * 3. Payment
 * 4. Success
 */

import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Building2,
  User,
  Mail,
  Lock,
  Phone,
  Globe,
  Check,
  ArrowRight,
  ArrowLeft,
  CreditCard,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { useRazorpayCheckout, type RazorpayResponse } from "./RazorpayCheckout";

// Form schemas
const companySchema = z.object({
  companyName: z.string().min(2, "Company name must be at least 2 characters"),
  customerCode: z
    .string()
    .min(3, "Customer code must be at least 3 characters")
    .max(20, "Customer code must be at most 20 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Only letters, numbers, hyphens and underscores"),
  adminName: z.string().min(2, "Name must be at least 2 characters"),
  adminEmail: z.string().email("Invalid email address"),
  adminUsername: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers and underscores"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain uppercase letter")
    .regex(/[a-z]/, "Must contain lowercase letter")
    .regex(/[0-9]/, "Must contain number"),
  confirmPassword: z.string(),
  phone: z.string().optional(),
  timezone: z.string().default("Asia/Kolkata"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type CompanyFormData = z.infer<typeof companySchema>;

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

interface SignupWizardProps {
  plans: Plan[];
  onComplete?: () => void;
}

type Step = "company" | "plan" | "payment" | "success";

export function SignupWizard({ plans, onComplete }: SignupWizardProps) {
  const [step, setStep] = useState<Step>("company");
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(
    plans.find((p) => p.isPopular) ?? plans[0] ?? null
  );
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("yearly");
  const [signupId, setSignupId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdAccount, setCreatedAccount] = useState<{
    email: string;
    username: string;
  } | null>(null);

  const { openCheckout } = useRazorpayCheckout();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CompanyFormData>({
    resolver: zodResolver(companySchema) as never,
    defaultValues: {
      timezone: "Asia/Kolkata",
    },
  });

  // Step 1: Submit company details
  const onCompanySubmit = useCallback(
    async (data: CompanyFormData) => {
      if (!selectedPlan) {
        setError("Please select a plan");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/signup/initiate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...data,
            planId: selectedPlan.id,
            billingCycle,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to initiate signup");
        }

        setSignupId(result.signupId);
        setStep("plan");
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setIsLoading(false);
      }
    },
    [selectedPlan, billingCycle]
  );

  // Step 2: Proceed to payment
  const proceedToPayment = useCallback(async () => {
    if (!signupId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/signup/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signupId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to create order");
      }

      setStep("payment");

      // Open Razorpay checkout
      openCheckout({
        orderId: result.orderId,
        amount: result.amount,
        currency: result.currency,
        keyId: result.keyId,
        name: "Glimmora Pharma",
        description: `${selectedPlan?.displayName} - ${billingCycle === "yearly" ? "Annual" : "Monthly"} Subscription`,
        prefill: result.prefill,
        notes: result.notes,
        onSuccess: handlePaymentSuccess,
        onError: (err) => setError(err.message),
        onDismiss: () => setStep("plan"),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsLoading(false);
    }
  }, [signupId, selectedPlan, billingCycle, openCheckout]);

  // Handle payment success
  const handlePaymentSuccess = useCallback(
    async (response: RazorpayResponse) => {
      setIsLoading(true);
      setError(null);

      try {
        const verifyResponse = await fetch("/api/signup/verify-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signupId,
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          }),
        });

        const result = await verifyResponse.json();

        if (!verifyResponse.ok) {
          throw new Error(result.error || "Payment verification failed");
        }

        setCreatedAccount({
          email: result.tenant.email,
          username: result.tenant.username,
        });
        setStep("success");
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        setStep("plan");
      } finally {
        setIsLoading(false);
      }
    },
    [signupId]
  );

  const price = selectedPlan
    ? billingCycle === "yearly"
      ? selectedPlan.priceYearlyDisplay
      : selectedPlan.priceMonthlyDisplay
    : 0;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress Steps */}
      <nav aria-label="Signup progress" className="mb-8">
        <ol className="flex items-center justify-center gap-2" role="list">
          {["company", "plan", "payment", "success"].map((s, i) => {
            const isCurrent = s === step;
            const isComplete =
              (s === "company" && ["plan", "payment", "success"].includes(step)) ||
              (s === "plan" && ["payment", "success"].includes(step)) ||
              (s === "payment" && step === "success");

            return (
              <li key={s} className="flex items-center">
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                    isComplete
                      ? "bg-green-500 text-white"
                      : isCurrent
                        ? "bg-[var(--brand)] text-white"
                        : "bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--bg-border)]"
                  }`}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {isComplete ? (
                    <Check className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    i + 1
                  )}
                </div>
                {i < 3 && (
                  <div
                    className={`w-12 h-0.5 mx-1 ${
                      isComplete ? "bg-green-500" : "bg-[var(--bg-border)]"
                    }`}
                    aria-hidden="true"
                  />
                )}
              </li>
            );
          })}
        </ol>
        <div className="flex justify-center mt-2">
          <span className="text-sm text-[var(--text-secondary)]">
            {step === "company" && "Company Details"}
            {step === "plan" && "Review Plan"}
            {step === "payment" && "Payment"}
            {step === "success" && "Complete"}
          </span>
        </div>
      </nav>

      {/* Error Display */}
      {error && (
        <div
          role="alert"
          className="mb-6 p-4 rounded-lg bg-[var(--danger-bg)] border border-[var(--danger)] flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 text-[var(--danger)] flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-[var(--danger)]">{error}</p>
        </div>
      )}

      {/* Step 1: Company Details */}
      {step === "company" && (
        <form onSubmit={handleSubmit(onCompanySubmit)} className="space-y-6">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title flex items-center gap-2">
                <Building2 className="w-5 h-5" aria-hidden="true" />
                Company Information
              </h2>
            </div>
            <div className="card-body space-y-4">
              <div>
                <label htmlFor="companyName" className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  Company Name <span className="text-[var(--danger)]">*</span>
                </label>
                <input
                  id="companyName"
                  type="text"
                  {...register("companyName")}
                  className="input"
                  placeholder="Acme Pharmaceuticals"
                  aria-required="true"
                  aria-invalid={!!errors.companyName}
                />
                {errors.companyName && (
                  <p className="mt-1 text-xs text-[var(--danger)]">{errors.companyName.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="customerCode" className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  Customer Code <span className="text-[var(--danger)]">*</span>
                </label>
                <input
                  id="customerCode"
                  type="text"
                  {...register("customerCode")}
                  className="input"
                  placeholder="acme-pharma"
                  aria-required="true"
                  aria-invalid={!!errors.customerCode}
                  aria-describedby="customerCode-hint"
                />
                <p id="customerCode-hint" className="mt-1 text-xs text-[var(--text-muted)]">
                  Unique identifier for your organization
                </p>
                {errors.customerCode && (
                  <p className="mt-1 text-xs text-[var(--danger)]">{errors.customerCode.message}</p>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title flex items-center gap-2">
                <User className="w-5 h-5" aria-hidden="true" />
                Admin Account
              </h2>
            </div>
            <div className="card-body space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="adminName" className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Full Name <span className="text-[var(--danger)]">*</span>
                  </label>
                  <input
                    id="adminName"
                    type="text"
                    {...register("adminName")}
                    className="input"
                    placeholder="John Doe"
                    aria-required="true"
                    aria-invalid={!!errors.adminName}
                  />
                  {errors.adminName && (
                    <p className="mt-1 text-xs text-[var(--danger)]">{errors.adminName.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="adminUsername" className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Username <span className="text-[var(--danger)]">*</span>
                  </label>
                  <input
                    id="adminUsername"
                    type="text"
                    {...register("adminUsername")}
                    className="input"
                    placeholder="johndoe"
                    aria-required="true"
                    aria-invalid={!!errors.adminUsername}
                  />
                  {errors.adminUsername && (
                    <p className="mt-1 text-xs text-[var(--danger)]">{errors.adminUsername.message}</p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="adminEmail" className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  Email Address <span className="text-[var(--danger)]">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" aria-hidden="true" />
                  <input
                    id="adminEmail"
                    type="email"
                    {...register("adminEmail")}
                    className="input pl-10"
                    placeholder="john@acme.com"
                    aria-required="true"
                    aria-invalid={!!errors.adminEmail}
                  />
                </div>
                {errors.adminEmail && (
                  <p className="mt-1 text-xs text-[var(--danger)]">{errors.adminEmail.message}</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Password <span className="text-[var(--danger)]">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" aria-hidden="true" />
                    <input
                      id="password"
                      type="password"
                      {...register("password")}
                      className="input pl-10"
                      placeholder="Min 8 characters"
                      aria-required="true"
                      aria-invalid={!!errors.password}
                    />
                  </div>
                  {errors.password && (
                    <p className="mt-1 text-xs text-[var(--danger)]">{errors.password.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Confirm Password <span className="text-[var(--danger)]">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" aria-hidden="true" />
                    <input
                      id="confirmPassword"
                      type="password"
                      {...register("confirmPassword")}
                      className="input pl-10"
                      placeholder="Confirm password"
                      aria-required="true"
                      aria-invalid={!!errors.confirmPassword}
                    />
                  </div>
                  {errors.confirmPassword && (
                    <p className="mt-1 text-xs text-[var(--danger)]">{errors.confirmPassword.message}</p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" aria-hidden="true" />
                  <input
                    id="phone"
                    type="tel"
                    {...register("phone")}
                    className="input pl-10"
                    placeholder="+91 98765 43210"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="timezone" className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  Timezone
                </label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" aria-hidden="true" />
                  <select id="timezone" {...register("timezone")} className="select pl-10">
                    <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                    <option value="America/New_York">America/New_York (EST)</option>
                    <option value="Europe/London">Europe/London (GMT)</option>
                    <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Plan Selection */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Select Plan</h2>
              <div className="flex items-center gap-2 bg-[var(--bg-elevated)] rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => setBillingCycle("monthly")}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    billingCycle === "monthly"
                      ? "bg-[var(--brand)] text-white"
                      : "text-[var(--text-secondary)]"
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle("yearly")}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    billingCycle === "yearly"
                      ? "bg-[var(--brand)] text-white"
                      : "text-[var(--text-secondary)]"
                  }`}
                >
                  Yearly
                  <span className="ml-1 text-xs text-green-400">Save 20%</span>
                </button>
              </div>
            </div>
            <div className="card-body">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" role="radiogroup" aria-label="Subscription plans">
                {plans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    role="radio"
                    aria-checked={selectedPlan?.id === plan.id}
                    onClick={() => setSelectedPlan(plan)}
                    className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                      selectedPlan?.id === plan.id
                        ? "border-[var(--brand)] bg-[var(--brand-muted)]"
                        : "border-[var(--bg-border)] hover:border-[var(--brand-border)]"
                    }`}
                  >
                    {plan.isPopular && (
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 text-xs font-semibold bg-[var(--brand)] text-white rounded-full">
                        Popular
                      </span>
                    )}
                    <h3 className="font-semibold text-[var(--text-primary)]">{plan.displayName}</h3>
                    <p className="text-2xl font-bold text-[var(--text-primary)] mt-2">
                      {plan.currency === "INR" ? "₹" : "$"}
                      {billingCycle === "yearly" ? plan.priceYearlyDisplay : plan.priceMonthlyDisplay}
                      <span className="text-sm font-normal text-[var(--text-muted)]">
                        /{billingCycle === "yearly" ? "year" : "month"}
                      </span>
                    </p>
                    <ul className="mt-3 space-y-1">
                      <li className="text-xs text-[var(--text-secondary)] flex items-center gap-1">
                        <Check className="w-3 h-3 text-green-500" aria-hidden="true" />
                        {plan.maxAccounts} users
                      </li>
                      <li className="text-xs text-[var(--text-secondary)] flex items-center gap-1">
                        <Check className="w-3 h-3 text-green-500" aria-hidden="true" />
                        {plan.maxSites} sites
                      </li>
                    </ul>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={isLoading} className="btn-primary">
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  Processing...
                </>
              ) : (
                <>
                  Continue to Review
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Step 2: Plan Review */}
      {step === "plan" && selectedPlan && (
        <div className="space-y-6">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Order Summary</h2>
            </div>
            <div className="card-body space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-[var(--text-primary)]">{selectedPlan.displayName}</h3>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {billingCycle === "yearly" ? "Annual" : "Monthly"} subscription
                  </p>
                </div>
                <p className="text-xl font-bold text-[var(--text-primary)]">
                  {selectedPlan.currency === "INR" ? "₹" : "$"}
                  {price.toLocaleString()}
                </p>
              </div>

              <div className="border-t border-[var(--bg-border)] pt-4">
                <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-2">Includes:</h4>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                    <Check className="w-4 h-4 text-green-500" aria-hidden="true" />
                    Up to {selectedPlan.maxAccounts} user accounts
                  </li>
                  <li className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                    <Check className="w-4 h-4 text-green-500" aria-hidden="true" />
                    Up to {selectedPlan.maxSites} sites
                  </li>
                  {selectedPlan.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                      <Check className="w-4 h-4 text-green-500" aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-t border-[var(--bg-border)] pt-4 flex justify-between items-center">
                <span className="text-lg font-semibold text-[var(--text-primary)]">Total</span>
                <span className="text-2xl font-bold text-[var(--text-primary)]">
                  {selectedPlan.currency === "INR" ? "₹" : "$"}
                  {price.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep("company")}
              className="btn-secondary"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              Back
            </button>
            <button
              type="button"
              onClick={proceedToPayment}
              disabled={isLoading}
              className="btn-primary"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  Creating Order...
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4" aria-hidden="true" />
                  Pay {selectedPlan.currency === "INR" ? "₹" : "$"}
                  {price.toLocaleString()}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Payment (handled by Razorpay modal) */}
      {step === "payment" && (
        <div className="text-center py-12">
          <Loader2 className="w-12 h-12 animate-spin text-[var(--brand)] mx-auto mb-4" aria-hidden="true" />
          <p className="text-[var(--text-secondary)]">Processing payment...</p>
        </div>
      )}

      {/* Step 4: Success */}
      {step === "success" && createdAccount && (
        <div className="text-center py-8">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-500" aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
            Welcome to Glimmora Pharma!
          </h2>
          <p className="text-[var(--text-secondary)] mb-6">
            Your account has been created successfully.
          </p>

          <div className="card max-w-sm mx-auto mb-6">
            <div className="card-body space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-muted)]">Email:</span>
                <span className="text-[var(--text-primary)] font-medium">{createdAccount.email}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-muted)]">Username:</span>
                <span className="text-[var(--text-primary)] font-medium">{createdAccount.username}</span>
              </div>
            </div>
          </div>

          <a
            href="/login"
            className="btn-primary inline-flex"
            onClick={onComplete}
          >
            Go to Login
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </a>
        </div>
      )}
    </div>
  );
}
