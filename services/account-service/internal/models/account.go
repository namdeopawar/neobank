package models

import (
	"time"
)

type AccountType string
type AccountStatus string
type Currency string

const (
	AccountTypeChecking AccountType = "checking"
	AccountTypeSavings  AccountType = "savings"
	AccountTypeLoan     AccountType = "loan"

	AccountStatusActive    AccountStatus = "active"
	AccountStatusFrozen    AccountStatus = "frozen"
	AccountStatusClosed    AccountStatus = "closed"
	AccountStatusSuspended AccountStatus = "suspended"

	CurrencyUSD Currency = "USD"
	CurrencyEUR Currency = "EUR"
	CurrencyGBP Currency = "GBP"
	CurrencyINR Currency = "INR"
)

type Account struct {
	ID               string        `json:"id" db:"id"`
	CustomerID       string        `json:"customerId" db:"customer_id"`
	AccountNumber    string        `json:"accountNumber" db:"account_number"`
	AccountType      AccountType   `json:"accountType" db:"account_type"`
	Currency         Currency      `json:"currency" db:"currency"`
	Balance          float64       `json:"balance" db:"balance"`
	AvailableBalance float64       `json:"availableBalance" db:"available_balance"`
	HoldAmount       float64       `json:"holdAmount" db:"hold_amount"`
	Status           AccountStatus `json:"status" db:"status"`
	IBAN             string        `json:"iban,omitempty" db:"iban"`
	RoutingNumber    string        `json:"routingNumber" db:"routing_number"`
	InterestRate     float64       `json:"interestRate" db:"interest_rate"`
	OpenedAt         time.Time     `json:"openedAt" db:"opened_at"`
	UpdatedAt        time.Time     `json:"updatedAt" db:"updated_at"`
}

type CreateAccountRequest struct {
	CustomerID  string      `json:"customerId" binding:"required,uuid"`
	AccountType AccountType `json:"accountType" binding:"required,oneof=checking savings loan"`
	Currency    Currency    `json:"currency" binding:"required,oneof=USD EUR GBP INR"`
}

type UpdateBalanceRequest struct {
	Amount    float64 `json:"amount" binding:"required"`
	Operation string  `json:"operation" binding:"required,oneof=credit debit hold release"`
	Reference string  `json:"reference"`
}
