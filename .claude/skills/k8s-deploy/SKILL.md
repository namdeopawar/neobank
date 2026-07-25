---
description: Deploy NeoBank to Kubernetes using Kustomize, Helm, or ArgoCD
---

# NeoBank Kubernetes Deployment

## Step 0: Build and load images

For local cluster (minikube):
```bash
docker compose build

for svc in auth-service account-service transaction-service notification-service frontend; do
  docker build -t neobank/$svc:dev services/$svc/
  minikube image load neobank/$svc:dev --profile=neobank-training
done
```

For kind:
```bash
for svc in auth-service account-service transaction-service notification-service frontend; do
  docker build -t neobank/$svc:dev services/$svc/
  kind load docker-image neobank/$svc:dev --name=neobank-training
done
```

## Method 1: Raw Kustomize

```bash
kubectl apply -k infra/kubernetes/overlays/dev/       # 1 replica
kubectl apply -k infra/kubernetes/overlays/staging/   # 2 replicas
kubectl apply -k infra/kubernetes/overlays/prod/      # 3 replicas

kubectl rollout status deployment/auth-service -n neobank
kubectl rollout status deployment/account-service -n neobank
kubectl rollout status deployment/transaction-service -n neobank
```

## Method 2: Helm

```bash
helm install neobank infra/helm/neobank/ \
  --namespace neobank --create-namespace \
  --values infra/helm/neobank/values.yaml

helm upgrade neobank infra/helm/neobank/ --namespace neobank

# Override image tags per service
helm upgrade neobank infra/helm/neobank/ --namespace neobank \
  --set authService.image.tag=v1.2.0 \
  --set transactionService.image.tag=v1.2.0

helm history neobank -n neobank
helm rollback neobank 1 -n neobank
```

## Method 3: GitOps with ArgoCD

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl apply -f infra/argocd/application.yaml

# Access UI
kubectl port-forward svc/argocd-server -n argocd 8443:443
kubectl get secret argocd-initial-admin-secret -n argocd -o jsonpath="{.data.password}" | base64 -d

# Sync / rollback
argocd app sync neobank-production
argocd app rollback neobank-production <revision-id>
```

## Method 4: Blue/Green

```bash
./scripts/deploy-blue-green.sh production v1.2.0
# Deploys new color, waits for health, switches Service selector, scales down old color
```

## Method 5: Canary

```bash
./scripts/deploy-canary.sh auth-service v1.2.0 --auto-promote   # fully automatic
./scripts/deploy-canary.sh auth-service v1.2.0                  # manual approval per stage
# Traffic shift: 10% → 25% → 50% → 100%
```

## Common kubectl commands

```bash
kubectl get pods -n neobank
kubectl get hpa -n neobank
kubectl logs -f deployment/auth-service -n neobank
kubectl exec -it deployment/auth-service -n neobank -- sh
kubectl port-forward svc/auth-service 3001:3001 -n neobank
kubectl port-forward svc/frontend 3000:80 -n neobank
kubectl scale deployment auth-service --replicas=5 -n neobank
kubectl get events -n neobank --sort-by='.lastTimestamp'
```

## Cluster setup (first time)

```bash
./scripts/k8s-setup.sh minikube   # 4 CPU, 8GB RAM, metrics-server + ingress addon
./scripts/k8s-setup.sh kind       # 1 control-plane + 2 workers + ingress-nginx
```
