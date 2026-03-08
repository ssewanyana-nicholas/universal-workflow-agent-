# Use Node.js 20 for compatibility with @vitejs/plugin-react
FROM node:20-bullseye

# Install Playwright dependencies
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    libglib2.0-0 \
    libnss3 \
    libnspr4 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    locales \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies including Playwright
RUN npm install && npx playwright install chromium chromium-headless-shell

# Copy source code
COPY src ./src

# Expose port
EXPOSE 8080

# Start the server (run as root for now to access Playwright browsers)
CMD ["node", "src/server.js"]
