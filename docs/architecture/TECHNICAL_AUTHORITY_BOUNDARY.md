# Technical Authority Boundary — Lekta × Katedra

Status: mandatory product rule

This document strengthens the Product Constitution with one non-negotiable product boundary:

> **Katedra may help create, understand and improve academic content. Lekta alone verifies the technical state of the actual document.**

## 1. Exclusive authority

Lekta is the exclusive product authority for technical/document verification.

Only Lekta may inspect and return a verification verdict for machine-checkable properties of the actual submitted document, including where supported:

- margins, page setup and document layout;
- fonts, styles and heading hierarchy;
- page numbering, sections and breaks;
- TOC/SEQ/REF and other Word-field mechanics;
- tracked changes and comments;
- citation mechanics, numbering and bibliography relationships;
- typography and other deterministic document rules;
- faculty-specific machine-checkable submission requirements;
- technical/compliance score;
- deterministic AutoFix;
- confirmation that a previously reported technical issue disappeared after a fresh re-check.

## 2. Katedra content authority

Katedra owns content/process assistance, including:

- topic, research question, thesis and hypotheses;
- academic planning and structure at the conceptual level;
- argumentation and logical coherence;
- quality and relevance of evidence;
- whether evidence actually supports a claim;
- methodology, interpretation and limitations;
- clarity, repetition and academic expression;
- mentor-feedback workflows;
- progress, deadlines and defense preparation;
- explanation of Lekta findings and planning how the user should resolve them.

Katedra may know what a technical rule means and may explain it. That knowledge does **not** make Katedra a verifier of the user's actual DOCX.

## 3. Katedra MUST NOT

Katedra must not:

- run or present its own competing technical document check;
- claim that margins, fonts, numbering, Word fields, citation mechanics or bibliography mechanics are correct;
- output a technical/compliance score independently of Lekta;
- say that the actual document is formally compliant based on LLM reading or user description;
- mark a deterministic finding `VERIFIED_FIXED` without a fresh Lekta analysis;
- create a UI path that makes Lekta optional for a user who wants technical assurance;
- market generative/semantic review as equivalent to deterministic document inspection.

If a user asks Katedra to verify technical compliance, Katedra must explicitly state that it cannot verify that layer as reliably as Lekta and route the user to Lekta Check.

## 4. Why this boundary exists

The products solve different trust problems:

- **Katedra:** “Is the work academically stronger and is the student following a good process?”
- **Lekta:** “What is actually true about this DOCX/PDF as a technical submission artifact?”

If Katedra duplicates technical verification, Lekta loses its independent reason to exist and the ecosystem loses a clean distinction between generative assistance and deterministic verification.

The separation is therefore product strategy, not merely implementation detail.

## 5. Cross-product workflow

The intended flow is:

`Katedra content/process work -> Lekta technical check -> Katedra resolution guidance -> Lekta re-check`

Katedra can help the user understand and act on a Lekta finding. Only Lekta can verify the changed document and close the deterministic finding.

## 6. UI wording rule

Katedra should prefer wording such as:

- “Recenzija sadržaja”
- “Katedra provjerava argumentaciju, dokaze i jasnoću.”
- “Tehničku provjeru stvarnog dokumenta radi Lekta.”
- “Katedra ovo može objasniti, ali ne može potvrditi da je DOCX usklađen.”

Katedra should avoid wording such as:

- “potpuni audit dokumenta”
- “tehnička provjera u Katedri”
- “dokument je usklađen”
- “formalno provjereno”
- any Katedra-native technical score.

## 7. Architecture gate

Any future feature that reads the actual document and returns a machine-checkable compliance verdict belongs in Lekta unless this boundary is explicitly changed by a new architecture decision.

Any future Katedra feature that starts resembling document verification must instead consume Lekta structured results or deep-link to Lekta.
