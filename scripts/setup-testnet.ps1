# StreamFlow — Testnet Account Setup (PowerShell)
# Creates and funds test accounts for development

Write-Host "StreamFlow Testnet Setup" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan

$NETWORK = "testnet"

# Create employer identity
Write-Host "Creating employer identity..." -ForegroundColor Yellow
$empAddr = stellar keys address employer
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($empAddr)) {
    stellar keys generate employer --network $NETWORK --fund
    $empAddr = stellar keys address employer
}
Write-Host "Employer: $empAddr" -ForegroundColor Green

# Create employee identities
$employees = @("employee1", "employee2", "employee3")
foreach ($emp in $employees) {
    Write-Host "Creating $emp identity..." -ForegroundColor Yellow
    $addr = stellar keys address $emp
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($addr)) {
        stellar keys generate $emp --network $NETWORK --fund
        $addr = stellar keys address $emp
    }
    Write-Host "$emp : $addr" -ForegroundColor Green
}

Write-Host "`n==============================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Use these identities with the stream contract:"
Write-Host "  stellar contract invoke --id <CONTRACT_ID> --source employer --network testnet -- create_stream ..."
