#!/bin/bash
# Build production frontend and deploy to Cloudflare Pages

echo "Building production assets..."
npm run build

if [ $? -eq 0 ]; then
  echo "Build successful. Deploying to Cloudflare Pages..."
  npx wrangler pages deploy dist --branch production
else
  echo "Error: Build failed. Aborting deployment."
  exit 1
fi
