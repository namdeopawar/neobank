# Kubernetes Deployment Guide

NeoBank provides five deployment approaches. Use this guide to practice each one on your local CKA cluster or any cloud cluster.

---

## Prerequisites

```bash
# Verify cluster is running
kubectl cluster-info
kubectl get nodes

# Create the neobank namespace (all approaches use this)
kubectl create namespace neobank
```

---

## Approach 1 — Raw Kustomize (recommended starting point)

Kustomize lets you maintain a single base set of manifests and patch them per environment without templating languages.

### Directory structure

```
infra/kubernetes/
├── base/                       # Shared manifests for all environments
│   ├── namespace.yaml
│   ├── kustomization.yaml      # Lists all base resources
│   ├── auth/deployment.yaml    # Deployment + Service + HPA
│   ├── account/deployment.yaml
│   ├── transaction/deployment.yaml
│   ├── frontend/deployment.yaml
│   ├── postgres/postgres.yaml
│   ├── redis/redis.yaml
│   └── ingress.yaml
└── overlays/
    ├── dev/kustomization.yaml      # Patches: 1 replica, debug image tags
    ├── staging/kustomization.yaml  # Patches: 2 replicas, staging image tags
    └── prod/kustomization.yaml     # Patches: 3+ replicas, pinned image tags, resource limits
```

### Deploy

```bash
# Preview what will be applied (dry run)
kubectl kustomize infra/kubernetes/overlays/dev/

# Apply
kubectl apply -k infra/kubernetes/overlays/dev/
kubectl apply -k infra/kubernetes/overlays/staging/
kubectl apply -k infra/kubernetes/overlays/prod/

# Verify
kubectl get pods -n neobank
kubectl get svc -n neobank
kubectl get hpa -n neobank
```

### Understanding the manifests

**Deployment** — each service has a Deployment with:
- `readinessProbe` on `/health/ready` — Kubernetes waits for this before sending traffic
- `livenessProbe` on `/health` — Kubernetes restarts the pod if this fails
- Resource requests and limits per environment

**HPA** — each service has a HorizontalPodAutoscaler:
- Scales on CPU (target 65-70%) and memory (target 80%)
- Min replicas: 1 (dev), 2 (staging), 3 (prod)
- Max replicas: 5–10 depending on service

**Ingress** — single Ingress resource routes by path prefix, same as the local Nginx gateway.

---

## Approach 2 — Helm

The Helm chart wraps the same workloads as the Kustomize base, driven entirely by `values.yaml`.

### Chart structure

```
infra/helm/neobank/
├── Chart.yaml          # Name, version, dependencies
├── values.yaml         # Default values (dev-like)
└── templates/          # (Kustomize base converted to Helm templates)
```

### Install and upgrade

```bash
# First install
helm install neobank infra/helm/neobank/ \
  --namespace neobank \
  --create-namespace

# Upgrade (e.g. after changing values.yaml or image tags)
helm upgrade neobank infra/helm/neobank/ \
  --namespace neobank \
  --set authService.image.tag=v1.2.0

# Preview changes before applying
helm diff upgrade neobank infra/helm/neobank/   # requires helm-diff plugin

# Roll back one release
helm rollback neobank

# Check release history
helm history neobank
```

### Common values to override

```yaml
# Override on the command line:
--set global.imageTag=sha-abc1234
--set authService.replicaCount=3
--set postgres.enabled=false        # use external Postgres in prod
```

### Useful Helm commands

```bash
helm list -n neobank           # list releases
helm get values neobank        # show current values
helm template neobank infra/helm/neobank/  # render templates without applying
```

---

## Approach 3 — GitOps with ArgoCD

ArgoCD watches your Git repository and automatically reconciles the cluster state with what's in Git. This is the production-grade approach.

### Concept

```
Git push → ArgoCD detects change → ArgoCD applies to cluster → reports sync status
```

### Setup

```bash
# Install ArgoCD
kubectl create namespace argocd
kubectl apply -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for pods
kubectl wait --for=condition=Ready pod -l app.kubernetes.io/name=argocd-server -n argocd --timeout=120s

# Get admin password
kubectl get secret argocd-initial-admin-secret -n argocd \
  -o jsonpath="{.data.password}" | base64 -d && echo

# Access UI (keep this running in a separate terminal)
kubectl port-forward svc/argocd-server -n argocd 8443:443
# Open: https://localhost:8443
```

### Deploy the NeoBank application

```bash
# This creates the ArgoCD Application resource pointing at the repo
kubectl apply -f infra/argocd/application.yaml

# Watch sync status
argocd app get neobank-production
argocd app sync neobank-production   # force immediate sync
```

### How the Application is configured (`infra/argocd/application.yaml`)

- Source: `https://github.com/namdeopawar/neobank`, path `infra/kubernetes/overlays/staging`
- Sync policy: automated sync on commit to `main`
- Production: automated sync on version tags (`v*`)
- Self-healing: enabled — drift is corrected automatically

---

## Approach 4 — Blue/Green Deployment

Blue/Green runs two complete copies of the stack simultaneously. Traffic switches atomically from the old version (blue) to the new version (green) with zero downtime.

```bash
./scripts/deploy-blue-green.sh production v1.2.0
```

### How it works

```
Step 1: Deploy green (v1.2.0) alongside blue (v1.1.0)
        kubectl apply -f deployment-green.yaml

Step 2: Wait for green to become Ready
        kubectl rollout status deployment/auth-service-green

Step 3: Switch Service selector (atomic — Kubernetes updates iptables instantly)
        kubectl patch service auth-service -p '{"spec":{"selector":{"color":"green"}}}'

Step 4: Scale down blue after 10-second drain
        kubectl scale deployment/auth-service-blue --replicas=0
```

### Rollback

```bash
# If you catch a problem, switch the selector back
kubectl patch service auth-service \
  -p '{"spec":{"selector":{"color":"blue"}}}'
```

---

## Approach 5 — Canary Deployment

Canary sends a small percentage of traffic to the new version, monitors for errors, and gradually increases traffic until fully rolled out.

```bash
./scripts/deploy-canary.sh auth-service v1.2.0 --auto-promote
```

### Traffic steps

```
10% → 25% → 50% → 100%
```
At each step the script checks the error rate (via Prometheus query). If errors exceed threshold, it rolls back automatically.

### Without --auto-promote (manual gate)

```bash
./scripts/deploy-canary.sh auth-service v1.2.0
# At each step, script pauses and asks:
# "Promote to next stage? (y/n)"
```

---

## Local cluster setup

```bash
# Option A: minikube
./scripts/k8s-setup.sh minikube

# Option B: kind (Kubernetes in Docker)
./scripts/k8s-setup.sh kind

# The script configures:
# - Metrics server (required for HPA)
# - Ingress controller
# - Pulls and loads NeoBank images into the cluster
```

### Load local images (avoid registry for inner-loop development)

```bash
# minikube
minikube image load neobank-auth-service:latest --profile=neobank-training

# kind
kind load docker-image neobank-auth-service:latest --name neobank-training
```

---

## Useful kubectl commands for NeoBank

```bash
# Watch all pods
kubectl get pods -n neobank -w

# Check HPA scaling state
kubectl get hpa -n neobank

# Tail logs from a service
kubectl logs -n neobank -l app=auth-service -f

# Exec into a pod
kubectl exec -it -n neobank deployment/auth-service -- sh

# Check resource usage
kubectl top pods -n neobank

# Describe a failing pod
kubectl describe pod -n neobank <pod-name>

# Forward a service port locally
kubectl port-forward -n neobank svc/auth-service 3001:3001

# Check ingress
kubectl get ingress -n neobank
```

---

## Secrets in Kubernetes

The file `infra/kubernetes/base/secrets.yaml` contains plaintext secrets for training convenience. In a real cluster, replace this with one of:

| Tool | Description |
|---|---|
| **Sealed Secrets** | Encrypt secrets with a cluster public key; safe to commit to Git |
| **External Secrets Operator** | Pull secrets from AWS Secrets Manager / GCP Secret Manager / Vault |
| **HashiCorp Vault** | Full secrets management platform with dynamic credentials |

To apply secrets manually in a training cluster:
```bash
kubectl apply -f infra/kubernetes/base/secrets.yaml -n neobank
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Pod in `ImagePullBackOff` | Image not pushed or wrong tag | Check `kubectl describe pod` for the exact image reference |
| Pod in `CrashLoopBackOff` | App crashing at startup | `kubectl logs <pod> --previous` to see the crash |
| Pod `Pending` forever | No node with enough resources | `kubectl describe pod` → Events section; check `kubectl top nodes` |
| HPA not scaling | Metrics server not running | `kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml` |
| Auth 500 on register | DB migrations not run | `kubectl exec -n neobank deployment/auth-service -- node dist/db/migrate.js` |
| Service not reachable | Ingress not configured | Check `kubectl get ingress -n neobank` and ingress controller logs |
