# One-Time Secret Messenger

This repository contains a Node.js Express application that allows users to generate a one-time secret message. The secret is encrypted on the client side using AES-GCM, and the encryption key is appended to the URL as a hash fragment (`#`). The encrypted secret is stored in Redis (production) or in-memory (development) and is immediately destroyed when the URL is visited. Since encryption and decryption occur solely on the client side, the server never has access to the unencrypted secret.

## Features

- **Client-Side Encryption/Decryption:**  
  The secret message is encrypted with AES-GCM entirely on the client side. The encryption key is never sent to the server.

- **One-Time Access:**  
  The encrypted secret is stored temporarily and is immediately destroyed after the URL is accessed, ensuring that the secret can only be viewed once.

- **Zero-Knowledge Server:**  
  Since only encrypted data is stored and transmitted, the server has no ability to decrypt or view the secret message.

- **Flexible Storage:**  
  Uses in-memory storage for development (no Redis required) and Redis for production deployments.

## Technologies

- **Node.js & Express:** Server and routing framework.
- **Redis:** In-memory data store for temporary secret storage (production only).
- **AES-GCM:** Secure encryption algorithm used on the client side.
- **HTML/CSS/JavaScript:** For the front-end implementation.

## Prerequisites

Before you begin, ensure you have met the following requirements:
- **Node.js:** Install Node.js (version 12.x or higher is recommended). You can download it from [nodejs.org](https://nodejs.org/).
- **npm:** Comes bundled with Node.js. Verify by running `npm -v` in your terminal.
- **Redis Server (Production only):** For production deployments, ensure you have Redis installed and running. You can download it from [redis.io](https://redis.io/download) or install it via your system's package manager. Redis is **not required** for development.
- **Git:** Optional but recommended for cloning the repository. Install from [git-scm.com](https://git-scm.com/).


## Installation

1. **Clone the Repository:**

   ```bash
   git clone https://github.com/kodakorg/ots.git
   cd ots
   ```

2. **Install Dependencies:**

   ```bash
   npm install
   ```

3. **Configure Environment Variables (Production only):**

   Create a `.env` file in the project root with your configuration. For example:

   ```env
   PORT=3000
   REDIS_URL=redis://localhost:6379
   USE_REDIS=true
   ```

4. **Start the Application:**

   **For Development (in-memory storage, no Redis needed):**
   ```bash
   npm run dev
   ```

   **For Production (with Redis):**
   ```bash
   npm start
   ```

   The application will run on [http://localhost:3000](http://localhost:3000).

## Storage Modes

The application supports two storage modes:

- **Development Mode (In-Memory):** When running `npm run dev`, secrets are stored in memory with automatic TTL expiration. This mode requires no external dependencies and is perfect for local development and testing.

- **Production Mode (Redis):** When running `npm start` or setting `USE_REDIS=true`, secrets are stored in Redis for better persistence and scalability across multiple server instances.

## Usage

1. **Generate a Secret:**

   Open the application in your browser and enter your secret message. The client-side code will encrypt your message with AES-GCM and generate a URL with the encryption key appended after a `#`.

2. **Share the URL:**

   Copy and share the generated URL with the intended recipient.

3. **View and Destroy:**

   When the recipient visits the URL, the encrypted secret is fetched from storage, decrypted in the browser using the key from the URL, and then immediately destroyed from the server to ensure one-time access.

## Demo
The app is available on https://ots.olhustad.no if you want to test it out.

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests with improvements and bug fixes.

## License

This project is licensed under the [MIT/X License](LICENSE).