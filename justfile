test_port := "5199"

dev:
    npm run dev

build:
    npm run build

lint:
    npx biome check .

lint-fix:
    npx biome check --write .

test:
    #!/usr/bin/env bash
    set -euo pipefail

    # Start dev server on a dedicated port
    npx vite --port {{test_port}} &
    DEV_PID=$!
    trap "kill $DEV_PID 2>/dev/null" EXIT

    # Wait for server to be ready
    for i in $(seq 1 30); do
        if curl -s -o /dev/null http://localhost:{{test_port}}; then
            break
        fi
        sleep 0.5
    done

    TEST_URL=http://localhost:{{test_port}} npm test
