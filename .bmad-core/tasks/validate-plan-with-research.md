<!-- Powered by BMAD™ Core -->

# Validate Plan with Research Task (Autonomous)

## Purpose

Automatically review a project artifact, conduct targeted research on its core concepts, align the plan with modern best practices, and summarize every change applied to the artifact and its companion documents.

## Inputs

- `artifact_path`: Path to the primary artifact (e.g., `docs/stories/1.1.setup-initial-project.md`).

## Process (Follow sequentially)

### 1. Acknowledge and Load Artifact

- Announce task start and name the artifact under review.
- Load the file located at `artifact_path`.

### 2. Contextual Analysis of Artifact

- Determine artifact type (Story, Test Design, etc.).
- Tailor the research focus:
  - **Story:** Implementation details, technology choices, security, performance.
  - **Test Design:** Methodologies, frameworks, coverage strategies.

### 3. Identify Key Concepts for Research

- Parse the artifact to extract concepts, patterns, or strategies needing validation.

### 4. Generate & Execute Research

- For each concept, invoke the `create-deep-research-prompt.md` task to craft precise research questions.
- Run the resulting research, synthesize findings, and capture best practices, viable alternatives, and common pitfalls.

### 5. Formulate Changes and Update Artifacts

- Compare findings with the plan in the primary artifact.
- Draft concrete edits (adds/modifies/removals) that align the plan with modern practice.
- Apply edits directly to the primary artifact.
- Locate related artifacts (risk profiles, test designs, etc.) with matching story/test IDs and apply cascade updates.
- For each touched artifact, create or append a `## 🔬 Research & Validation Log` section recording:
  - Date of validation.
  - Changes made.
  - Supporting sources with access dates.
  - Outstanding risks or open questions.

### 6. Generate Final Summary Report

- After saving all changes, output this summary block verbatim to the user:

---

**Research & Validation Summary**

* **Primary Artifact Validated:** `{{artifact_path}}`
* **Status:** Complete. Artifacts have been updated automatically.

**Modified Files:**
* `{{list_of_all_modified_files}}`

**Summary of Changes:**

* **Modernization:** Updated the authentication strategy in the story to use passwordless WebAuthn, which is the current industry standard for security and user experience.
* **Security Enhancement:** Added a task to the story to implement Content Security Policy (CSP) headers, based on research showing their effectiveness against XSS attacks.
* **Test Plan Improvement:** Modified the `test-design.md` to include visual regression testing, as research indicated this is a best practice for component libraries of this type.

*For a detailed breakdown of every change, please see the "Research & Validation Log" section in the primary artifact.*

---
