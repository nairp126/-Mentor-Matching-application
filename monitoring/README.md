# Monitoring Infrastructure

## 1. Purpose & Responsibility

**What this module does**:
Provides Observability for the platform. It collects Metrics (CPU, Memory, Request Rates), Logs (Application Output), and manages Alerts.

**Why it exists**:
To ensure system reliability and faster incident response by visualizing what is happening inside the black-box containers.

## 2. Core Components & Structure

- **`docker-compose.monitoring.yml`**: Definition of the monitoring stack containers.
- **`prometheus.yml`**: Scrape configurations (polls `/metrics` endpoint of services).
- **`grafana/`**: Dashboard templates and datasource configs.
- **`loki-config.yml`**: Log aggregation settings.
- **`alert_rules.yml`**: Thresholds for triggering alarms (e.g., "High Error Rate").

## 3. Implementation Details

- **Pull Model**: Prometheus actively "scrapes" the `/metrics` endpoint exposed by `api-gateway` and others.
- **Log Aggregation**: `Promtail` (usually implied or configured via docker logging driver) ships logs to Loki.

## 4. Inter-Module Communication

- **Inputs**: HTTP Scrapes, Log Streams.
- **Outputs**: Dashboards, Slack/Email Alerts.
- **Dependencies**:
  - All Microservices must expose a `/metrics` endpoint.

## 5. Usage Example

**Starting the Stack**:

```bash
docker-compose -f docker-compose.monitoring.yml up -d
```

**Accessing Dashboards**:

- **Grafana**: `http://localhost:3009` (Default creds: admin/admin)
- **Prometheus**: `http://localhost:9090`
