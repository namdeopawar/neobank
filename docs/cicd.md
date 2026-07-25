# CI/CD Guide

NeoBank ships three equivalent CI/CD pipelines — pick whichever matches your training environment. All three implement the same stage sequence:

```
test → security scan → build & push images → deploy dev → deploy staging → deploy prod
```

---

## GitHub Actions (primary, live)

**File:** `.github/workflows/ci.yml`  
**Registry:** GitHub Container Registry (`ghcr.io/namdeopawar/neobank/<service>`)  
**Status:** Fully working — tests ✓, security scan ✓, image builds ✓

### Pipeline stages

| Stage | Trigger | What it does |
|---|---|---|
| Test (3 parallel jobs) | Every push | `npm ci && jest`, `go test ./... -race`, `pytest` |
| Security scan | After tests pass | Trivy filesystem scan + Snyk dependency audit |
| Build & Push (5 matrix) | Push to `main`/`develop` | Multi-arch (`linux/amd64` + `linux/arm64`) Docker build, pushes to ghcr.io |
| Deploy dev | Push to `develop` | `kubectl kustomize overlays/dev \| kubectl apply` |
| Deploy staging | Push to `main` | `kubectl kustomize overlays/staging \| kubectl apply` |
| Deploy production | Tag `v*` | Blue/Green via `./scripts/deploy-blue-green.sh` + GitHub Release |

### Image tags produced

Each build pushes three tags to ghcr.io:
- `sha-<short-sha>` — immutable, per-commit
- `main` or `develop` — branch tip, mutable
- `v1.2.3` and `v1.2` — on version tags

### Required secrets

Go to **GitHub → Settings → Secrets → Actions** and add:

| Secret | Required | Value |
|---|---|---|
| `KUBE_CONFIG_DEV` | For deploy-dev job | `base64 -i ~/.kube/config \| tr -d '\n'` |
| `KUBE_CONFIG_STAGING` | For deploy-staging job | Same, for staging cluster |
| `KUBE_CONFIG_PROD` | For deploy-production job | Same, for prod cluster |
| `SNYK_TOKEN` | Optional | From snyk.io — step has `continue-on-error: true` |
| `GITHUB_TOKEN` | Auto-provided | Powers ghcr.io image push — no setup needed |

**Docker Hub credentials are not needed** — images go to `ghcr.io`, authenticated via `GITHUB_TOKEN`.

### Set a kubeconfig secret

```bash
# Encode your kubeconfig
KUBECONFIG_B64=$(base64 -i ~/.kube/config | tr -d '\n')

# Set via gh CLI
GH_TOKEN=<your-token> gh secret set KUBE_CONFIG_STAGING \
  --repo namdeopawar/neobank \
  --body "$KUBECONFIG_B64"
```

For CI to actually reach your cluster, the cluster must be publicly reachable (cloud provider) or you must use a self-hosted runner on the same network.

### PR quality checks

**File:** `.github/workflows/pr-checks.yml` (triggered on PRs to `main`/`develop`)

| Check | Tool |
|---|---|
| Commit message lint | `wagoid/commitlint-github-action` |
| Dockerfile lint | `hadolint` |
| K8s manifest validation | `kubeval` |
| Secret detection | `reviewdog/action-detect-secrets` |
| PR size warning | Custom script (warns if >2000 lines) |

### Debug a failed run

```bash
gh run list --limit 10
gh run view <run-id> --log-failed
gh run rerun <run-id> --failed
```

### Known CI quirks fixed in this repo

| Problem | Fix applied |
|---|---|
| `missing go.sum entry` on runner | `GOFLAGS: -mod=mod` + `GONOSUMCHECK: "*"` in go test env |
| Auth Jest: `Cannot use import statement` | ts-jest transform config added to package.json |
| Auth Jest: `Cannot find name 'describe'` | `@types/jest` added to devDependencies |
| DB connection in tests | `bootstrap()` in index.ts guarded with `NODE_ENV !== 'test'` |
| go.sum version mismatch | Generate with `golang:1.21-alpine` Docker container, not local Go |
| `npm ci` fails (no lockfile) | `package-lock.json` generated and committed |

---

## GitLab CI

**File:** `cicd/gitlab/.gitlab-ci.yml`

### Required CI/CD variables

Go to **GitLab → Project → Settings → CI/CD → Variables:**

| Variable | Purpose |
|---|---|
| `CI_REGISTRY_USER` | GitLab Container Registry user |
| `CI_REGISTRY_PASSWORD` | Registry password / personal access token |
| `KUBE_CONFIG` | base64-encoded kubeconfig |
| `SNYK_TOKEN` | Snyk auth token |
| `SLACK_WEBHOOK_URL` | Slack notification webhook |

### YAML anchors

The GitLab file uses anchors to avoid repetition across test jobs:

```yaml
.go_test_template: &go_test_template
  image: golang:1.21
  before_script:
    - cd services/account-service
  cache:
    key: go-${CI_COMMIT_REF_SLUG}
    paths: [vendor/]

account_test:
  <<: *go_test_template   # merges the template into this job
  script:
    - go test ./...
```

### Common GitLab failures

| Error | Cause | Fix |
|---|---|---|
| `Couldn't connect to Docker daemon` | DinD not configured | Add `services: [docker:dind]` and `DOCKER_HOST: tcp://docker:2376` |
| Pipeline stuck on `pending` | No runner available | Register a runner: `gitlab-runner register` |
| `needs` job not found | Wrong job name in `needs:` | Names must match exactly including case |

---

## Jenkins

**File:** `cicd/jenkins/Jenkinsfile`

Jenkins uses Kubernetes pod agents — each build stage runs inside a pod on your K8s cluster.

### Required credentials

Add at **Jenkins → Manage Jenkins → Credentials → Global:**

| ID | Kind | Content |
|---|---|---|
| `docker-hub-credentials` | Username/Password | Docker Hub login |
| `github-token` | Secret text | GitHub PAT with repo access |
| `kube-config` | Secret file | `~/.kube/config` |
| `slack-webhook` | Secret text | Slack incoming webhook URL |

### Set up Kubernetes plugin

```bash
# Jenkins must be able to create pods in your cluster
kubectl create clusterrolebinding jenkins \
  --clusterrole=cluster-admin \
  --serviceaccount=jenkins:jenkins
```

### Common Jenkins failures

| Error | Cause | Fix |
|---|---|---|
| `podTemplate: Agent not found` | K8s plugin misconfigured | Jenkins → Cloud → Kubernetes — check connection |
| `credentialsId ... not found` | Wrong credential ID | IDs must match the table above exactly |
| Stage skipped unexpectedly | `when { branch ... }` not matching | Check branch name: `main` vs `master` |

---

## ArgoCD (GitOps)

**File:** `infra/argocd/application.yaml`

ArgoCD watches the repository and automatically applies changes to the cluster when commits land on `main`.

### Install and access

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Get initial admin password
kubectl get secret argocd-initial-admin-secret -n argocd \
  -o jsonpath="{.data.password}" | base64 -d && echo

# Port-forward to access UI
kubectl port-forward svc/argocd-server -n argocd 8443:443
```

### Sync and rollback

```bash
# Force sync (re-apply current git state)
argocd app sync neobank-production

# View sync history
argocd app history neobank-production

# Roll back to a specific revision
argocd app rollback neobank-production <revision-id>
```

### Common ArgoCD issues

| Error | Cause | Fix |
|---|---|---|
| `ComparisonError: failed to load` | Kustomize/Helm rendering error | Run `kubectl kustomize path/` locally to debug |
| App stuck in `Progressing` | Pod not starting | Check `kubectl logs -n neobank` |
| `OutOfSync` not resolving | Drift from live state | Check if something modified the resource outside ArgoCD |
| Sync ignored on push | Webhook not configured | Add GitHub webhook → ArgoCD server `/api/webhook` |

---

## Image registry reference

| Registry | Used by | Path |
|---|---|---|
| `ghcr.io/namdeopawar/neobank/<service>` | GitHub Actions | Auto-authenticated via `GITHUB_TOKEN` |
| `namdeopawar/neobank-<service>` | Docker Hub | Manual pushes only (initial setup) |

Pull a CI-built image locally:
```bash
docker pull ghcr.io/namdeopawar/neobank/auth-service:main
```
