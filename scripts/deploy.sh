#!/bin/bash
# StreamFlow — Contract Deployment Script
# Deploys both Stream and Treasury contracts to Stellar Testnet

set -e

echo "🚀 StreamFlow Contract Deployment"
echo "=================================="

# Configuration
NETWORK="testnet"
SOURCE_IDENTITY="deployer"

# Check if identity exists, create if not
if ! stellar keys address $SOURCE_IDENTITY 2>/dev/null; then
  echo "📋 Creating deployer identity..."
  stellar keys generate $SOURCE_IDENTITY --network $NETWORK --fund
  echo "✅ Identity created and funded"
else
  echo "✅ Using existing deployer identity"
fi

DEPLOYER_ADDRESS=$(stellar keys address $SOURCE_IDENTITY)
echo "📍 Deployer: $DEPLOYER_ADDRESS"

# Build contracts
echo ""
echo "🔨 Building contracts..."
cd "$(dirname "$0")/../contracts"
stellar contract build
echo "✅ Contracts built"

# Deploy Stream Contract
echo ""
echo "📡 Deploying Stream Contract..."
STREAM_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/stream.wasm \
  --source $SOURCE_IDENTITY \
  --network $NETWORK)
echo "✅ Stream Contract: $STREAM_ID"

# Deploy Treasury Contract
echo ""
echo "📡 Deploying Treasury Contract..."
TREASURY_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/treasury.wasm \
  --source $SOURCE_IDENTITY \
  --network $NETWORK)
echo "✅ Treasury Contract: $TREASURY_ID"

# Initialize Treasury with Stream contract address
echo ""
echo "🔗 Initializing Treasury with Stream contract..."
stellar contract invoke \
  --id $TREASURY_ID \
  --source $SOURCE_IDENTITY \
  --network $NETWORK \
  -- \
  initialize \
  --admin $DEPLOYER_ADDRESS \
  --stream_contract $STREAM_ID

echo ""
echo "=================================="
echo "🎉 Deployment Complete!"
echo ""
echo "Stream Contract:   $STREAM_ID"
echo "Treasury Contract: $TREASURY_ID"
echo "Deployer:          $DEPLOYER_ADDRESS"
echo ""
echo "Save these addresses in your frontend configuration."
