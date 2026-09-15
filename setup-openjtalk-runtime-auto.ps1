$ErrorActionPreference = "Stop"

$root = Get-Location
$pkgRoot = Join-Path $root "node_modules\@keanu-thakalath\openjtalkjs"
$runtimeDst = Join-Path $root "public\openjtalk-runtime"

if (-not (Test-Path $pkgRoot)) {
  throw "openjtalkjs package not found: $pkgRoot"
}

Write-Host "Searching actual openjtalkjs browser runtime files..."

$browserJs = Get-ChildItem -Path $pkgRoot -Recurse -File -Filter "browser.js" |
  Select-Object -First 1

$workerJs = Get-ChildItem -Path $pkgRoot -Recurse -File -Filter "worker.js" |
  Where-Object { $_.FullName -match "[\\/]browser[\\/]" } |
  Select-Object -First 1

$wrapperJs = Get-ChildItem -Path $pkgRoot -Recurse -File |
  Where-Object { $_.Name -like "openjtalk-wasm-wrapper-*.js" } |
  Select-Object -First 1

$wasm = Get-ChildItem -Path $pkgRoot -Recurse -File -Filter "openjtalk-wasm.wasm" |
  Select-Object -First 1

if (-not $browserJs) {
  throw "browser.js was not found under $pkgRoot"
}
if (-not $workerJs) {
  throw "browser/worker.js was not found under $pkgRoot"
}
if (-not $wrapperJs) {
  throw "openjtalk-wasm-wrapper-*.js was not found under $pkgRoot"
}
if (-not $wasm) {
  throw "openjtalk-wasm.wasm was not found under $pkgRoot"
}

Write-Host ""
Write-Host "Found:"
Write-Host " browser.js : $($browserJs.FullName)"
Write-Host " worker.js  : $($workerJs.FullName)"
Write-Host " wrapper    : $($wrapperJs.FullName)"
Write-Host " wasm       : $($wasm.FullName)"
Write-Host ""

Remove-Item -Recurse -Force $runtimeDst -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $runtimeDst | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $runtimeDst "browser") | Out-Null

Copy-Item -Force $browserJs.FullName (Join-Path $runtimeDst "browser.js")
Copy-Item -Force $workerJs.FullName (Join-Path $runtimeDst "browser\worker.js")
Copy-Item -Force $wrapperJs.FullName (Join-Path $runtimeDst $wrapperJs.Name)
Copy-Item -Force $wasm.FullName (Join-Path $runtimeDst "openjtalk-wasm.wasm")

Write-Host "Copied runtime files:"
Get-ChildItem $runtimeDst -Recurse | Select-Object FullName, Length

$expectedBrowser = Join-Path $runtimeDst "browser.js"
if (-not (Test-Path $expectedBrowser)) {
  throw "Copy verification failed: $expectedBrowser"
}

Write-Host ""
Write-Host "SUCCESS"
Write-Host "Now this URL should return JavaScript:"
Write-Host "  http://localhost:5173/openjtalk-runtime/browser.js"
