Get-ChildItem -Path packages -Directory | ForEach-Object {
    $dest = Join-Path $_.FullName ".env"
    Copy-Item -Path .env -Destination $dest -Force
    Write-Host "Copied .env to $($_.Name)"
}

$webAppDest = Join-Path "apps\web-app" ".env"
Copy-Item -Path .env -Destination $webAppDest -Force
Write-Host "Copied .env to web-app"
