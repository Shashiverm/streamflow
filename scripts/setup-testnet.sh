#!/bin/bash
# StreamFlow — Testnet Account Setup
# Creates and funds test accounts for development

set -e

echo "🔧 StreamFlow — Testnet Setup"
echo "=============================="

NETWORK="testnet"

# Create employer identity
echo "📋 Creating employer identity..."
stellar keys generate employer --network $NETWORK --fund 2>/dev/null || true
EMPLOYER=$(stellar keys address employer)
echo "✅ Employer: $EMPLOYER"

# Create employee identities
for i in 1 2 3; do
  echo "📋 Creating employee$i identity..."
  stellar keys generate employee$i --network $NETWORK --fund 2>/dev/null || true
  ADDR=$(stellar keys address employee$i)
  echo "✅ Employee $i: $ADDR"
done

echo ""
echo "=============================="
echo "🎉 Setup Complete!"
echo ""
echo "Use these identities with the stream contract:"
echo "  stellar contract invoke --id <CONTRACT_ID> --source employer --network testnet -- create_stream ..."
