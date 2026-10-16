# Tag Contract

This contract manages tags, their ownership, and their association with wallets.

## Tag Expiry Semantics

Tags have an optional expiry timestamp. Expiry is evaluated against the
**ledger timestamp** (`env.ledger().timestamp()`), which is deterministic and
monotonic within a ledger. A tag is considered **expired** when:

```
ledger_timestamp >= tag.expiry
```

That is, the boundary is inclusive: a tag whose `expiry` equals the current
ledger timestamp is already expired. A tag with no expiry (`expiry == None`)
never expires.

### Renewal

Only the **current owner** of a tag may renew it. Renewal extends the expiry to
a new timestamp that must be strictly greater than the current ledger
timestamp. Renewing an already-expired tag is allowed for the owner and
restores it to a non-expired state.

- `renew_tag(env, owner, tag_id, new_expiry)`
  - Requires `owner.require_auth()`.
  - Fails with `TagError::NotOwner` if the caller is not the tag owner.
  - Fails with `TagError::InvalidExpiry` if `new_expiry <= ledger_timestamp`.
  - Emits `TagRenewed { tag_id, owner, new_expiry }`.

### Associated Wallets on Expiry

When a tag expires:

- **Existing wallet associations are preserved.** Expiry does not detach or
  delete associations, so historical links remain queryable.
- **New associations are blocked.** `associate_wallet` fails with
  `TagError::TagExpired` when the tag is expired at the current ledger
  timestamp.
- **Renewal re-enables associations** once the tag is non-expired again.

This keeps storage growth bounded: expiry never triggers unbounded iteration
over associations; it is checked lazily at the point of use.

## Error Codes

| Code | Name            | Meaning                                              |
|------|-----------------|------------------------------------------------------|
| 1    | `NotOwner`      | Caller is not the tag owner.                         |
| 2    | `InvalidExpiry` | Provided expiry is not in the future.                |
| 3    | `TagExpired`    | Operation requires a non-expired tag.                |

## Events

| Event        | Fields                          | Emitted when                          |
|--------------|---------------------------------|---------------------------------------|
| `TagRenewed` | `tag_id`, `owner`, `new_expiry` | An owner successfully renews a tag.   |

## Determinism

All expiry checks use the ledger timestamp supplied by the host environment.
No wall-clock time is read, so results are reproducible across validators for
the same ledger sequence.
