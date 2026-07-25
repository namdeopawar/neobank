#!/bin/bash
set -euo pipefail

# NeoBank Kubernetes Setup Script
# Sets up a local K8s cluster (minikube or kind) for training

CLUSTER_TYPE="${1:-minikube}"
CLUSTER_NAME="neobank-training"

log() { echo "🏛  [K8s Setup] $*"; }
error() { log "ERROR: $*" >&2; exit 1; }

setup_minikube() {
    log "Setting up Minikube cluster: ${CLUSTER_NAME}"

    command -v minikube >/dev/null 2>&1 || error "minikube not installed. Get it at https://minikube.sigs.k8s.io/"

    minikube start \
        --profile="${CLUSTER_NAME}" \
        --cpus=4 \
        --memory=8g \
        --disk-size=30g \
        --driver=docker \
        --kubernetes-version=v1.28.0 \
        --addons=ingress,metrics-server,dashboard

    minikube profile "${CLUSTER_NAME}"
    log "✅ Minikube cluster ready"
    log "   Dashboard: minikube dashboard --profile=${CLUSTER_NAME}"
}

setup_kind() {
    log "Setting up Kind cluster: ${CLUSTER_NAME}"

    command -v kind >/dev/null 2>&1 || error "kind not installed. Get it at https://kind.sigs.k8s.io/"

    cat <<EOF | kind create cluster --name="${CLUSTER_NAME}" --config=-
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
    kubeadmConfigPatches:
      - |
        kind: InitConfiguration
        nodeRegistration:
          kubeletExtraArgs:
            node-labels: "ingress-ready=true"
    extraPortMappings:
      - containerPort: 80
        hostPort: 8080
        protocol: TCP
      - containerPort: 443
        hostPort: 8443
        protocol: TCP
  - role: worker
  - role: worker
EOF

    # Install Ingress NGINX
    kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
    kubectl wait --namespace ingress-nginx \
        --for=condition=ready pod \
        --selector=app.kubernetes.io/component=controller \
        --timeout=90s

    log "✅ Kind cluster ready"
}

install_tools() {
    log "Installing cluster tools..."

    # Install metrics-server
    kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml || true

    # Install Prometheus stack
    if command -v helm >/dev/null 2>&1; then
        helm repo add prometheus-community https://prometheus-community.github.io/helm-charts 2>/dev/null || true
        helm repo update
        kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
        helm upgrade --install kube-prometheus prometheus-community/kube-prometheus-stack \
            --namespace monitoring \
            --set grafana.adminPassword=neobank_grafana \
            --set prometheus.prometheusSpec.scrapeInterval=15s \
            --wait --timeout=5m || log "⚠️  Prometheus install failed - continue manually"
        log "✅ Prometheus stack installed (http://localhost:3000 via port-forward)"
    fi

    # Apply NeoBank manifests
    log "Applying NeoBank Kubernetes manifests..."
    kubectl apply -k infra/kubernetes/base/ || log "⚠️  Some manifests may fail without images - build first"
}

print_next_steps() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║           🏛  NeoBank K8s Training Environment              ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║  Cluster: ${CLUSTER_NAME}                                   "
    echo "║                                                              ║"
    echo "║  Next steps:                                                 ║"
    echo "║                                                              ║"
    echo "║  1. Build and push images:                                   ║"
    echo "║     docker build -t neobank/auth-service:dev services/auth-service"
    echo "║     minikube image load neobank/auth-service:dev             ║"
    echo "║                                                              ║"
    echo "║  2. Deploy with Kustomize:                                   ║"
    echo "║     kubectl apply -k infra/kubernetes/overlays/dev/          ║"
    echo "║                                                              ║"
    echo "║  3. Deploy with Helm:                                        ║"
    echo "║     helm install neobank infra/helm/neobank/                 ║"
    echo "║                                                              ║"
    echo "║  4. Use ArgoCD (GitOps):                                     ║"
    echo "║     kubectl apply -f infra/argocd/application.yaml          ║"
    echo "║                                                              ║"
    echo "║  Port forwarding:                                            ║"
    echo "║     kubectl port-forward svc/auth-service 3001:3001 -n neobank"
    echo "║     kubectl port-forward svc/frontend 3000:80 -n neobank   ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
}

case "${CLUSTER_TYPE}" in
    minikube)  setup_minikube ;;
    kind)      setup_kind ;;
    *)         error "Unknown cluster type: ${CLUSTER_TYPE}. Use 'minikube' or 'kind'" ;;
esac

install_tools
print_next_steps
