# 04. Frontend Architecture & Deployment Infrastructure

## 1. Frontend Architecture (Web App)

The **Web Application** is a Single Page Application (SPA) built with **React**, **TypeScript**, and **Vite**. It uses **Material UI** for components and **Redux Toolkit** for global state.

### Component Hierarchy

```mermaid
graph TD
    App[App.tsx] --> Providers[ReduxProvider / ThemeProvider]
    Providers --> Router[React Router]
    
    subgraph "Routing Layer"
        Router --> Public[Public Routes]
        Router --> Protected[Protected Routes]
        Protected --> Guard[RoleGuard / AuthGuard]
    end

    subgraph "Pages"
        Public --> Login[Login / Register]
        Guard --> Dashboard[Dashboard]
        Guard --> Sessions[Sessions Module]
        Guard --> Profile[Profile Module]
        Guard --> Messages[Communication Module]
    end

    subgraph "Core Components"
        Dashboard & Sessions & Profile --> Layout[Main Layout]
        Layout --> Navbar
        Layout --> Sidebar
    end
```

### Key Modules

| Module | Path | Description |
|--------|------|-------------|
| **Auth** | `src/pages/auth` | Login, Register, MFA Setup, Forgot Password. |
| **Sessions** | `src/pages/sessions` | List, Detail, Create, Edit, Join Session. |
| **Mentors** | `src/pages/mentors` | Mentor Discovery & Profiles. |
| **Communication**| `src/pages/communication`| Chat Interface & History. |
| **Store** | `src/store` | Redux Slices (`authSlice`, `sessionSlice`, `uiSlice`). |

## 2. Infrastructure & Deployment

The application uses **Docker** for containerization and **Docker Compose** for orchestration. Every microservice runs in its own container, sharing a common bridge network.

### Infrastructure Diagram

```mermaid
graph TD
    subgraph "Host Machine / Cloud Instance"
        Client[Browser] -->|Port 3001| WebContainer[Web App Container]
        Client -->|Port 3000| Gateway[API Gateway Container]
    
        subgraph "Internal Docker Network"
            Gateway --> service_auth[Auth Service :3001]
            Gateway --> service_user[User Service :3002]
            Gateway --> service_session[Session Service :3003]
            Gateway --> service_match[Matching Service :3004]
            Gateway --> service_comm[Comm Service :3005]
            
            service_auth & service_user & service_session --> Postgres[(PostgreSQL :5432)]
            service_auth & service_session --> Redis[(Redis :6379)]
            service_match --> Elastic[(Elasticsearch :9200)]
        end
    end
```

## 3. Deployment Instructions

### Local Development

The project includes a `deploy.sh` (or `.ps1` for Windows) helper script.

1. **Prerequisites**: Docker Desktop, Node.js v18+.
2. **Setup & Run**:

    ```bash
    # Installs dependencies & starts all containers
    npm run setup
    
    # Or manually:
    npm install
    npm run docker:up
    ```

3. **Access**:
    - Frontend: <http://localhost:3001>
    - API Gateway: <http://localhost:3000>

### Production Deployment

Production deployment uses `docker-compose.prod.yml` which likely includes stricter restart policies and resource limits (implied).

1. **Deploy Script**:

    ```bash
    # Deploy to Production environment
    ./scripts/deploy.sh production
    ```

    *This script builds optimized images, runs migrations, and starts services in detached mode.*

2. **Environment Variables**:
    Ensure `.env.production` is populated with real credentials (DB passwords, AWS Keys) before running the script.

### Database Migrations

Migrations are handled via the `scripts/migrate.sh` utility, which applies SQL files from `database/migrations` to the running Postgres container.

```bash
# Run migrations manually if needed
npm run migrate
```
