/**
 * GET /api/signup/pricing
 *
 * Returns active subscription plans with pricing.
 * Public endpoint - no authentication required.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        displayName: true,
        description: true,
        priceMonthly: true,
        priceYearly: true,
        currency: true,
        maxAccounts: true,
        maxSites: true,
        features: true,
        trialDays: true,
        isPopular: true,
      },
    });

    // Parse features JSON for each plan
    const plansWithFeatures = plans.map((plan) => ({
      ...plan,
      features: plan.features ? JSON.parse(plan.features) : [],
      // Convert paise to rupees for display
      priceMonthlyDisplay: plan.priceMonthly / 100,
      priceYearlyDisplay: plan.priceYearly / 100,
    }));

    return NextResponse.json({ plans: plansWithFeatures });
  } catch (error) {
    console.error("[signup/pricing] Error fetching plans:", error);
    return NextResponse.json(
      { error: "Failed to fetch pricing plans" },
      { status: 500 }
    );
  }
}
