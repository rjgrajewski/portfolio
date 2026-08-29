<!-- SEED CONTENT (Phase 2). Real detail lands in Phase 8. -->
# Amazon — technical layer

What the work looked like day to day:

- **Services in production** — building, deploying, and owning backend
  services, with the full operational surface: metrics, alarms,
  dashboards, on-call rotation, and post-incident follow-up.
- **AWS-native by default** — the internal tooling is a superset of the
  public AWS primitives, so the instincts transfer directly to the
  Lambda / DynamoDB / S3 / event-driven patterns Rafal uses in his own
  projects now.
- **Deployment discipline** — staged rollouts, automated rollback on
  alarm, and change being deliberate rather than continuous by default.
  This is where his "dev and prod are separated from day one" habit
  comes from.
- **Code review culture** — high bar on correctness, operational safety,
  and readability; giving and receiving detailed review.

Concrete architecture (languages, service types, data stores, scale
figures) is to be filled in for Phase 8, kept within what is
appropriate to share publicly.
