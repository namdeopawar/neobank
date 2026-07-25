#!/bin/bash
set -euo pipefail

# NeoBank Local Development Setup Script
# Starts all services with Docker Compose and optionally seeds data

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "${SCRIPT_DIR}")"

log() { echo "🏛  [NeoBank] $*"; }
error() { echo "❌ [NeoBank] $*" >&2; exit 1; }

check_requirements() {
    log "Checking requirements..."
    for cmd in docker curl jq; do
        command -v "${cmd}" >/dev/null 2>&1 || error "${cmd} is required but not installed"
    done

    docker info > /dev/null 2>&1 || error "Docker is not running"
    log "✅ All requirements met"
}

start_services() {
    log "Starting NeoBank services..."
    cd "${PROJECT_DIR}"

    docker compose pull --quiet
    docker compose up -d --build

    log "Waiting for services to be healthy..."
    sleep 15

    local services=(auth-service account-service transaction-service notification-service)
    for svc in "${services[@]}"; do
        local port
        case $svc in
            auth-service)       port=3001 ;;
            account-service)    port=3002 ;;
            transaction-service) port=3003 ;;
            notification-service) port=3004 ;;
        esac

        local retries=20
        while [ $retries -gt 0 ]; do
            if curl -sf "http://localhost:${port}/health" > /dev/null 2>&1; then
                log "✅ ${svc} is ready (port ${port})"
                break
            fi
            retries=$((retries - 1))
            sleep 3
        done

        [ $retries -eq 0 ] && log "⚠️  ${svc} may not be ready yet"
    done
}

seed_data() {
    log "Seeding demo data..."

    # Register demo user
    REGISTER_RESPONSE=$(curl -sf -X POST http://localhost:3001/api/v1/auth/register \
        -H "Content-Type: application/json" \
        -d '{"email":"demo@neobank.com","password":"Demo@1234!","firstName":"Alex","lastName":"Johnson","phone":"+1555000001"}' \
        2>/dev/null || echo '{"message":"already exists"}')

    log "Demo user: demo@neobank.com / Demo@1234!"

    # Login to get token
    LOGIN_RESPONSE=$(curl -sf -X POST http://localhost:3001/api/v1/auth/login \
        -H "Content-Type: application/json" \
        -d '{"email":"demo@neobank.com","password":"Demo@1234!"}' 2>/dev/null || echo '{}')

    TOKEN=$(echo "${LOGIN_RESPONSE}" | jq -r '.accessToken // empty' 2>/dev/null || echo "")
    USER_ID=$(echo "${LOGIN_RESPONSE}" | jq -r '.user.id // empty' 2>/dev/null || echo "")

    if [ -n "${TOKEN}" ] && [ -n "${USER_ID}" ]; then
        log "Creating demo accounts..."

        # Checking account
        curl -sf -X POST http://localhost:3002/api/v1/accounts \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${TOKEN}" \
            -d "{\"customerId\":\"${USER_ID}\",\"accountType\":\"checking\",\"currency\":\"USD\"}" > /dev/null 2>&1 || true

        # Savings account
        curl -sf -X POST http://localhost:3002/api/v1/accounts \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${TOKEN}" \
            -d "{\"customerId\":\"${USER_ID}\",\"accountType\":\"savings\",\"currency\":\"USD\"}" > /dev/null 2>&1 || true

        log "✅ Demo accounts created"
    else
        log "⚠️  Could not create demo accounts (auth may still be initializing)"
    fi
}

print_info() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║           🏛  NeoBank - Local Development Ready          ║"
    echo "╠══════════════════════════════════════════════════════════╣"
    echo "║  Frontend:         http://localhost:3000                 ║"
    echo "║  API Gateway:      http://localhost:8080                 ║"
    echo "║                                                          ║"
    echo "║  Services:                                               ║"
    echo "║    Auth Service:         http://localhost:3001           ║"
    echo "║    Account Service:      http://localhost:3002           ║"
    echo "║    Transaction Service:  http://localhost:3003           ║"
    echo "║    Notification Service: http://localhost:3004           ║"
    echo "║                                                          ║"
    echo "║  Observability:                                          ║"
    echo "║    Prometheus:    http://localhost:9090                  ║"
    echo "║    Grafana:       http://localhost:3001 (admin/neobank_grafana) ║"
    echo "║                                                          ║"
    echo "║  Demo Credentials:                                       ║"
    echo "║    Email:    demo@neobank.com                           ║"
    echo "║    Password: Demo@1234!                                 ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo ""
    echo "  Useful commands:"
    echo "    docker compose logs -f auth-service    # Follow auth logs"
    echo "    docker compose ps                      # Service status"
    echo "    docker compose down -v                 # Stop and clean up"
    echo ""
}

case "${1:-start}" in
    start)
        check_requirements
        start_services
        seed_data
        print_info
        ;;
    stop)
        log "Stopping all services..."
        cd "${PROJECT_DIR}" && docker compose down
        log "✅ All services stopped"
        ;;
    clean)
        log "Removing all containers, networks, and volumes..."
        cd "${PROJECT_DIR}" && docker compose down -v --remove-orphans
        log "✅ Cleanup complete"
        ;;
    seed)
        seed_data
        ;;
    status)
        cd "${PROJECT_DIR}" && docker compose ps
        ;;
    *)
        echo "Usage: $0 [start|stop|clean|seed|status]"
        exit 1
        ;;
esac
