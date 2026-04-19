#!/bin/bash
echo "Building and starting containers..."
docker-compose up -d --build
echo "Waiting for backend to be ready..."
sleep 15
echo "Running seed script..."
docker-compose exec backend node seed.js
echo ""
echo "All done! Open http://localhost:5173"
