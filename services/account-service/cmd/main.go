package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/neobank/account-service/internal/handlers"
	"github.com/neobank/account-service/internal/repository"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

func main() {
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	if os.Getenv("ENV") != "production" {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})
	}

	db, err := repository.NewPostgresDB()
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to database")
	}
	defer db.Close()

	if err := repository.RunMigrations(db); err != nil {
		log.Fatal().Err(err).Msg("Failed to run migrations")
	}

	repo := repository.NewAccountRepository(db)
	handler := handlers.NewAccountHandler(repo)

	if os.Getenv("ENV") == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(handlers.LoggingMiddleware())
	router.Use(handlers.AuthMiddleware())

	v1 := router.Group("/api/v1")
	{
		accounts := v1.Group("/accounts")
		{
			accounts.POST("", handler.CreateAccount)
			accounts.GET("", handler.ListAccounts)
			accounts.GET("/:id", handler.GetAccount)
			accounts.GET("/customer/:customerId", handler.GetCustomerAccounts)
			accounts.PUT("/:id/status", handler.UpdateAccountStatus)
			accounts.GET("/:id/balance", handler.GetBalance)
			accounts.POST("/:id/freeze", handler.FreezeAccount)
			accounts.POST("/:id/unfreeze", handler.UnfreezeAccount)
		}
	}

	router.GET("/health", handler.Health)
	router.GET("/health/ready", handler.Ready)
	router.GET("/metrics", gin.WrapH(promhttp.Handler()))

	srv := &http.Server{
		Addr:         ":" + getEnv("PORT", "3002"),
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Info().Str("port", getEnv("PORT", "3002")).Msg("Account service starting")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("Server failed")
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal().Err(err).Msg("Server forced shutdown")
	}
	log.Info().Msg("Server exited gracefully")
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}
