# Base node image optimized for build size
FROM node:20.12-alpine

# Set the active working directory
WORKDIR /app

# Load dependency definitions first for build caching
COPY package*.json ./

# Execute a clean locked installation of packages
RUN npm ci

# Bring in the rest of the backend source code payload
COPY . .

# Explicitly expose mapping port
EXPOSE 3000

# Launch server
CMD ["npm", "run", "dev"]
