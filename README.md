# Agency OS

Agency OS is a centralized client and project management platform for freelancer agencies. It brings client communication, project delivery, tasks, files, approvals, contracts, invoicing, and agency operations into one full-stack workspace.

## Tech Stack

Agency OS uses the MERN stack: MongoDB, Express, React, and Node.js. The application also uses TypeScript, Mongoose, Redis, Socket.io, Vite, Tailwind CSS, Zustand, and TanStack Query.

## Modules

The platform includes 13 modules: authentication, clients, projects, tasks, files, messages, invoices, contracts, approvals, notifications, automations, analytics, and administration.

My role focused on the backend: business logic, REST APIs, database models, and third-party integrations, including Stripe payments, contract e-signatures, invoicing, and file management.

The data layer includes 8 MongoDB schemas designed with compound and sparse indexes to support invoice filtering, overdue-job queries, and fast file browsing.

## Setup

Install Node.js 20+, MongoDB 7+, and Redis 7+, then follow the complete setup instructions in [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md).

## Documentation

Detailed architecture, audits, migration notes, setup references, and project documentation are available in the [docs](docs) directory.
