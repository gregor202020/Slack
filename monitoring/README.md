# Monitoring

Production monitoring stack for The Smoker using Prometheus and Grafana.

## Quick start

```bash
# Start infrastructure + monitoring
make infra
make monitoring

# Or just monitoring (infra must already be running)
make monitoring
```

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin / admin)
- **API metrics (Prometheus format)**: http://localhost:4000/metrics
- **API metrics (JSON)**: http://localhost:4000/api/metrics

## Stop

```bash
make monitoring-down
```

## Architecture

```
API (:4000/metrics)  -->  Prometheus (:9090)  -->  Grafana (:3001)
```

Prometheus scrapes the API `/metrics` endpoint every 15 seconds. Grafana
reads from Prometheus and displays the pre-provisioned "API Overview"
dashboard.

## Metrics exposed

| Metric | Type | Labels | Description |
|---|---|---|---|
| `http_requests_total` | counter | method, route, status | Total HTTP requests |
| `http_request_duration_seconds` | histogram | method, route | Request duration with bucket boundaries |
| `websocket_connections_active` | gauge | | Current WebSocket connections |
| `database_connected` | gauge | | Database reachability (1=up, 0=down) |
| `redis_connected` | gauge | | Redis reachability (1=up, 0=down) |
| `nodejs_process_memory_bytes` | gauge | type | Memory usage (rss, heapUsed, heapTotal, external) |
| `nodejs_process_cpu_seconds_total` | counter | | Cumulative CPU time |
| `nodejs_process_uptime_seconds` | gauge | | Process uptime |

## Dashboard panels

The pre-provisioned Grafana dashboard includes:

- Uptime, request rate, error rate (4xx/5xx) stat panels
- WebSocket connection count
- Database and Redis status indicators
- Request rate over time by status code and HTTP method
- Response time percentiles (p50, p95, p99)
- Request duration distribution (histogram buckets)
- Memory usage over time (RSS, heap, external)
- CPU usage percentage

## Files

```
monitoring/
  prometheus/
    prometheus.yml          # Prometheus scrape config
  grafana/
    provisioning/
      datasources/
        prometheus.yml      # Auto-provision Prometheus data source
      dashboards/
        dashboard.yml       # Dashboard file provider config
    dashboards/
      api-overview.json     # Pre-built API overview dashboard
```
