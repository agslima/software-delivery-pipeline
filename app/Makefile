SHELL := /bin/bash
.ONESHELL:
.DEFAULT_GOAL := help

APP_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
CLIENT_DIR := $(APP_DIR)/client
SERVER_DIR := $(APP_DIR)/server
COMPOSE_FILE := $(APP_DIR)/docker-compose.yml

DOCKER ?= docker
COMPOSE := $(DOCKER) compose -f $(COMPOSE_FILE)

FRONTEND_IMAGE ?= stayhealthy-frontend:local
BACKEND_IMAGE ?= stayhealthy-backend:local
WORKER_IMAGE ?= stayhealthy-worker:local

.PHONY: help
help: ## Show available targets
	@awk 'BEGIN {FS = ":.*## "; print "Available targets:\n"} /^[a-zA-Z0-9_.-]+:.*## / {printf "  %-24s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: lint lint-client lint-server
lint: lint-client lint-server ## Run frontend and backend lint checks

lint-client: ## Run frontend lint
	cd "$(CLIENT_DIR)"
	npm run lint

lint-server: ## Run backend lint
	cd "$(SERVER_DIR)"
	npm run lint

.PHONY: test test-client test-server
test: test-client test-server ## Run frontend and backend tests

test-client: ## Run frontend tests
	cd "$(CLIENT_DIR)"
	npm test

test-server: ## Run backend tests
	cd "$(SERVER_DIR)"
	npm test

.PHONY: docker docker-build docker-build-client docker-build-server docker-build-worker
docker: docker-build ## Build all local Docker images

docker-build: docker-build-client docker-build-server docker-build-worker ## Build frontend, backend, and worker images

docker-build-client: ## Build the frontend image
	cd "$(APP_DIR)"
	$(DOCKER) build -f docker/Dockerfile.client -t "$(FRONTEND_IMAGE)" .

docker-build-server: ## Build the backend image
	cd "$(APP_DIR)"
	$(DOCKER) build -f docker/Dockerfile.server -t "$(BACKEND_IMAGE)" .

docker-build-worker: ## Build the worker image
	cd "$(APP_DIR)"
	$(DOCKER) build -f docker/Dockerfile.worker -t "$(WORKER_IMAGE)" .

.PHONY: docker-up docker-down docker-logs
docker-up: ## Start the app stack with Docker Compose
	cd "$(APP_DIR)"
	$(COMPOSE) up --build

docker-down: ## Stop the app stack
	cd "$(APP_DIR)"
	$(COMPOSE) down

docker-logs: ## Follow Docker Compose logs
	cd "$(APP_DIR)"
	$(COMPOSE) logs -f
