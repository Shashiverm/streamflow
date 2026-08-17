#!/bin/bash
# StreamFlow — Testnet Account Setup
# Creates and funds test accounts for development

set -e

echo "🔧 StreamFlow — Testnet Setup"
echo "=============================="

# Locate stellar CLI (native or Windows .exe under WSL)
if command -v stellar &> /dev/null; then
  STELLAR="stellar"
elif command -v stellar.exe &> /dev/null; then
  STELLAR="stellar.exe"
else
  echo "❌ Error: 'stellar' CLI not found. Please install the Stellar CLI or run via PowerShell."
  exit 1
fi

NETWORK="testnet"

# Create employer identity
echo "📋 Creating employer identity..."
$STELLAR keys generate employer --network $NETWORK --fund 2>/dev/null || true
EMPLOYER=$($STELLAR keys address employer)
echo "✅ Employer: $EMPLOYER"

# Create employee identities
for i in 1 2 3; do
  echo "📋 Creating employee$i identity..."
  $STELLAR keys generate employee$i --network $NETWORK --fund 2>/dev/null || true
  ADDR=$($STELLAR keys address employee$i)
  echo "✅ Employee $i: $ADDR"
done

echo ""
echo "=============================="
echo "🎉 Setup Complete!"
echo ""
echo "Use these identities with the stream contract:"
echo "  stellar contract invoke --id <CONTRACT_ID> --source employer --network testnet -- create_stream ..."
