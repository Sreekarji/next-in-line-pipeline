# Base node image optimized for frontend build size
FROM node:22-alpine

# Set the active working directory for the UI
WORKDIR /ui

# Load package maps for dependency caching
COPY package*.json ./

# Execute install while discarding strictly windows package-lock resolution
RUN rm -f package-lock.json && npm install

# Import the React application
COPY . .

# Vite default mapped port
EXPOSE 5173

# Boot the frontend
CMD ["npm", "run", "dev"]
