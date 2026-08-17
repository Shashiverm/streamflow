# StreamFlow — Contract Deployment Script (PowerShell)
# Deploys both Stream and Treasury contracts to Stellar Testnet

$ErrorActionPreference = "Stop"

Write-Host "StreamFlow Contract Deployment" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan

$NETWORK = "testnet"
$SOURCE_IDENTITY = "deployer"

# Check if identity exists, create if not
$address = stellar keys address $SOURCE_IDENTITY
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($address)) {
    Write-Host "Creating deployer identity..." -ForegroundColor Yellow
    stellar keys generate $SOURCE_IDENTITY --network $NETWORK --fund
    $address = stellar keys address $SOURCE_IDENTITY
    Write-Host "Identity created and funded" -ForegroundColor Green
} else {
    Write-Host "Using existing deployer identity" -ForegroundColor Green
}

$DEPLOYER_ADDRESS = $address.Trim()
Write-Host "Deployer: $DEPLOYER_ADDRESS" -ForegroundColor Yellow

# Build contracts
Write-Host "`nBuilding contracts..." -ForegroundColor Yellow
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location "$scriptDir/../contracts"
stellar contract build
Write-Host "Contracts built" -ForegroundColor Green

# Deploy Stream Contract
Write-Host "`nDeploying Stream Contract..." -ForegroundColor Yellow
$STREAM_ID = (stellar contract deploy --wasm target/wasm32v1-none/release/stream.wasm --source $SOURCE_IDENTITY --network $NETWORK).Trim()
Write-Host "Stream Contract: $STREAM_ID" -ForegroundColor Green

# Deploy Treasury Contract
Write-Host "`nDeploying Treasury Contract..." -ForegroundColor Yellow
$TREASURY_ID = (stellar contract deploy --wasm target/wasm32v1-none/release/treasury.wasm --source $SOURCE_IDENTITY --network $NETWORK).Trim()
Write-Host "Treasury Contract: $TREASURY_ID" -ForegroundColor Green

# Initialize Treasury with Stream contract address
Write-Host "`nInitializing Treasury with Stream contract..." -ForegroundColor Yellow
stellar contract invoke `
  --id $TREASURY_ID `
  --source $SOURCE_IDENTITY `
  --network $NETWORK `
  -- `
  initialize `
  --admin $DEPLOYER_ADDRESS `
  --stream_contract $STREAM_ID

Pop-Location

Write-Host "`n==================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Stream Contract:   $STREAM_ID"
Write-Host "Treasury Contract: $TREASURY_ID"
Write-Host "Deployer:          $DEPLOYER_ADDRESS"
Write-Host ""
Write-Host "Save these addresses in your frontend configuration."
