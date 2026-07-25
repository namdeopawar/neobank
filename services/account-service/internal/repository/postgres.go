package repository

import (
	"context"
	"database/sql"
	"fmt"
	"math/rand"
	"os"
	"time"

	_ "github.com/lib/pq"
	"github.com/neobank/account-service/internal/models"
	"github.com/rs/zerolog/log"
)

func NewPostgresDB() (*sql.DB, error) {
	dsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		getEnv("DB_HOST", "localhost"),
		getEnv("DB_PORT", "5432"),
		getEnv("DB_USER", "neobank"),
		getEnv("DB_PASSWORD", "neobank_secret"),
		getEnv("DB_NAME", "neobank_accounts"),
		getEnv("DB_SSLMODE", "disable"),
	)

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, err
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(25)
	db.SetConnMaxLifetime(5 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return db, nil
}

func RunMigrations(db *sql.DB) error {
	migration := `
		CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

		CREATE TABLE IF NOT EXISTS accounts (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			customer_id UUID NOT NULL,
			account_number VARCHAR(20) UNIQUE NOT NULL,
			account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('checking', 'savings', 'loan')),
			currency VARCHAR(3) NOT NULL DEFAULT 'USD',
			balance DECIMAL(20,4) NOT NULL DEFAULT 0,
			available_balance DECIMAL(20,4) NOT NULL DEFAULT 0,
			hold_amount DECIMAL(20,4) NOT NULL DEFAULT 0,
			status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'closed', 'suspended')),
			iban VARCHAR(34),
			routing_number VARCHAR(9) NOT NULL,
			interest_rate DECIMAL(5,4) DEFAULT 0,
			opened_at TIMESTAMPTZ DEFAULT NOW(),
			updated_at TIMESTAMPTZ DEFAULT NOW()
		);

		CREATE INDEX IF NOT EXISTS idx_accounts_customer_id ON accounts(customer_id);
		CREATE INDEX IF NOT EXISTS idx_accounts_account_number ON accounts(account_number);
		CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);

		CREATE TABLE IF NOT EXISTS account_audit (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			account_id UUID NOT NULL REFERENCES accounts(id),
			action VARCHAR(50) NOT NULL,
			old_balance DECIMAL(20,4),
			new_balance DECIMAL(20,4),
			metadata JSONB,
			performed_by UUID,
			created_at TIMESTAMPTZ DEFAULT NOW()
		);
	`

	_, err := db.Exec(migration)
	if err != nil {
		return fmt.Errorf("migration failed: %w", err)
	}
	log.Info().Msg("Database migrations completed")
	return nil
}

type AccountRepository struct {
	db *sql.DB
}

func NewAccountRepository(db *sql.DB) *AccountRepository {
	return &AccountRepository{db: db}
}

func (r *AccountRepository) Create(ctx context.Context, req *models.CreateAccountRequest) (*models.Account, error) {
	accountNumber := generateAccountNumber()
	routingNumber := "021000021" // Wells Fargo routing (training only)

	var interestRate float64
	if req.AccountType == models.AccountTypeSavings {
		interestRate = 0.0425
	}

	account := &models.Account{}
	err := r.db.QueryRowContext(ctx,
		`INSERT INTO accounts (customer_id, account_number, account_type, currency, routing_number, interest_rate)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, customer_id, account_number, account_type, currency, balance, available_balance, hold_amount, status, COALESCE(iban,''), routing_number, interest_rate, opened_at, updated_at`,
		req.CustomerID, accountNumber, req.AccountType, req.Currency, routingNumber, interestRate,
	).Scan(
		&account.ID, &account.CustomerID, &account.AccountNumber, &account.AccountType,
		&account.Currency, &account.Balance, &account.AvailableBalance, &account.HoldAmount,
		&account.Status, &account.IBAN, &account.RoutingNumber, &account.InterestRate,
		&account.OpenedAt, &account.UpdatedAt,
	)
	return account, err
}

func (r *AccountRepository) GetByID(ctx context.Context, id string) (*models.Account, error) {
	account := &models.Account{}
	err := r.db.QueryRowContext(ctx,
		`SELECT id, customer_id, account_number, account_type, currency, balance, available_balance, hold_amount, status, COALESCE(iban,''), routing_number, interest_rate, opened_at, updated_at
		 FROM accounts WHERE id = $1`, id,
	).Scan(
		&account.ID, &account.CustomerID, &account.AccountNumber, &account.AccountType,
		&account.Currency, &account.Balance, &account.AvailableBalance, &account.HoldAmount,
		&account.Status, &account.IBAN, &account.RoutingNumber, &account.InterestRate,
		&account.OpenedAt, &account.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return account, err
}

func (r *AccountRepository) GetByCustomerID(ctx context.Context, customerID string) ([]*models.Account, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, customer_id, account_number, account_type, currency, balance, available_balance, hold_amount, status, COALESCE(iban,''), routing_number, interest_rate, opened_at, updated_at
		 FROM accounts WHERE customer_id = $1 ORDER BY opened_at DESC`, customerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var accounts []*models.Account
	for rows.Next() {
		account := &models.Account{}
		if err := rows.Scan(
			&account.ID, &account.CustomerID, &account.AccountNumber, &account.AccountType,
			&account.Currency, &account.Balance, &account.AvailableBalance, &account.HoldAmount,
			&account.Status, &account.IBAN, &account.RoutingNumber, &account.InterestRate,
			&account.OpenedAt, &account.UpdatedAt,
		); err != nil {
			return nil, err
		}
		accounts = append(accounts, account)
	}
	return accounts, rows.Err()
}

func (r *AccountRepository) UpdateStatus(ctx context.Context, id string, status models.AccountStatus) error {
	result, err := r.db.ExecContext(ctx,
		`UPDATE accounts SET status = $1, updated_at = NOW() WHERE id = $2`,
		status, id,
	)
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("account not found")
	}
	return nil
}

func generateAccountNumber() string {
	rand.New(rand.NewSource(time.Now().UnixNano()))
	return fmt.Sprintf("%010d", rand.Int63n(9000000000)+1000000000)
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}
