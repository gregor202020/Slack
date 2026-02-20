# Load Testing with k6

## Install k6
brew install k6  (macOS)
choco install k6 (Windows)
snap install k6  (Linux)

## Run tests
k6 run load-tests/smoke.js          # Quick smoke test (10 VUs, 30s)
k6 run load-tests/load.js           # Standard load test (50 VUs, 5min)
k6 run load-tests/stress.js         # Stress test (ramp to 200 VUs)
k6 run load-tests/spike.js          # Spike test (sudden burst)

## Environment variables
BASE_URL — API base URL (default: http://localhost:4000)
AUTH_TOKEN — Pre-generated JWT token for authenticated tests

## Generating an auth token
1. Start the API: npm run dev
2. Run the seed: npm run db:seed
3. Use the dev OTP flow to get a token for Jake (+15551000001)
