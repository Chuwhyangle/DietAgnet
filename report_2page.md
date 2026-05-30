# Diet Agent

## GitHub Repository

**GitHub Repository:** [https://github.com/Chuwhyangle/DietAgnet](https://github.com/Chuwhyangle/DietAgnet)

## System Design Diagram and Explanation

![Diet Agent system design diagram](output/doc/diet_agent_system_design.png)

Diet Agent is designed as a local-first desktop diet coaching Agent. The React interface provides the main user entry points: Home, Recipes, Diet Log, Agent Chat, and Settings. These screens collect user actions and send them to the Agent Controller.

The Agent Controller is the core coordinator. It builds prompts from the current diet plan, diet logs, memory, and reminder state, then runs a guarded tool-call loop. The model can invoke tools for meal logging, recipe search, planning, and memory or knowledge access, but the loop is limited so the system remains stable and auditable.

The Tool Registry connects the Agent to local data. Dexie and IndexedDB store diet logs, plans, recipes, memories, and reminder records on the user's device. The Electron main process keeps the API key in safeStorage and proxies remote LLM requests, so sensitive data stays protected while the LLM is used only for reasoning and estimation.

What makes this system agentic is that it does not only answer questions. It can remember long-term user facts such as allergies or dislikes, read the current plan before giving advice, log meals through tools, and trigger proactive reminders or adjustment suggestions when the user's intake drifts from the target.

This design supports the full coaching cycle: plan, log, compare, remember, remind, and adjust.

<div style="page-break-before: always;"></div>

## System Working Principle Screenshots and Explanation

![Diet Agent working principle screenshots](output/doc/diet_agent_workflow_screenshots.png)

The screenshots show the main working flow of the system:

1. **Create Plan**: On the Home page, the user creates a personal calorie plan and can start logging immediately through Quick Log.
2. **Search Knowledge**: The Recipes page provides recipe data that supports recommendation and tool-based retrieval inside the Agent workflow.
3. **Log and Compare**: After the user records a meal, the Diet Log page compares actual intake with the planned target and shows whether the user is under, near, or over the expected range.
4. **Configure Agent**: The Settings page manages model options, memory, and proactive reminders so the Agent can respond in a personalized and low-noise way.
5. **Use Agent Tools**: In chat mode, the Agent can call local tools to search recipes, read the current plan, store preferences, and add meal records instead of only generating text.
6. **Remember and Remind**: The system stores useful long-term facts, such as allergies or food dislikes, and uses quiet hours, cooldowns, and dismiss history to decide when a reminder should be sent.

In practice, Diet Agent works as a feedback loop: the user creates a plan, logs meals, the system compares intake against the target, stores useful preferences or habits, and then generates reminders or adjustment suggestions when needed.
