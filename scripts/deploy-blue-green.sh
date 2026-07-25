#!/bin/bash
set -euo pipefail

# NeoBank Blue/Green Deployment Script
# Usage: ./deploy-blue-green.sh <environment> <image-tag>

ENVIRONMENT=${1:?Usage: $0 <environment> <image-tag>}
IMAGE_TAG=${2:?Usage: $0 <environment> <image-tag>}
NAMESPACE="neobank"
REGISTRY="${REGISTRY:-ghcr.io/your-org/neobank}"
SERVICES=(auth-service account-service transaction-service notification-service frontend)
HEALTH_CHECK_RETRIES=30
HEALTH_CHECK_INTERVAL=5

log() { echo "[$(date +'%Y-%m-%dT%H:%M:%S')] $*"; }
error() { log "ERROR: $*" >&2; exit 1; }

determine_active_color() {
    local service=$1
    local color
    color=$(kubectl get service "${service}" -n "${NAMESPACE}" \
        -o jsonpath='{.spec.selector.color}' 2>/dev/null || echo "blue")
    echo "${color}"
}

check_health() {
    local service=$1
    local color=$2
    local retries=$HEALTH_CHECK_RETRIES

    log "Waiting for ${service}-${color} to be healthy..."
    while [ $retries -gt 0 ]; do
        READY=$(kubectl get deployment "${service}-${color}" -n "${NAMESPACE}" \
            -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
        DESIRED=$(kubectl get deployment "${service}-${color}" -n "${NAMESPACE}" \
            -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "1")

        if [ "${READY}" = "${DESIRED}" ] && [ "${DESIRED}" != "0" ]; then
            log "✅ ${service}-${color} is healthy (${READY}/${DESIRED} replicas)"
            return 0
        fi

        log "⏳ ${service}-${color}: ${READY:-0}/${DESIRED} ready. Retrying in ${HEALTH_CHECK_INTERVAL}s... (${retries} left)"
        sleep $HEALTH_CHECK_INTERVAL
        retries=$((retries - 1))
    done

    error "❌ ${service}-${color} failed to become healthy"
}

switch_traffic() {
    local service=$1
    local new_color=$2

    log "Switching ${service} traffic to ${new_color}..."
    kubectl patch service "${service}" -n "${NAMESPACE}" \
        -p "{\"spec\":{\"selector\":{\"app\":\"${service}\",\"color\":\"${new_color}\"}}}"
    log "✅ Traffic switched to ${service}-${new_color}"
}

cleanup_old_deployment() {
    local service=$1
    local old_color=$2

    log "Scaling down old deployment ${service}-${old_color}..."
    kubectl scale deployment "${service}-${old_color}" -n "${NAMESPACE}" --replicas=0 || true
    log "✅ Old deployment scaled down: ${service}-${old_color}"
}

main() {
    log "🚀 Starting Blue/Green deployment"
    log "   Environment: ${ENVIRONMENT}"
    log "   Image Tag:   ${IMAGE_TAG}"
    log "   Namespace:   ${NAMESPACE}"
    log "   Services:    ${SERVICES[*]}"

    # Verify kubectl is configured
    kubectl cluster-info > /dev/null 2>&1 || error "kubectl not configured"

    for service in "${SERVICES[@]}"; do
        log "──────────────────────────────────────────"
        log "Deploying ${service}..."

        ACTIVE_COLOR=$(determine_active_color "${service}")
        if [ "${ACTIVE_COLOR}" = "blue" ]; then
            NEW_COLOR="green"
        else
            NEW_COLOR="blue"
        fi

        log "Active: ${ACTIVE_COLOR} → New: ${NEW_COLOR}"

        # Deploy new color
        kubectl set image deployment/"${service}-${NEW_COLOR}" \
            "${service}=${REGISTRY}/${service}:${IMAGE_TAG}" \
            -n "${NAMESPACE}" || {
            # Create new color deployment if doesn't exist
            kubectl get deployment "${service}" -n "${NAMESPACE}" -o json | \
                jq --arg color "${NEW_COLOR}" \
                   --arg image "${REGISTRY}/${service}:${IMAGE_TAG}" \
                   '.metadata.name = (.metadata.name + "-" + $color) |
                    .spec.template.metadata.labels.color = $color |
                    .spec.selector.matchLabels.color = $color |
                    .spec.template.spec.containers[0].image = $image' | \
                kubectl apply -f - -n "${NAMESPACE}"
        }

        # Wait for health
        check_health "${service}" "${NEW_COLOR}"

        # Switch traffic
        switch_traffic "${service}" "${NEW_COLOR}"

        # Cleanup old after brief wait
        sleep 10
        cleanup_old_deployment "${service}" "${ACTIVE_COLOR}"
    done

    log "──────────────────────────────────────────"
    log "🎉 Blue/Green deployment completed successfully!"
    log "   All services running: ${IMAGE_TAG}"
}

main "$@"
