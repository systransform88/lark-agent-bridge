---
name: lark-workflow-memory
description: Create or update a reusable Lark workflow when the user explicitly requests a skill or says a workflow should be reusable. Ordinary facts, preferences, links and aliases use permanent memory.
---

Create a local skill only when the current user asks for a skill or says the workflow should be reusable. Ordinary “remember this link” requests belong in permanent memory.

Save the skill under the skill directory supplied by the bridge, in `lark-workflow-<topic>/SKILL.md`. Use lowercase letters, digits and hyphens for the topic. Include YAML `name` and `description`; put the intended trigger phrases in the description. Record the exact source path or Lark URL and the intended action in the body. Use earlier conversation only to resolve information actually supplied by the user. Ask for missing resources instead of inventing them. Update an existing matching workflow instead of creating conflicting duplicates.

Reopen the file and verify its content before confirming the trigger, source and saved skill path. Do not attach the skill file unless requested. On later matching requests, read the skill and open its recorded resource. A current explicit instruction overrides a saved workflow. Resource lookup is read-only unless the current request asks for edits. Do not store credentials in skills.
