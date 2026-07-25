---
description: Debug CI/CD pipelines for NeoBank — GitHub Actions, GitLab CI, Jenkins, and ArgoCD
---

# NeoBank CI/CD Debugging

## GitHub Actions (`.github/workflows/ci.yml`)

### Run locally with `act`

```bash
brew install act

# Run the full CI pipeline
act push --secret-file .env.ci

# Run just the test job
act push -j test

# Run with a specific event
act pull_request
```

### Required repository secrets

Go to GitHub → Settings → Secrets → Actions and add:

| Secret | Value |
|---|---|
| `DOCKER_USERNAME` | Docker Hub username |
| `DOCKER_PASSWORD` | Docker Hub token (not password) |
| `KUBE_CONFIG` | `base64 -w0 ~/.kube/config` |
| `SNYK_TOKEN` | From snyk.io account |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook |

### Common GitHub Actions failures

| Error | Cause | Fix |
|---|---|---|
| `Error: DOCKER_USERNAME not set` | Secret missing | Add to repo secrets |
| `manifest unknown` | Wrong image tag in deploy step | Check `GITHUB_SHA` vs tag format |
| `unauthorized: authentication required` | Docker Hub rate limit | Use `docker/login-action` before build steps |
| `no matches for kind Deployment` | Wrong kubectl context | Verify `KUBE_CONFIG` secret is a valid kubeconfig |
| Matrix job fails on `linux/arm64` | QEMU not set up | Add `docker/setup-qemu-action` step before buildx |
| `npm ci` fails | No package-lock.json | Change to `npm install` in the workflow step |

### Inspect a failed run

```bash
gh run list --limit 10
gh run view <run-id> --log-failed
gh run rerun <run-id> --failed
```

---

## GitLab CI (`cicd/gitlab/.gitlab-ci.yml`)

### Required CI/CD variables

Go to GitLab → Project → Settings → CI/CD → Variables:

| Variable | Purpose |
|---|---|
| `CI_REGISTRY_USER` | GitLab Container Registry user |
| `CI_REGISTRY_PASSWORD` | Registry password / personal access token |
| `KUBE_CONFIG` | base64-encoded kubeconfig |
| `SNYK_TOKEN` | Snyk auth token |
| `SLACK_WEBHOOK_URL` | Slack notification webhook |

### Understanding YAML anchors

The GitLab CI file uses anchors to avoid repetition:

```yaml
.go_test_template: &go_test_template
  image: golang:1.21
  before_script:
    - cd services/account-service
  cache:
    key: go-${CI_COMMIT_REF_SLUG}
    paths: [vendor/]

account_test:
  <<: *go_test_template
  script:
    - go test ./...
```

`<<: *anchor_name` merges the anchor's content into the current job — this is how `before_script`, `cache`, and `image` are shared across test jobs.

### Common GitLab CI failures

| Error | Cause | Fix |
|---|---|---|
| `Couldn't connect to Docker daemon` | DinD not configured | Add `services: [docker:dind]` and `DOCKER_HOST: tcp://docker:2376` |
| `image not found` in registry | Registry login missing | Add registry login to `before_script` |
| Pipeline stuck on `pending` | No runner available | Register a runner: `gitlab-runner register` |
| `needs` job not found | Wrong job name in `needs:` | Names must match exactly including case |

---

## Jenkins (`cicd/jenkins/Jenkinsfile`)

### Required Jenkins credentials

Add these at Jenkins → Manage Jenkins → Credentials → Global:

| ID | Kind | Content |
|---|---|---|
| `docker-hub-credentials` | Username/Password | Docker Hub login |
| `github-token` | Secret text | GitHub PAT with repo access |
| `kube-config` | Secret file | ~/.kube/config |
| `slack-webhook` | Secret text | Slack incoming webhook URL |

### Kubernetes pod agents

The Jenkinsfile uses pod agents to run builds inside K8s. Verify:

```bash
# Check Jenkins can reach K8s
kubectl get pods -n jenkins
kubectl get serviceaccount jenkins -n jenkins   # must exist

# RBAC needed for pod agent:
kubectl create clusterrolebinding jenkins \
  --clusterrole=cluster-admin \
  --serviceaccount=jenkins:jenkins
```

### Common Jenkins failures

| Error | Cause | Fix |
|---|---|---|
| `podTemplate: Agent not found` | K8s plugin misconfigured | Check Jenkins → Cloud → Kubernetes connection |
| `credentialsId ... not found` | Wrong credential ID | Must match IDs listed above exactly |
| `permission denied` on docker socket | Pod can't access Docker | Use kaniko or configure DinD sidecar |
| Stage skipped unexpectedly | `when { branch ... }` not matching | Check branch name format: `main` vs `master` |
| Parallel stages failing silently | `failFast: false` is default | Add `failFast: true` to fail early |

### Trigger / run

```bash
# Trigger via Jenkins CLI
java -jar jenkins-cli.jar -s http://localhost:8080 build neobank/main -p DEPLOY_ENV=staging

# Or via GitHub webhook — configure in GitHub repo → Settings → Webhooks
```

---

## ArgoCD

### Install and access

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

kubectl port-forward svc/argocd-server -n argocd 8443:443
# Login:
kubectl get secret argocd-initial-admin-secret -n argocd \
  -o jsonpath="{.data.password}" | base64 -d && echo
```

### Sync and rollback commands

```bash
# Sync (pull latest from git and apply)
argocd app sync neobank-production

# Check sync status
argocd app get neobank-production
kubectl get application neobank-production -n argocd -o yaml

# Rollback to a previous revision
argocd app history neobank-production
argocd app rollback neobank-production <revision-id>

# Force hard refresh (ignore cache)
argocd app sync neobank-production --force
```

### Common ArgoCD failures

| Error | Cause | Fix |
|---|---|---|
| `ComparisonError: failed to load` | Kustomize/Helm error | Run `kubectl apply --dry-run=client -k path/` locally |
| App stuck in `Progressing` | Pod not starting (CrashLoopBackOff) | Check `kubectl logs -n neobank` |
| `OutOfSync` not resolving after sync | Drift with live state | Check if something modifies the resource outside ArgoCD |
| `ResourceNotFound` for CRD | CRD not installed | Install prerequisites (e.g. cert-manager) before ArgoCD app |
| Sync ignored on push | Webhook not configured | Add GitHub webhook pointing to ArgoCD server `/api/webhook` |

---

## Common failures across all pipelines

| Symptom | Root cause | Fix |
|---|---|---|
| Docker build fails (`npm ci`) | No package-lock.json | Change to `npm install` in Dockerfile |
| Docker build fails (`go.sum missing`) | Go module file missing | Add `ENV GOFLAGS=-mod=mod`, copy only go.mod |
| Image push fails (rate limit) | Docker Hub unauthenticated | Log in with `docker login` or use token |
| K8s deploy fails (ImagePullBackOff) | Image tag not pushed | Ensure build step runs before deploy step |
| Test fails on CI but passes locally | Port conflict or missing env | Set `DB_HOST`, `REDIS_URL` in CI environment |
| Deploy succeeds but app errors | Secrets not updated in K8s | `kubectl get secret -n neobank` and verify values |
