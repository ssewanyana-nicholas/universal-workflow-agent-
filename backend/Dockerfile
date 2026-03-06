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
RUN npm ci && npx playwright install --with-deps chromium

# Copy source code
COPY src ./src

# Create non-root user (use UID 1001 to avoid conflict)
RUN id -u appuser 2>/dev/null || useradd -m -u 1001 appuser
RUN chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 8080

# Start the server
CMD ["node", "src/server.js"]
