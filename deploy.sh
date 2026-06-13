#!/bin/bash
# Build production frontend, run database migrations, and deploy to Cloudflare Pages

echo "Building production assets..."
npm run build

if [ $? -eq 0 ]; then
  echo "Build successful."
  
  echo "Applying remote database migrations..."
  npx wrangler d1 migrations apply supply-db --remote
  
  if [ $? -eq 0 ]; then
    echo "Migrations applied successfully. Deploying to Cloudflare Pages..."
    npx wrangler pages deploy dist --branch production
  else
    echo "Error: Migrations failed. Aborting deployment."
    exit 1
  fi
else
  echo "Error: Build failed. Aborting deployment."
  exit 1
fi
