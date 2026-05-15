# Quick reference:
#   make build && make up   Build image + start dev stack
#   make rebuild            Full --no-cache rebuild + up (after git pull if stale)
#   make logs               Tail dev logs
.PHONY: help up down build rebuild logs restart ps \
        prod-up prod-down prod-logs prod-build clean

help:
	@echo "Dev (default):                                               Ports: dev=38001"
	@echo "  make build && make up   Build image + start dev stack"
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
	@echo "Maintenance:"
	@echo "  make clean              Remove containers/volumes; prune images"

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

clean:
	docker compose --profile dev down --remove-orphans --volumes
	docker compose --profile prod down --remove-orphans --volumes
	docker image prune -f
