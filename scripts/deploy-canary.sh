#!/bin/bash
set -euo pipefail

# NeoBank Canary Deployment Script
# Gradually shifts traffic: 10% → 25% → 50% → 100%
# Usage: ./deploy-canary.sh <service> <new-image-tag> [--auto-promote]

SERVICE=${1:?Usage: $0 <service> <image-tag> [--auto-promote]}
IMAGE_TAG=${2:?Usage: $0 <service> <image-tag> [--auto-promote]}
AUTO_PROMOTE=${3:-"false"}
NAMESPACE="neobank"
REGISTRY="${REGISTRY:-ghcr.io/your-org/neobank}"
CANARY_NAME="${SERVICE}-canary"
STAGES=(10 25 50 100)
ANALYSIS_DURATION=60  # seconds per stage

log() { echo "[$(date +'%Y-%m-%dT%H:%M:%S')] $*"; }
error() { log "ERROR: $*" >&2; exit 1; }

get_error_rate() {
    local svc=$1
    # In production: query Prometheus
    # RATE=$(curl -s "http://prometheus:9090/api/v1/query?query=rate(http_requests_total{job='${svc}',status=~'5..'}[1m])/rate(http_requests_total{job='${svc}'}[1m])" | jq '.data.result[0].value[1]')
    echo "0.001"  # Simulated 0.1% error rate for training
}

check_canary_health() {
    local svc=$1
    local error_rate
    error_rate=$(get_error_rate "${svc}")

    log "Canary error rate: ${error_rate}"
    if (( $(echo "$error_rate > 0.05" | bc -l) )); then
        error "❌ Canary error rate ${error_rate} exceeds threshold 5%"
    fi
    log "✅ Canary health check passed (error rate: ${error_rate})"
}

rollback_canary() {
    local svc=$1
    log "🔄 Rolling back canary for ${svc}..."
    kubectl scale deployment "${CANARY_NAME}" -n "${NAMESPACE}" --replicas=0 || true
    kubectl delete deployment "${CANARY_NAME}" -n "${NAMESPACE}" 2>/dev/null || true
    log "Rollback complete"
}

main() {
    log "🐦 Starting Canary Deployment"
    log "   Service:   ${SERVICE}"
    log "   Image:     ${REGISTRY}/${SERVICE}:${IMAGE_TAG}"
    log "   Strategy:  ${STAGES[*]}%"

    kubectl cluster-info > /dev/null 2>&1 || error "kubectl not configured"

    # Get current stable replica count
    STABLE_REPLICAS=$(kubectl get deployment "${SERVICE}" -n "${NAMESPACE}" \
        -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "3")

    log "Stable replicas: ${STABLE_REPLICAS}"

    # Create canary deployment
    log "Creating canary deployment..."
    kubectl get deployment "${SERVICE}" -n "${NAMESPACE}" -o json | \
        jq --arg name "${CANARY_NAME}" \
           --arg image "${REGISTRY}/${SERVICE}:${IMAGE_TAG}" \
           --argjson replicas 1 \
           '.metadata.name = $name |
            .metadata.labels.track = "canary" |
            .spec.replicas = $replicas |
            .spec.template.metadata.labels.track = "canary" |
            .spec.template.spec.containers[0].image = $image |
            del(.status) | del(.metadata.resourceVersion) | del(.metadata.uid)' | \
        kubectl apply -f - -n "${NAMESPACE}"

    kubectl rollout status deployment/"${CANARY_NAME}" -n "${NAMESPACE}" --timeout=120s || {
        rollback_canary "${SERVICE}"
        error "Canary failed to start"
    }

    trap 'rollback_canary ${SERVICE}' ERR

    for stage in "${STAGES[@]}"; do
        log "──────────────────────────────────────────"

        if [ "${stage}" -eq 100 ]; then
            log "🎯 Promoting canary to 100% (stable)"
            kubectl set image deployment/"${SERVICE}" \
                "${SERVICE}=${REGISTRY}/${SERVICE}:${IMAGE_TAG}" \
                -n "${NAMESPACE}"
            kubectl rollout status deployment/"${SERVICE}" -n "${NAMESPACE}" --timeout=300s
            rollback_canary "${SERVICE}"
            log "🎉 Canary promotion complete!"
            break
        fi

        CANARY_REPLICAS=$(( (STABLE_REPLICAS * stage + 99) / 100 ))
        STABLE_NEW=$(( STABLE_REPLICAS - CANARY_REPLICAS ))
        [ "${STABLE_NEW}" -lt 1 ] && STABLE_NEW=1

        log "📊 Stage ${stage}%: canary=${CANARY_REPLICAS}, stable=${STABLE_NEW}"
        kubectl scale deployment "${CANARY_NAME}" -n "${NAMESPACE}" --replicas="${CANARY_REPLICAS}"
        kubectl scale deployment "${SERVICE}" -n "${NAMESPACE}" --replicas="${STABLE_NEW}"

        log "Analyzing for ${ANALYSIS_DURATION}s..."
        sleep "${ANALYSIS_DURATION}"
        check_canary_health "${CANARY_NAME}"

        if [ "${AUTO_PROMOTE}" != "--auto-promote" ]; then
            read -r -p "Promote to next stage? [y/N] " confirm
            [[ "${confirm}" =~ ^[Yy]$ ]] || {
                rollback_canary "${SERVICE}"
                error "Promotion cancelled by user"
            }
        fi
    done

    trap - ERR
    log "🎉 Canary deployment completed successfully!"
}

main "$@"
