.PHONY: up down logs build test typecheck install k8s-apply k8s-delete

# ── Local development ─────────────────────────────────────────────────────────
up:
	docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f

restart:
	docker compose restart

# ── Build Docker images locally ───────────────────────────────────────────────
build:
	docker compose build

# ── Monorepo npm tasks ────────────────────────────────────────────────────────
install:
	npm install

typecheck:
	npm run typecheck

test:
	npm run test

# ── Kubernetes ────────────────────────────────────────────────────────────────
k8s-apply:
	kubectl apply -f k8s/namespace.yaml
	kubectl apply -f k8s/configmap.yaml
	kubectl apply -f k8s/secrets.yaml
	kubectl apply -f k8s/mongodb-statefulset.yaml
	kubectl apply -f k8s/redis-deployment.yaml
	kubectl apply -f k8s/auth-service.yaml
	kubectl apply -f k8s/task-service.yaml
	kubectl apply -f k8s/gateway.yaml
	kubectl apply -f k8s/web.yaml
	kubectl apply -f k8s/ingress.yaml

k8s-delete:
	kubectl delete -f k8s/ --ignore-not-found

k8s-status:
	kubectl get pods,svc,ingress -n task-management
