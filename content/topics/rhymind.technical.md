<!-- SEED CONTENT (Phase 2). Real detail lands in Phase 8. -->
# Rhymind — technical layer

An AWS-native build, architected for the same constraints Rafal applies
everywhere: no always-on compute, pay-per-use storage, and a deploy
that is deliberate rather than automatic.

Shape of it:

- **Serverless compute** — Lambda (or equivalent event-driven compute),
  no servers to patch, no idle cost.
- **Managed, on-demand storage** — DynamoDB and/or S3, chosen for
  "scales to zero" rather than raw performance.
- **Infrastructure as code** — the stack is reproducible from a
  definition, not clicked together in a console.
- **Separate dev and prod** — separate stacks and data, a lesson carried
  into this portfolio from day one.

The exact services, data model, any AI/ML component, and the frontend
stack are to be filled in for Phase 8.
