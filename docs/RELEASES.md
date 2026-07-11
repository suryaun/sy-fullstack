# Releases and Deployments

`main` is the only release branch. Pull requests must use a Conventional Commit
title. The merged title determines whether the workflow creates a semantic tag.

| Pull request title | Result |
| --- | --- |
| `feat: ...` | Minor release tag |
| `fix: ...` or `perf: ...` | Patch release tag |
| `feat!: ...` or `fix!: ...` | Major release tag |
| `docs: ...`, `chore: ...`, `refactor: ...`, `test: ...`, `style: ...`, `ci: ...` | No tag |

The first eligible release is always `v1.0.0`. Each tag is annotated on the pull
request merge commit. The pull request description and commits remain its changelog.

## Test deployment

Run **Deploy tagged release to Cloud Run** manually with `target: test` and a tag such
as `v1.0.0`. The workflow checks out the tag, builds the API and web images, publishes
them under that version in Artifact Registry, resolves immutable digests, and deploys
those digests to the `test` environment. The web image gets its public API URL at
container startup, allowing it to remain environment-neutral.

## Production promotion

After test validation, run the same workflow with the same tag and `target: prod`.
Production does not check out source, build, or push artifacts. It resolves the test
images to their Artifact Registry digests and deploys those exact digests to `prod`.
Protect the GitHub `prod` environment with required reviewers.