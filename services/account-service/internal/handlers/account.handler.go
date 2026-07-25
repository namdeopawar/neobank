package handlers

import (
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/neobank/account-service/internal/models"
	"github.com/neobank/account-service/internal/repository"
	"github.com/rs/zerolog/log"
)

type AccountHandler struct {
	repo *repository.AccountRepository
}

func NewAccountHandler(repo *repository.AccountRepository) *AccountHandler {
	return &AccountHandler{repo: repo}
}

func (h *AccountHandler) CreateAccount(c *gin.Context) {
	var req models.CreateAccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	account, err := h.repo.Create(c.Request.Context(), &req)
	if err != nil {
		log.Error().Err(err).Msg("Failed to create account")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create account"})
		return
	}

	c.JSON(http.StatusCreated, account)
}

func (h *AccountHandler) GetAccount(c *gin.Context) {
	id := c.Param("id")
	account, err := h.repo.GetByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch account"})
		return
	}
	if account == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Account not found"})
		return
	}
	c.JSON(http.StatusOK, account)
}

func (h *AccountHandler) GetCustomerAccounts(c *gin.Context) {
	customerID := c.Param("customerId")
	accounts, err := h.repo.GetByCustomerID(c.Request.Context(), customerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch accounts"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"accounts": accounts, "total": len(accounts)})
}

func (h *AccountHandler) ListAccounts(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "List accounts with pagination - implement as needed"})
}

func (h *AccountHandler) UpdateAccountStatus(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Status models.AccountStatus `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.repo.UpdateStatus(c.Request.Context(), id, req.Status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Account status updated"})
}

func (h *AccountHandler) GetBalance(c *gin.Context) {
	id := c.Param("id")
	account, err := h.repo.GetByID(c.Request.Context(), id)
	if err != nil || account == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Account not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"accountId":        account.ID,
		"balance":          account.Balance,
		"availableBalance": account.AvailableBalance,
		"holdAmount":       account.HoldAmount,
		"currency":         account.Currency,
	})
}

func (h *AccountHandler) FreezeAccount(c *gin.Context) {
	id := c.Param("id")
	if err := h.repo.UpdateStatus(c.Request.Context(), id, models.AccountStatusFrozen); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Account frozen", "accountId": id})
}

func (h *AccountHandler) UnfreezeAccount(c *gin.Context) {
	id := c.Param("id")
	if err := h.repo.UpdateStatus(c.Request.Context(), id, models.AccountStatusActive); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Account unfrozen", "accountId": id})
}

func (h *AccountHandler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":    "healthy",
		"service":   "account-service",
		"version":   getEnv("APP_VERSION", "1.0.0"),
		"timestamp": c.Request.Context(),
	})
}

func (h *AccountHandler) Ready(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ready"})
}

func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.FullPath() == "/health" || c.FullPath() == "/health/ready" || c.FullPath() == "/metrics" {
			c.Next()
			return
		}
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization required"})
			c.Abort()
			return
		}
		// In production: validate JWT with auth-service or shared secret
		c.Set("userId", "validated-user-id")
		c.Next()
	}
}

func LoggingMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
		log.Info().
			Str("method", c.Request.Method).
			Str("path", c.Request.URL.Path).
			Int("status", c.Writer.Status()).
			Msg("Request processed")
	}
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}
