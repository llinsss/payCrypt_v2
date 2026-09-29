# Completion Report

## Issue #720: Add tag ownership recovery and governance policy

### Overview

This document defines the trust model, governance authority, and operational
requirements for **tag ownership recovery**. Recovery is a privileged,
governance-gated process that is deliberately kept **separate from ordinary
user-controlled transfer**. It exists only to restore control of a tag when its
owner has lost access, or when a registered destination has become unusable.

### Trust Model

- **Tag owners** are the default authority over their tags. Under normal
  operation, ownership changes only through the ordinary, user-controlled
  transfer flow, which requires the current owner's authorization.
- **Governance** is a distinct, higher authority that can act *only* through the
  recovery process described here. Governance is not a super-owner: it cannot
  move tags arbitrarily, and every recovery action is constrained by the delay,
  evidence, and event requirements below.
- **Recovery is not transfer.** Ordinary transfer is initiated and authorized by
  the current owner and takes effect immediately. Recovery is initiated by a
  third party (or governance) on behalf of a tag whose owner is unreachable, and
  it must clear a mandatory delay before it can execute.
- **Least privilege.** Governance authority is scoped to the specific tag named
  in a recovery request. A recovery request must never affect any tag other than
  the one it explicitly targets.

### Governance Authority

- Only the designated governance authority may approve and execute a recovery.
- Governance must publish the recovery request (target tag, claimant, and
  justification) so it is observable before execution.
- Governance approval is a prerequisite for execution; a request that has not
  been approved cannot execute, regardless of how much time has elapsed.

### Delay Requirements

- Every recovery request is subject to a **mandatory delay** between the time it
  is filed and the earliest time it may execute.
- The delay gives the current owner (or any interested party) a window to object
  or to re-establish control through the ordinary transfer flow.
- A recovery request may not execute before the delay has fully elapsed. If the
  owner re-establishes control during the delay, the recovery request is void.

### Evidence Requirements

A recovery request must supply, and governance must verify, all of the
following before the request can be approved:

1. **Target tag** — the exact tag whose ownership is being recovered.
2. **Claimant** — the identity that will receive ownership if recovery executes.
3. **Justification** — the reason recovery is needed (owner lost access, or the
   registered destination is unusable).
4. **Proof of loss / unusability** — supporting evidence that the owner can no
   longer exercise control, or that the registered destination can no longer be
   used.

A request missing any of these is rejected and cannot be approved or executed.

### Event Requirements

Recovery must emit observable events so the process is auditable:

- **RecoveryRequested** — emitted when a recovery request is filed, including
  the target tag, claimant, and the start of the delay window.
- **RecoveryApproved** — emitted when governance approves a request.
- **RecoveryExecuted** — emitted when ownership is actually recovered, after the
  delay has elapsed and approval is in place.
- **RecoveryCancelled** — emitted if the request is withdrawn, objected to, or
  voided because the owner re-established control.

### Scope Guarantee: Recovery Cannot Seize Unrelated Tags

Recovery is strictly single-tag. A recovery request names exactly one target tag
and can only ever change ownership of that tag. It must not:

- affect any other tag owned by the same owner,
- affect tags owned by other parties, or
- be used as a bulk or wildcard operation.

This is enforced by requiring the target tag to be explicit in the request and
by scoping approval and execution to that single tag.

### Acceptance Criteria Mapping

- **Trust model and governance authority documented** — see *Trust Model* and
  *Governance Authority* above.
- **Delay, evidence, and event requirements added** — see *Delay Requirements*,
  *Evidence Requirements*, and *Event Requirements* above.
- **Recovery cannot seize unrelated tags** — see *Scope Guarantee* above; recovery
  is single-tag by construction and cannot touch unrelated tags.
