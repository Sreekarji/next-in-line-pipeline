# Base node image optimized for build size
FROM node:22-alpine

# Set the active working directory
WORKDIR /app

# Load dependency definitions first for build caching
COPY package*.json ./

# Execute install while discarding strictly windows package-lock resolution
RUN rm -f package-lock.json && npm install

# Bring in the rest of the backend source code payload
COPY . .

# Explicitly expose mapping port
EXPOSE 3000

# Launch server
CMD ["npm", "run", "dev"]
