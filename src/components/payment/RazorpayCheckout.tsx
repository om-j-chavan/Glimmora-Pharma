"use client";

/**
 * RazorpayCheckout - Wrapper component for Razorpay checkout.
 *
 * Handles:
 * - Loading Razorpay script
 * - Opening checkout modal
 * - Payment success/failure callbacks
 */

import { useEffect, useRef, useCallback } from "react";

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  theme?: {
    color?: string;
  };
  handler: (response: RazorpayResponse) => void;
  modal?: {
    ondismiss?: () => void;
    escape?: boolean;
    confirm_close?: boolean;
  };
}

interface RazorpayInstance {
  open: () => void;
  close: () => void;
}

export interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface RazorpayCheckoutProps {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  name?: string;
  description?: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  themeColor?: string;
  onSuccess: (response: RazorpayResponse) => void;
  onError?: (error: Error) => void;
  onDismiss?: () => void;
  autoOpen?: boolean;
  children?: React.ReactNode;
}

const RAZORPAY_SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";

export function RazorpayCheckout({
  orderId,
  amount,
  currency,
  keyId,
  name = "Glimmora Pharma",
  description = "Subscription Payment",
  prefill,
  notes,
  themeColor = "#0ea5e9",
  onSuccess,
  onError,
  onDismiss,
  autoOpen = false,
  children,
}: RazorpayCheckoutProps) {
  const razorpayRef = useRef<RazorpayInstance | null>(null);
  const scriptLoadedRef = useRef(false);

  // Load Razorpay script
  const loadScript = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      if (scriptLoadedRef.current || window.Razorpay) {
        scriptLoadedRef.current = true;
        resolve(true);
        return;
      }

      const script = document.createElement("script");
      script.src = RAZORPAY_SCRIPT_URL;
      script.async = true;
      script.onload = () => {
        scriptLoadedRef.current = true;
        resolve(true);
      };
      script.onerror = () => {
        resolve(false);
      };
      document.body.appendChild(script);
    });
  }, []);

  // Initialize Razorpay
  const initRazorpay = useCallback(async () => {
    const loaded = await loadScript();
    if (!loaded) {
      onError?.(new Error("Failed to load Razorpay script"));
      return null;
    }

    const options: RazorpayOptions = {
      key: keyId,
      amount,
      currency,
      name,
      description,
      order_id: orderId,
      prefill,
      notes,
      theme: { color: themeColor },
      handler: (response) => {
        onSuccess(response);
      },
      modal: {
        ondismiss: () => {
          onDismiss?.();
        },
        escape: true,
        confirm_close: true,
      },
    };

    const razorpay = new window.Razorpay(options);
    razorpayRef.current = razorpay;
    return razorpay;
  }, [
    loadScript,
    keyId,
    amount,
    currency,
    name,
    description,
    orderId,
    prefill,
    notes,
    themeColor,
    onSuccess,
    onDismiss,
    onError,
  ]);

  // Open checkout
  const openCheckout = useCallback(async () => {
    try {
      const razorpay = await initRazorpay();
      if (razorpay) {
        razorpay.open();
      }
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error("Failed to open checkout"));
    }
  }, [initRazorpay, onError]);

  // Auto-open if requested
  useEffect(() => {
    if (autoOpen && orderId) {
      openCheckout();
    }
  }, [autoOpen, orderId, openCheckout]);

  // If no children, render nothing (checkout opens automatically)
  if (!children) {
    return null;
  }

  // Render children with click handler
  return (
    <div onClick={openCheckout} style={{ cursor: "pointer" }}>
      {children}
    </div>
  );
}

/**
 * Hook to use Razorpay checkout imperatively.
 */
export function useRazorpayCheckout() {
  const loadScript = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }

      const script = document.createElement("script");
      script.src = RAZORPAY_SCRIPT_URL;
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }, []);

  const openCheckout = useCallback(
    async (options: Omit<RazorpayCheckoutProps, "children" | "autoOpen">) => {
      const loaded = await loadScript();
      if (!loaded) {
        options.onError?.(new Error("Failed to load Razorpay script"));
        return;
      }

      const razorpayOptions: RazorpayOptions = {
        key: options.keyId,
        amount: options.amount,
        currency: options.currency,
        name: options.name ?? "Glimmora Pharma",
        description: options.description ?? "Subscription Payment",
        order_id: options.orderId,
        prefill: options.prefill,
        notes: options.notes,
        theme: { color: options.themeColor ?? "#0ea5e9" },
        handler: (response) => {
          options.onSuccess(response);
        },
        modal: {
          ondismiss: () => {
            options.onDismiss?.();
          },
          escape: true,
          confirm_close: true,
        },
      };

      const razorpay = new window.Razorpay(razorpayOptions);
      razorpay.open();
    },
    [loadScript]
  );

  return { openCheckout };
}
