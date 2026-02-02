# 👋 Contributing to Mentor Matching Platform

First off, **thank you** for considering contributing to the Mentor Matching Platform! It's people like you that make the open-source community such an amazing place to learn, inspire, and create.

We welcome contributions from everyone—whether you're a seasoned senior developer, a student learning the ropes, or just fixing a typo.

---

## 🚀 Getting Started

This project is a **Monorepo** built with **Node.js (TypeScript)** and **Docker**.

### Prerequisites

* [Node.js](https://nodejs.org/) (v18 or higher)
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Running)
* [Git](https://git-scm.com/)

### Setting Up Your Environment

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally:

    ```bash
    git clone https://github.com/YOUR-USERNAME/mentor-matching-platform.git
    cd mentor-matching-platform
    ```

3. **Install Dependencies**:

    ```bash
    npm install
    ```

4. **Configure Environment**:

    ```bash
    cp .env.example .env
    ```

5. **Start the Stack**:

    ```bash
    npm run docker:up
    ```

    * Web App: [http://localhost:3001](http://localhost:3001)
    * API Gateway: [http://localhost:3000](http://localhost:3000)

---

## 🛠️ Development Workflow

We use a standard **Feature Branch** workflow.

1. **Sync your fork** with the main repository to ensure you are up to date.
2. **Create a Branch** for your work:
    * Use `feature/` for new capabilities (e.g., `feature/add-video-chat`).
    * Use `fix/` for bug fixes (e.g., `fix/login-error`).
    * Use `docs/` for documentation updates.

    ```bash
    git checkout -b feature/my-awesome-feature
    ```

3. **Make your changes**. Write clean, documented code.
4. **Test your changes**.
    * Run unit tests: `npm run test`
    * Verify locally in the browser.

---

## 💾 Commit Message Standards

We follow the **Conventional Commits** specification. This helps us generate changelogs and version numbers automatically.

**Format**: `<type>(<scope>): <subject>`

* **feat**: A new feature
* **fix**: A bug fix
* **docs**: Documentation only changes
* **style**: Changes that do not affect the meaning of the code (white-space, formatting, etc)
* **refactor**: A code change that neither fixes a bug nor adds a feature
* **test**: Adding missing tests or correcting existing tests

**Examples**:

* `feat(auth): add google oauth login support`
* `fix(ui): resolve overlap on mobile navbar`
* `docs(readme): fix typo in deployment instructions`

---

## 📝 Pull Request (PR) Process

Ready to submit? Follow this checklist:

1. [ ] **Tests Passed**: Ensure all project tests run successfully (`npm run test`).
2. [ ] **Linting**: Run the linter to ensure code style consistency (`npm run lint`).
3. [ ] **Documentation**: If you added a feature, did you update the relevant docs?
4. [ ] **Description**: Provide a clear description of what your PR does and link to any relevant issues.

Once submitted, a maintainer will review your code. We may ask for changes—this is a normal part of the process!

---

## 🐛 Issue Reporting

Found a bug? Have a feature request?

* Search existing issues first to avoid duplicates.
* Open a new issue using our templates.
* **Be specific**: Include screenshots, error messages, and steps to reproduce.

---

**Happy Coding!** ☕
