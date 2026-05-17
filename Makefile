# Quick reference:
#   make dev                Run as plain Node (no Docker)
#   make dock               Run in Docker dev container (port 38001)
#   make build && make up   Build image + start dev stack (up = alias for dock)
#   make rebuild            Full --no-cache rebuild + up (after git pull if stale)
OS             := $(shell uname -s)
NODE_22_VER    := 22.15.0
NODE_22_TARBALL := node-v$(NODE_22_VER)-linux-x64.tar.xz
NODE_22_URL    := https://nodejs.org/dist/v$(NODE_22_VER)/$(NODE_22_TARBALL)

.PHONY: help setup check-node install-node dev dev-ps dev-logs dev-stop dev-clean dock dock-rebuild dock-clean up down build rebuild logs restart ps \
        prod-up prod-down prod-logs prod-build clean test-e2e test-e2e-live

help:
	@echo "Dev modes:                                                   Ports: dev=38001"
	@echo "  make setup              Install deps + create .env (run once after clone)"
	@echo "  make install-node       Install Node 22 (nvm → apt → local tarball fallbacks)"
	@echo "  make dev                Run as plain Node on port 38001 (background, logs → data/dev/dev.log)"
	@echo "  make dev-ps             Show plain Node dev process status"
	@echo "  make dev-logs           Tail plain Node dev logs"
	@echo "  make dev-stop           Stop plain Node dev process"
	@echo "  make dev-clean          Wipe data/local (DB + workspaces)"
	@echo "  make dock-clean         Wipe data/dev (DB + workspaces)"
	@echo "  make dock               Run in Docker dev container (port 38001)"
	@echo "  make dock-rebuild       Full --no-cache rebuild + up"
	@echo "  make build && make up   Build image + start (up is alias for dock)"
	@echo "  make rebuild            Full --no-cache rebuild + up"
	@echo "  make restart            down + up without rebuild"
	@echo "  make logs               Tail dev logs"
	@echo "  make ps                 Container status"
	@echo ""
	@echo "Prod (explicit):                                             Ports: prod=38000"
	@echo "  make prod-build         Build prod image"
	@echo "  make prod-up            Build + start prod stack"
	@echo "  make prod-down          Stop prod stack"
	@echo "  make prod-logs          Tail prod logs"
	@echo ""
	@echo "Tests:"
	@echo "  make test-e2e           Run Playwright e2e stub suite (no Ollama)"
	@echo "  make test-e2e-live      Run live LLM e2e (Ollama + model from .env required)"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean              Remove containers/volumes; prune images"

check-node:
	@node --version 2>/dev/null | grep -qE '^v(2[2-9]|[3-9][0-9])' || { \
		echo "ERROR: Node 22+ required (found $$(node --version 2>/dev/null || echo none))"; \
		if [ "$(OS)" = "Darwin" ]; then \
			echo "  macOS:  brew install node   OR   nvm install 22 && nvm use 22"; \
		else \
			echo "  Linux:  run 'make install-node' to try auto-install (nvm / apt / tarball)"; \
		fi; \
		exit 1; \
	}

install-node:
	@echo "Installing Node $(NODE_22_VER) — trying methods in order..."
	@echo ""
	@( \
		echo "1/3  nvm ..."; \
		if [ -s "$$HOME/.nvm/nvm.sh" ]; then \
			. "$$HOME/.nvm/nvm.sh" && nvm install $(NODE_22_VER) && nvm use $(NODE_22_VER) \
				&& echo "" && echo "Done. Open a new shell or run: . ~/.nvm/nvm.sh && nvm use $(NODE_22_VER)" \
				&& exit 0; \
		fi; \
		echo "     nvm not found or install failed (no internet?)."; \
		echo ""; \
		echo "2/3  apt + NodeSource ..."; \
		if command -v apt-get >/dev/null 2>&1 && command -v curl >/dev/null 2>&1; then \
			curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - \
				&& sudo apt-get install -y nodejs \
				&& echo "" && echo "Done. node $$(node --version) installed." \
				&& exit 0; \
		fi; \
		echo "     apt unavailable or failed (no internet / proxy?)."; \
		echo ""; \
		echo "3/3  local tarball ($(NODE_22_TARBALL)) ..."; \
		if [ -f "$(NODE_22_TARBALL)" ]; then \
			sudo tar -xJf "$(NODE_22_TARBALL)" -C /usr/local --strip-components=1 \
				&& echo "" && echo "Done. node $$(node --version) installed from tarball." \
				&& exit 0; \
		fi; \
		echo "     No tarball found in current directory."; \
		echo ""; \
		echo "-------------------------------------------------------------"; \
		echo "All automatic methods failed. Manual options:"; \
		echo ""; \
		echo "  A) Set proxy and retry:"; \
		echo "     export HTTPS_PROXY=http://your-proxy:port"; \
		echo "     make install-node"; \
		echo ""; \
		echo "  B) Download tarball on a machine with internet access,"; \
		echo "     copy it here, then re-run make install-node:"; \
		echo "     URL: $(NODE_22_URL)"; \
		echo "     scp $(NODE_22_TARBALL) user@this-host:$(CURDIR)/"; \
		echo "-------------------------------------------------------------"; \
		exit 1; \
	)

setup: check-node
	@[ -f .env ] || (cp .env.example .env && echo "Created .env from .env.example — edit it before running")
	npm install
	@echo ""
	@echo "Setup complete. Run: make dev"

dev: check-node
	@pkill -f "tsx src/index.ts" 2>/dev/null && echo "Stopped previous process." || true
	mkdir -p ./data/local
	PORT=$${PORT:-38001} DATA_DIR=./data/local LLM_BASE_URL=$${LLM_BASE_URL:-http://localhost:11434/v1} npm run dev >> ./data/local/dev.log 2>&1 &
	@echo "Started on http://localhost:38001 — logs: make dev-logs  stop: make dev-stop"

dev-logs:
	tail -f ./data/local/dev.log

dev-ps:
	@pgrep -fl "tsx src/index.ts" || echo "Not running."

dev-stop:
	@pkill -f "tsx src/index.ts" && echo "Stopped." || echo "Not running."

dev-clean:
	rm -rf ./data/local
	@echo "Cleared data/local (make dev data)"

dock-clean:
	rm -rf ./data/dev
	@echo "Cleared data/dev (make dock data)"

dock:
	docker compose --profile dev up -d

dock-rebuild:
	docker compose --profile dev build --no-cache
	docker compose --profile dev up -d

up:
	docker compose --profile dev up -d

down:
	docker compose --profile dev down --remove-orphans

build:
	docker compose --profile dev build

rebuild:
	docker compose --profile dev build --no-cache
	docker compose --profile dev up -d

restart:
	docker compose --profile dev down --remove-orphans
	docker compose --profile dev up -d

logs:
	docker compose --profile dev logs -f

ps:
	docker compose ps

prod-build:
	docker compose --profile prod build

prod-up:
	docker compose --profile prod build
	docker compose --profile prod up -d

prod-down:
	docker compose --profile prod down --remove-orphans

prod-logs:
	docker compose --profile prod logs -f

test-e2e:
	DATA_DIR=./e2e/.data npx playwright test

test-e2e-live:
	DATA_DIR=./e2e/.live-data npx playwright test -c playwright.live.config.ts

clean:
	docker compose --profile dev down --remove-orphans --volumes
	docker compose --profile prod down --remove-orphans --volumes
	docker image prune -f
