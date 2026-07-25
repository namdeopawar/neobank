FROM golang:1.21-alpine AS builder
WORKDIR /app
RUN apk add --no-cache git
ENV GOFLAGS=-mod=mod
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -ldflags="-w -s" -o account-service ./cmd/main.go

FROM alpine:3.19
RUN apk add --no-cache wget && addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001 -G appgroup
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /app/account-service /account-service
USER appuser
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD wget -q --tries=1 -O /dev/null http://localhost:3002/health || exit 1
ENTRYPOINT ["/account-service"]
