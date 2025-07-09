#!/bin/bash

echo "Installing dependencies for Windows MCP..."

# Install root dependencies
echo "Installing root dependencies..."
npm install

# Install server dependencies
echo "Installing server dependencies..."
cd server && npm install
cd ..

# Install client dependencies  
echo "Installing client dependencies..."
cd client && npm install
cd ..

echo "All dependencies installed successfully!"
echo ""
echo "To start the server (on Windows):"
echo "  cd server && npm start"
echo ""
echo "To start the client (on Mac/Linux):"
echo "  cd client && npm start"