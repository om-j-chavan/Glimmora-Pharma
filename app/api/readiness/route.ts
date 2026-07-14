import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Inspection, ReadinessCard, Simulation, Playbook } from "@/store/readiness.slice";

// Map database bucket values to frontend expected format
function mapBucket(bucket: string): "Immediate" | "31-60 days" | "61-90 days" {
  if (bucket.toLowerCase().includes("immediate") || bucket.includes("Week 1")) return "Immediate";
  if (bucket.includes("31-60") || bucket.includes("Week 3") || bucket.includes("Week 4")) return "31-60 days";
  return "61-90 days";
}

// Map database lane values to frontend expected format
function mapLane(lane: string): "People" | "Process" | "Data" | "Systems" | "Documentation" {
  const lowerLane = lane.toLowerCase();
  if (lowerLane.includes("people") || lowerLane.includes("training") || lowerLane.includes("communication")) return "People";
  if (lowerLane.includes("process") || lowerLane.includes("assessment")) return "Process";
  if (lowerLane.includes("data")) return "Data";
  if (lowerLane.includes("system") || lowerLane.includes("equipment")) return "Systems";
  if (lowerLane.includes("doc") || lowerLane.includes("logistics") || lowerLane.includes("simulation")) return "Documentation";
  return "Process";
}

// Map status
function mapStatus(status: string): "Not Started" | "In Progress" | "Complete" | "Overdue" {
  const lower = status.toLowerCase();
  if (lower === "not started" || lower === "planned") return "Not Started";
  if (lower === "in progress" || lower === "scheduled") return "In Progress";
  if (lower === "complete" || lower === "completed") return "Complete";
  if (lower === "overdue") return "Overdue";
  return "Not Started";
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = (session.user as { tenantId?: string }).tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: "No tenant" }, { status: 400 });
    }

    // Fetch inspections with actions and simulations
    const dbInspections = await prisma.inspection.findMany({
      where: { tenantId },
      include: {
        actions: true,
        simulations: true,
      },
      orderBy: { expectedDate: "asc" },
    });

    // Transform inspections to frontend format
    const inspections: Inspection[] = dbInspections.map((insp) => {
      const completedActions = insp.actions.filter(a => a.status.toLowerCase().includes("complete")).length;
      return {
        id: insp.id,
        tenantId: insp.tenantId,
        title: insp.title,
        siteId: insp.siteName, // Using siteName as siteId for now
        siteName: insp.siteName,
        agency: insp.agency as "FDA" | "EMA" | "MHRA" | "WHO" | "Internal",
        type: insp.type as "announced" | "unannounced" | "follow_up" | "pre_approval",
        status: insp.status as "planning" | "preparation" | "active" | "completed" | "cancelled",
        expectedDate: insp.expectedDate?.toISOString(),
        startDate: insp.startDate?.toISOString(),
        endDate: insp.endDate?.toISOString(),
        readinessScore: insp.actions.length > 0 ? Math.round((completedActions / insp.actions.length) * 100) : 0,
        totalActions: insp.actions.length,
        completedActions,
        linkedFDA483Id: insp.linkedFDA483Id ?? undefined,
        inspectionLead: insp.inspectionLead ?? "",
        createdBy: insp.createdBy,
        createdAt: insp.createdAt.toISOString(),
        updatedAt: insp.updatedAt.toISOString(),
        notes: insp.notes ?? undefined,
        completionOutcome: insp.status === "completed" ? (insp.linkedFDA483Id ? "FDA 483 issued" : "No observations") : undefined,
      };
    });

    // Transform readiness actions to cards
    const cards: ReadinessCard[] = [];
    for (const insp of dbInspections) {
      for (const action of insp.actions) {
        cards.push({
          id: action.id,
          tenantId,
          lane: mapLane(action.lane),
          bucket: mapBucket(action.bucket),
          action: action.title,
          owner: action.owner ?? "",
          status: mapStatus(action.status),
          agiRisk: action.priority === "Critical" ? "High" : action.priority === "High" ? "High" : action.priority === "Medium" ? "Medium" : "Low",
          dueDate: action.dueDate?.toISOString() ?? new Date().toISOString(),
          completedAt: action.completedAt?.toISOString(),
          completedBy: action.completedBy ?? undefined,
        });
      }
    }

    // Transform simulations
    const simulations: Simulation[] = [];
    for (const insp of dbInspections) {
      for (const sim of insp.simulations) {
        simulations.push({
          id: sim.id,
          tenantId,
          title: sim.title,
          type: sim.type as "Mock Inspection" | "DIL Drill" | "SME Q&A" | "QA Workshop" | "Back Room Drill" | "Leadership Briefing" | "SME Practice",
          scheduledAt: sim.scheduledAt?.toISOString() ?? new Date().toISOString(),
          duration: sim.duration ?? 60,
          participants: sim.participants?.split(",").map(p => p.trim()) ?? [],
          status: sim.status as "Scheduled" | "In Progress" | "Completed" | "Cancelled",
          score: sim.score ?? undefined,
          notes: sim.notes ?? undefined,
        });
      }
    }

    // Return default playbooks (these are static reference content)
    const playbooks: Playbook[] = [
      {
        id: "pb-001",
        tenantId,
        type: "Front Room",
        title: "Front Room Inspection Protocol",
        description: "Roles, behaviors, document handling and response rules for the primary inspector-facing team.",
        templates: ["Opening meeting deck", "Commitment matrix template", "Request log"],
        steps: [
          { id: "s-001", order: 1, action: "Receive inspector on arrival", do: ["Greet professionally and escort to designated room", "Provide site org chart and key contact list", "Confirm scope and agenda with lead inspector"], dont: ["Do not volunteer information beyond what is asked", "Do not allow inspector to wander unescorted"] },
          { id: "s-002", order: 2, action: "Manage document requests (DIL)", do: ["Log every request in the DIL tracker immediately", "Assign an owner and realistic retrieval time", "Communicate status every 30 minutes"], dont: ["Do not provide documents without back-room review", "Do not guess — confirm before committing to a deadline"] },
          { id: "s-003", order: 3, action: "Handle inspector questions", do: ["Answer concisely and factually", "Say 'I will confirm and get back to you' if unsure", "Route technical questions to the correct SME"], dont: ["Do not speculate or provide opinions", "Do not argue with the inspector", "Do not discuss unrelated issues"] },
          { id: "s-004", order: 4, action: "Daily debrief with back room", do: ["Summarise all observations raised that day", "Agree overnight response actions with back-room lead", "Prepare for next day document requests"], dont: ["Do not share debrief notes outside the core team"] },
          { id: "s-005", order: 5, action: "Closing meeting", do: ["Listen carefully to all observations", "Take verbatim notes on every 483 observation", "Commit only to what you can deliver in 15 business days"], dont: ["Do not commit to timelines without back-room approval", "Do not dispute observations in the room"] },
        ],
      },
      {
        id: "pb-002",
        tenantId,
        type: "Back Room",
        title: "Back Room Operations Protocol",
        description: "Evidence retrieval, document review, and response coordination for the support team.",
        templates: ["Evidence register", "Response coordination log", "Overnight action list"],
        steps: [
          { id: "s-006", order: 1, action: "Establish back-room command centre", do: ["Set up in a separate room with secure access", "Assign roles: evidence lead, comms lead, legal liaison", "Keep a live log of all inspector requests"], dont: ["Do not allow unassigned staff in the back room"] },
          { id: "s-007", order: 2, action: "Review all documents before front-room delivery", do: ["Check every document for accuracy and completeness", "Flag any gaps or inconsistencies before submission", "Log reviewed documents in evidence register"], dont: ["Do not send unreviewed documents to front room", "Do not alter records — only identify and explain gaps"] },
          { id: "s-008", order: 3, action: "Coordinate overnight responses", do: ["Prioritise by inspector risk signal", "Assign overnight actions with clear owners and deadlines", "Brief front room at morning handoff"], dont: ["Do not create new records to fill gaps"] },
        ],
      },
      {
        id: "pb-003",
        tenantId,
        type: "SME",
        title: "SME Interview Protocol",
        description: "Preparation and conduct guidelines for subject matter experts who may be interviewed by inspectors.",
        templates: ["SME Q&A practice sheet", "Common question bank"],
        steps: [
          { id: "s-009", order: 1, action: "SME pre-inspection preparation", do: ["Know your SOPs and be able to locate them quickly", "Practice answering: 'Walk me through your process for X'", "Know your last training date and record location"], dont: ["Do not memorise scripts — stay conversational", "Do not prepare for questions outside your role"] },
          { id: "s-010", order: 2, action: "During inspector interview", do: ["Answer only what is asked — short and factual", "Say 'I would need to check the record' if unsure", "Refer complex questions to the QA representative"], dont: ["Do not speculate about other departments", "Do not answer questions about events you did not witness"] },
        ],
      },
      {
        id: "pb-004",
        tenantId,
        type: "DIL Handling",
        title: "Document Information List (DIL) Protocol",
        description: "Systematic handling of inspector document requests — retrieval, review, and tracking.",
        templates: ["DIL request log", "Evidence retrieval SOP", "Document index"],
        steps: [
          { id: "s-011", order: 1, action: "Receive DIL from inspector", do: ["Log all requested items immediately in DIL tracker", "Assign priority: immediate / same day / next day", "Confirm receipt with inspector"], dont: ["Do not acknowledge you have a document you are not sure about"] },
          { id: "s-012", order: 2, action: "Locate and retrieve documents", do: ["Use the evidence library index first", "Confirm version and effective date before retrieval", "Back-room review before handing to front room"], dont: ["Do not retrieve superseded versions", "Do not provide draft documents as final"] },
          { id: "s-013", order: 3, action: "Track and close DIL items", do: ["Mark each item complete when delivered", "Note any gaps with documented explanation", "Report open items at daily debrief"], dont: ["Do not leave items open without an owner"] },
        ],
      },
    ];

    return NextResponse.json({
      inspections,
      cards,
      simulations,
      playbooks,
      training: [], // Training records would come from a separate training system
    });
  } catch (error) {
    console.error("Error fetching readiness data:", error);
    return NextResponse.json(
      { error: "Failed to fetch readiness data" },
      { status: 500 }
    );
  }
}
