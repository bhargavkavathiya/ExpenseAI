# End-to-end smoke test for the UC10 backend. PowerShell 5.1+ compatible.
$ErrorActionPreference = 'Stop'
$Base    = if ($env:UC10_API)     { $env:UC10_API }     else { 'http://localhost:8080' }
$Receipt = if ($env:UC10_RECEIPT) { $env:UC10_RECEIPT } else { 'demo-data/sample-receipts/tinyreceipt.jpg' }

function Say($m) { Write-Host ""; Write-Host "=== $m ===" -ForegroundColor Cyan }

Say 'health'
Invoke-RestMethod -Uri "$Base/health" -Method Get | ConvertTo-Json -Compress

Say 'login as customer'
$login = Invoke-RestMethod -Uri "$Base/api/auth/login" -Method Post `
    -ContentType 'application/json' `
    -Body '{"email":"customer@demo.local","password":"Customer@123"}'
$token = $login.accessToken
"token head: $($token.Substring(0,40))..."

Say 'submit receipt (multipart)'
# PowerShell 5.1 needs a manual multipart body; PS 7+ can use -Form.
if ($PSVersionTable.PSVersion.Major -ge 7) {
    $sub = Invoke-RestMethod -Uri "$Base/api/expenses" -Method Post `
        -Headers @{ Authorization = "Bearer $token" } `
        -Form @{ receipt = Get-Item $Receipt }
} else {
    $boundary = [System.Guid]::NewGuid().ToString()
    $lf = "`r`n"
    $bytes = [IO.File]::ReadAllBytes($Receipt)
    $bodyLines = @(
        "--$boundary",
        'Content-Disposition: form-data; name="receipt"; filename="receipt.jpg"',
        'Content-Type: image/jpeg',
        '',
        [System.Text.Encoding]::GetEncoding('iso-8859-1').GetString($bytes),
        "--$boundary--"
    ) -join $lf
    $sub = Invoke-RestMethod -Uri "$Base/api/expenses" -Method Post `
        -Headers @{ Authorization = "Bearer $token" } `
        -ContentType "multipart/form-data; boundary=$boundary" `
        -Body $bodyLines
}
$sub | ConvertTo-Json -Depth 5
$ref = $sub.refId

Say 'poll decision'
for ($i = 1; $i -le 10; $i++) {
    $r = Invoke-RestMethod -Uri "$Base/api/expenses/$ref/decision" -Headers @{ Authorization = "Bearer $token" }
    Write-Host "  t=$i  status=$($r.status)"
    if ($r.status -in 'approved','needs_review','rejected','failed') { break }
    Start-Sleep -Seconds 1
}

Say 'verify audit chain (as compliance)'
$comp = Invoke-RestMethod -Uri "$Base/api/auth/login" -Method Post `
    -ContentType 'application/json' `
    -Body '{"email":"compliance@demo.local","password":"Compliance@123"}'
Invoke-RestMethod -Uri "$Base/api/admin/audit-logs/verify-chain" `
    -Headers @{ Authorization = "Bearer $($comp.accessToken)" } | ConvertTo-Json -Depth 5

Write-Host ""
Write-Host 'Smoke OK.' -ForegroundColor Green
