# FWB/Dating Web Application

This repository contains the source code for a modern dating and friends-with-benefits web application.

## Project Structure

- `/frontend`: Contains the Next.js application.
- `/backend`: Placeholder for future backend services.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [npm](https://www.npmjs.com/) (comes with Node.js)

### Local Development

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd <repository-name>
    ```

2.  **Install frontend dependencies:**
    ```bash
    cd frontend
    npm install
    ```

3.  **Set up environment variables:**
    Create a `.env.local` file in the `frontend` directory by copying the example:
    ```bash
    cp .env.example .env.local
    ```
    Fill in the required values in `.env.local`.

4.  **Run the development server:**
    ```bash
    npm run dev
    ```
    The application will be available at [http://localhost:3000](http://localhost:3000).

### Running with Docker

1.  **Build the Docker image:**
    ```bash
    docker build -t fwb-app .
    ```

2.  **Run the Docker container:**
    ```bash
    docker run -p 3000:3000 fwb-app
    ```
    The application will be available at [http://localhost:3000](http://localhost:3000).
