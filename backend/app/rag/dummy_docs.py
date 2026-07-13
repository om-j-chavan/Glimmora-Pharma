# app/rag/dummy_docs.py
# Run ONCE to upload documents to Pinecone
# Command: python -m app.rag.dummy_docs

from app.rag.rag_service import build_vector_store

DUMMY_DOCUMENTS = [
    {
        "title": "CAPA Overview",
        "content": """
        CAPA stands for Corrective and Preventive Action.
        It is a process used in quality management systems to identify, 
        investigate, and eliminate the root causes of non-conformances.
        A Corrective Action addresses an existing problem to prevent recurrence.
        A Preventive Action addresses a potential problem before it occurs.
        CAPA is required by ISO 9001, FDA 21 CFR Part 820, and other quality standards.
        Every CAPA must have a problem statement, root cause analysis, action plan,
        and effectiveness check before it can be closed.
        """
    },
    {
        "title": "How to Create a CAPA",
        "content": """
        Step 1: Identify the problem — write a clear problem statement describing 
        what happened, where, when, and how many times.
        Step 2: Set the severity — classify as Critical, Major, or Minor
        based on its impact on product quality or patient safety.
        Step 3: Assign a source — choose from Customer Complaint, Internal Audit,
        Supplier Issue, Process Deviation, or Management Review.
        Step 4: Identify the area affected — select the department or process area.
        Step 5: Submit the CAPA — the system assigns a unique CAPA ID and 
        sets status to Open automatically.
        """
    },
    {
        "title": "RCA Process — Root Cause Analysis",
        "content": """
        Root Cause Analysis (RCA) identifies the fundamental cause of a problem.
        Supported RCA methods in Glimmora:
        - 5 Why Analysis: Ask Why five times to drill down to the root cause.
        - Fishbone Diagram: Categorize causes into Man, Machine, Material, Method, Environment.
        - Fault Tree Analysis: Top-down logic diagram to trace failure paths.
        A good RCA must include root cause statement, contributing factors,
        supporting evidence, and recurrence risk assessment.
        RCA quality is scored by AI on a scale of 0 to 10. Score above 7 is acceptable.
        """
    },
    {
        "title": "Action Plan Guidelines",
        "content": """
        An Action Plan defines specific steps to address the root cause from RCA.
        Each action must include action description, responsible person, due date, and action type.
        Action types: Corrective, Preventive, or Containment.
        AI evaluates the plan and gives a rating: Excellent, Good, or Needs Improvement.
        Cosmetic CAPAs are low-risk issues that only require documentation updates.
        """
    },
    {
        "title": "Implementation Monitoring",
        "content": """
        Monitoring tracks progress of each action in the Action Plan.
        Action statuses: On Track, Completed, Overdue, or At Risk.
        The system counts overdue, on-track, and completed actions automatically.
        Escalation alerts trigger when actions become overdue.
        Overall CAPA status: In Progress, Completed, or Escalated.
        """
    },
    {
        "title": "Effectiveness Check Process",
        "content": """
        Effectiveness Check verifies that actions taken have solved the problem.
        Should be performed 30 to 90 days after all actions are completed.
        You must provide evidence items, trend data, and new issues report.
        AI calculates effectiveness score from 0 to 100:
        - Above 80: Effective — CAPA can proceed to closure
        - 50 to 80: Partially effective — additional actions may be needed
        - Below 50: Ineffective — CAPA must be re-opened with new RCA
        capa_can_be_closed is set True only when score is above 80 and no new issues reported.
        """
    },
    {
        "title": "CAPA Closure Process",
        "content": """
        CAPA Closure is the final step. Conditions that must all be met:
        1. All actions in the Action Plan are completed
        2. Effectiveness check performed and passed
        3. No recurrence of the original problem detected
        4. Training records updated and verified
        5. Document changes (SOPs, work instructions) approved
        Closure requires electronic signature from an authorized approver.
        If ai_closure_approved is True, capa_final_status is set to Approved.
        If any condition is not met, closure is rejected and CAPA remains open.
        """
    },
    {
        "title": "CAPA Severity Levels",
        "content": """
        Critical: Directly impacts patient safety or regulatory compliance. 
        Must be addressed within 30 days.
        Major: Significantly affects product quality but no immediate safety risk. 
        Must be addressed within 60 days.
        Minor: Low-impact issues unlikely to affect product quality. 
        Must be addressed within 90 days.
        """
    },
    {
        "title": "Recurrence Risk",
        "content": """
        Recurrence risk is assessed during RCA and indicates likelihood of problem repeating.
        High: Problem will almost certainly recur — requires immediate comprehensive actions.
        Medium: Problem may recur under certain conditions — requires targeted actions.
        Low: Problem unlikely to recur — preventive actions and documentation sufficient.
        is_recurring is set True if same problem occurred before, increasing the risk score.
        """
    },
    {
        "title": "Glimmora AI Assistant Capabilities",
        "content": """
        The AI Assistant can help with:
        Data queries: count CAPAs by status, severity, source; RCA quality scores;
        action plan ratings; effectiveness scores; closure approval status.
        Guidance: how to create a CAPA, which RCA method to use, what evidence to collect,
        when a CAPA is ready to be closed.
        The AI is read-only — it cannot modify or create records.
        All data entry must be done through the proper forms in the system.
        """
    },
]

if __name__ == "__main__":
    print("Uploading documents to Pinecone...")
    build_vector_store(DUMMY_DOCUMENTS)