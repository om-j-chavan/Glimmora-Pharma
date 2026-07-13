/**
 * GET /api/subscriptions/status
 *
 * Returns the current subscription status for the authenticated tenant.
 * Requires authentication.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = session.user.tenantId;

    const subscription = await prisma.subscription.findUnique({
      where: { tenantId },
      include: {
        plan: {
          select: {
            id: true,
            name: true,
            displayName: true,
            priceMonthly: true,
            priceYearly: true,
            currency: true,
            maxAccounts: true,
            maxSites: true,
            features: true,
          },
        },
        payments: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            amount: true,
            currency: true,
            status: true,
            method: true,
            paidAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: "No subscription found" },
        { status: 404 }
      );
    }

    // Calculate days until expiry
    const now = new Date();
    const expiryDate = new Date(subscription.expiryDate);
    const daysUntilExpiry = Math.ceil(
      (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Determine if renewal is needed
    const needsRenewal = daysUntilExpiry <= 30;
    const isExpired = daysUntilExpiry < 0;
    const isInGracePeriod =
      isExpired && Math.abs(daysUntilExpiry) <= subscription.gracePeriodDays;

    // Get current user count
    const userCount = await prisma.user.count({
      where: { tenantId, isActive: true },
    });

    // Get current site count
    const siteCount = await prisma.site.count({
      where: { tenantId, isActive: true },
    });

    return NextResponse.json({
      subscription: {
        id: subscription.id,
        status: subscription.status,
        startDate: subscription.startDate,
        expiryDate: subscription.expiryDate,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        currentYear: subscription.currentYear,
        gracePeriodDays: subscription.gracePeriodDays,
        cancelledAt: subscription.cancelledAt,
        maxAccounts: subscription.maxAccounts,
      },
      plan: subscription.plan
        ? {
            ...subscription.plan,
            features: subscription.plan.features
              ? JSON.parse(subscription.plan.features)
              : [],
          }
        : null,
      usage: {
        users: userCount,
        maxUsers: subscription.maxAccounts,
        sites: siteCount,
        maxSites: subscription.plan?.maxSites ?? 1,
      },
      status: {
        daysUntilExpiry,
        needsRenewal,
        isExpired,
        isInGracePeriod,
        canRenew: needsRenewal && !subscription.cancelledAt,
      },
      recentPayments: subscription.payments,
    });
  } catch (error) {
    console.error("[subscriptions/status] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscription status" },
      { status: 500 }
    );
  }
}
