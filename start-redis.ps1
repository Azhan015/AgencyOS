# Agency OS — Start Redis locally
# Run this script once Docker Desktop is open and running

Write-Host "Starting Redis for Agency OS..." -ForegroundColor Cyan

# Check if container already exists
$existing = docker ps -a --filter "name=agency-os-redis" --format "{{.Names}}" 2>$null

if ($existing -eq "agency-os-redis") {
    Write-Host "Redis container exists. Starting it..." -ForegroundColor Yellow
    docker start agency-os-redis
} else {
    Write-Host "Creating new Redis container..." -ForegroundColor Yellow
    docker run -d `
        --name agency-os-redis `
        -p 6379:6379 `
        --restart unless-stopped `
        -v agency_os_redis_data:/data `
        redis:7.2-alpine `
        redis-server --appendonly yes
}

# Wait a moment for Redis to start
Start-Sleep -Seconds 2

# Test connection
Write-Host "Testing Redis connection..." -ForegroundColor Cyan
$result = docker exec agency-os-redis redis-cli ping 2>&1

if ($result -eq "PONG") {
    Write-Host "✅ Redis is running on localhost:6379" -ForegroundColor Green
    Write-Host "Your REDIS_URL: redis://localhost:6379" -ForegroundColor Green
} else {
    Write-Host "❌ Redis failed to start. Check Docker Desktop is running." -ForegroundColor Red
    Write-Host "Output: $result" -ForegroundColor Red
}
