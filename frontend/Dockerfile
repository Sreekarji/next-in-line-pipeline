# Base node image optimized for frontend build size
FROM node:20.12-alpine

# Set the active working directory for the UI
WORKDIR /ui

# Load package maps for dependency caching
COPY package*.json ./

# Execute clean install using package-lock.json
RUN npm ci

# Import the React application
COPY . .

# Vite default mapped port
EXPOSE 5173

# Boot the frontend
CMD ["npm", "run", "dev"]
