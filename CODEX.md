\# Codex Working Guide



\## Required reading before any work



Before making any code changes, read these files first:



1\. `docs/project-context/core-learnings.md`

2\. `docs/project-context/master-index.md`

3\. `docs/project-context/system-context.md`



These files contain the essential project context, architecture decisions, prior Claude Code instructions, safety rules, and accumulated project decisions.



\## Reference files



Detailed historical work logs are stored in:



`docs/project-context/history/`



Do not read all history files by default.



Only consult the relevant history files when the task relates to that area. Use `master-index.md` to decide which history files are relevant.



\## General working rules



\- Do not modify code before explaining the plan.

\- Always identify which files will be changed before changing them.

\- Keep changes small and focused.

\- Do not refactor unrelated code.

\- Do not change deployment settings unless explicitly asked.

\- Do not touch Firebase credentials, service account files, `.env`, or ignored files.

\- Do not commit or expose secrets, API keys, private keys, tokens, passwords, or service account JSON files.

\- Preserve the existing project structure unless there is a clear reason to change it.

\- When unsure, ask for clarification before making changes.

\- For risky changes, propose a plan first and wait for approval.



\## Homepage-specific rules



\- Preserve the existing homepage design direction unless explicitly asked to redesign it.

\- Do not change public routes, download links, Firebase settings, deployment settings, or domain-related settings unless explicitly asked.

\- When changing homepage copy or UI, keep the app’s current concept and terminology consistent with `dawnlight-app`.



\## First response format for every new task



For every new task, start by summarizing:



1\. What you understood

2\. Which required context files you checked

3\. Which additional history files, if any, seem relevant

4\. Which files you plan to inspect

5\. Whether code changes are needed

6\. The safest next step



\## Related repository



This homepage project is related to the `dawnlight-app` repository.



When a task involves app features, Firebase, user data, app screens, push notifications, shared branding, or app-homepage connection, check whether the `dawnlight-app` repository also needs changes before modifying code.

