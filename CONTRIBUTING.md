# Contributing

Web Interactive Flow has established its first `v0.1.0` release boundary while remaining an evidence-driven research runtime. Registry publication is evidenced separately from repository source. The first package surface is intentionally narrow and is not a stable-semver guarantee for future releases.

## Workflow

1. Start from the current `main`.
2. Create a focused branch.
3. Inspect the relevant authority documents before editing.
4. Add or update evidence when changing observable behavior.
5. Open a pull request.
6. Resolve review conversations and required checks.
7. Squash merge once the change is accepted.

Direct pushes and force-pushes to `main` are not part of the project workflow.

## Change discipline

Keep each pull request focused on one coherent frontier.

Behavioral changes should identify:

- the semantic claim;
- the observable behavior affected;
- boundary or counterexample cases considered;
- traces/tests added or updated;
- any authority document that must change.

Architecture changes should normally include or update an ADR.

Consumer-facing changes must also check whether `README.md` or `docs/USAGE.md` would become inaccurate. Do not document repository-internal paths as public npm APIs unless the accepted package authority and export map expose them.

## Toolchain and dependencies

Do not add tools, packages, Actions, or permissions merely for convenience.

External GitHub Actions must be pinned to a full-length commit SHA. Workflow permissions should remain least-privilege.

## Claims

Do not describe the project as deterministic, portable, faster, safer, compatible, or production-ready beyond what the repository evidence demonstrates.
