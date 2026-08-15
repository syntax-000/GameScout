[CmdletBinding()]
param(
    [ValidateRange(1, 100)] [int]$Limit = 10,
    [string]$MobyGameIds,
    [string]$MobyPlatformIds,
    [string]$SteamAppIds,
    [string]$MobyBaseUri = 'https://api.mobygames.com/v1',
    [string]$OutputPath,
    [switch]$DryRun
)

# Superseded historical validator. MobyGames was rejected because GameScout V0.1 permits only zero-cost providers.
# The active provider contract is Steam catalog + activity. Do not use this historical script for current GS-001 acceptance.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:MobyApiKeyEnvironmentName = 'MOBYGAMES_API_KEY'
$script:SteamApiKeyEnvironmentName = 'STEAM_WEB_API_KEY'
$script:SteamCurrentPlayersEndpoint = 'https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/'

function ConvertTo-PositiveIdList {
    param([AllowNull()][string]$Value, [Parameter(Mandatory = $true)][string]$Name)
    if ([string]::IsNullOrWhiteSpace($Value)) { return @() }
    $ids = foreach ($raw in ($Value -split ',')) {
        $parsed = 0
        if (-not [int]::TryParse($raw.Trim(), [ref]$parsed) -or $parsed -le 0) {
            throw "$Name must be a comma-separated list of positive integers. Invalid value: '$raw'."
        }
        $parsed
    }
    return @($ids | Sort-Object -Unique)
}

function Get-PropertyValue {
    param([AllowNull()][object]$InputObject, [Parameter(Mandatory = $true)][string]$Name)
    if ($null -eq $InputObject) { return $null }
    $property = $InputObject.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return $property.Value
}

function ConvertTo-Array {
    param([AllowNull()][object]$Value)
    if ($null -eq $Value) { return @() }
    return @($Value)
}

function Get-HttpStatusCode {
    param([Parameter(Mandatory = $true)][System.Management.Automation.ErrorRecord]$ErrorRecord)
    $response = Get-PropertyValue -InputObject $ErrorRecord.Exception -Name 'Response'
    if ($null -eq $response) { return $null }
    $status = Get-PropertyValue -InputObject $response -Name 'StatusCode'
    if ($null -eq $status) { return $null }
    return [int]$status
}

function Invoke-MobyJson {
    param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)][string]$ApiKey)
    $uri = $MobyBaseUri.TrimEnd('/') + '/' + $Path.TrimStart('/') + '?api_key=' + [Uri]::EscapeDataString($ApiKey)
    try {
        return Invoke-RestMethod -Uri $uri -Method Get -Headers @{ Accept = 'application/json' }
    }
    catch {
        $status = Get-HttpStatusCode -ErrorRecord $_
        if ($null -eq $status) { throw [InvalidOperationException]::new("MobyGames request failed before an HTTP response for $Path.") }
        throw [InvalidOperationException]::new("MobyGames request failed with HTTP $status for $Path.")
    }
}

function Get-AttributeSummary {
    param([AllowNull()][object]$PlatformDetail)
    $attributes = ConvertTo-Array (Get-PropertyValue -InputObject $PlatformDetail -Name 'attributes')
    return @($attributes | ForEach-Object {
        [ordered]@{
            category_id = Get-PropertyValue -InputObject $_ -Name 'attribute_category_id'
            category_name = Get-PropertyValue -InputObject $_ -Name 'attribute_category_name'
            attribute_id = Get-PropertyValue -InputObject $_ -Name 'attribute_id'
            attribute_name = Get-PropertyValue -InputObject $_ -Name 'attribute_name'
        }
    })
}

function Get-ReviewFlags {
    param([object[]]$Attributes)
    $names = @($Attributes | ForEach-Object { [string]$_.attribute_name })
    return [ordered]@{
        mode_attribute_candidates = @($names | Where-Object { $_ -match '(?i)coop|co-operative|multiplayer|online|lan|split' })
        count_attribute_candidates = @($names | Where-Object { $_ -match '(?i)\b\d+\s*(-|to)\s*\d+\b|\b\d+\s+players?\b|players?' })
        six_player_text_candidates = @($names | Where-Object { $_ -match '(?i)(^|\D)6(\D|$)' })
        four_player_text_candidates = @($names | Where-Object { $_ -match '(?i)(^|\D)4(\D|$)' })
        explicit_same_attribute_binding = $false
        requires_manual_capability_review = $true
        warning = 'Attribute names are review evidence only; do not cross-combine free-text mode and count attributes without explicit provider semantics.'
    }
}

function New-SanitizedMobyGame {
    param([Parameter(Mandatory = $true)][object]$Game, [object[]]$PlatformDetails)
    return [ordered]@{
        game_id = Get-PropertyValue -InputObject $Game -Name 'game_id'
        title = Get-PropertyValue -InputObject $Game -Name 'title'
        genres = @((ConvertTo-Array (Get-PropertyValue -InputObject $Game -Name 'genres')) | ForEach-Object {
            [ordered]@{ id = Get-PropertyValue -InputObject $_ -Name 'genre_id'; name = Get-PropertyValue -InputObject $_ -Name 'genre_name' }
        })
        platforms = @((ConvertTo-Array (Get-PropertyValue -InputObject $Game -Name 'platforms')) | ForEach-Object {
            [ordered]@{ id = Get-PropertyValue -InputObject $_ -Name 'platform_id'; name = Get-PropertyValue -InputObject $_ -Name 'platform_name' }
        })
        platform_details = @($PlatformDetails)
        evidence_policy = 'Selected DTO fields only; no raw response, API key, headers, or inferred capability is retained.'
    }
}

function Get-SteamObservation {
    param([Parameter(Mandatory = $true)][int]$AppId, [AllowNull()][string]$ApiKey)
    $pairs = @('appid=' + $AppId)
    if (-not [string]::IsNullOrWhiteSpace($ApiKey)) { $pairs += 'key=' + [Uri]::EscapeDataString($ApiKey) }
    $uri = $script:SteamCurrentPlayersEndpoint + '?' + ($pairs -join '&')
    try {
        $response = Invoke-RestMethod -Uri $uri -Method Get -Headers @{ Accept = 'application/json' }
        $result = Get-PropertyValue -InputObject $response -Name 'response'
        $count = Get-PropertyValue -InputObject $result -Name 'player_count'
        return [ordered]@{ app_id = $AppId; request_status = 'success'; player_count = if ($null -eq $count) { $null } else { [int]$count }; observed_at = [DateTime]::UtcNow.ToString('o'); capacity_binding = 'none' }
    }
    catch {
        $status = Get-HttpStatusCode -ErrorRecord $_
        return [ordered]@{ app_id = $AppId; request_status = if ($null -eq $status) { 'network_error' } else { "http_$status" }; player_count = $null; observed_at = [DateTime]::UtcNow.ToString('o'); capacity_binding = 'none' }
    }
}

$requestedMobyGameIds = @(ConvertTo-PositiveIdList -Value $MobyGameIds -Name 'MobyGameIds')
$requestedMobyPlatformIds = @(ConvertTo-PositiveIdList -Value $MobyPlatformIds -Name 'MobyPlatformIds')
$requestedSteamAppIds = @(ConvertTo-PositiveIdList -Value $SteamAppIds -Name 'SteamAppIds')

if ($requestedMobyGameIds.Count -gt $Limit -or $requestedMobyPlatformIds.Count -gt $Limit -or $requestedSteamAppIds.Count -gt $Limit) {
    [Console]::Error.WriteLine("Each explicit ID list must contain no more than Limit ($Limit) unique IDs.")
    exit 1
}

if ($DryRun) {
    [ordered]@{
        dry_run = $true
        mobygames = [ordered]@{ base_uri = $MobyBaseUri.TrimEnd('/'); api_key_environment = $script:MobyApiKeyEnvironmentName; api_key_echoed = $false; limit = $Limit; game_ids = $requestedMobyGameIds; platform_ids = $requestedMobyPlatformIds; planned_endpoints = @('/games/{game_id}', '/games/{game_id}/platforms/{platform_id}') }
        steam = [ordered]@{ endpoint = $script:SteamCurrentPlayersEndpoint; api_key_environment = $script:SteamApiKeyEnvironmentName; api_key_optional = $true; app_ids = $requestedSteamAppIds; current_players_are_capacity = $false }
        raw_responses_persisted = $false
    } | ConvertTo-Json -Depth 10
    exit 0
}

$hasMobyGameIds = $requestedMobyGameIds.Count -gt 0
$hasMobyPlatformIds = $requestedMobyPlatformIds.Count -gt 0
if ($hasMobyGameIds -ne $hasMobyPlatformIds) { [Console]::Error.WriteLine('MobyGames validation requires both explicit MobyGameIds and MobyPlatformIds. Do not use title matching or guessed platform associations.'); exit 1 }
if (-not $hasMobyGameIds -and $requestedSteamAppIds.Count -eq 0) { [Console]::Error.WriteLine('Provide explicit MobyGames game/platform IDs, explicit Steam AppIDs, or use DryRun.'); exit 1 }
$mobyApiKey = $null
if ($hasMobyGameIds) {
    $mobyApiKey = [Environment]::GetEnvironmentVariable($script:MobyApiKeyEnvironmentName)
    if ([string]::IsNullOrWhiteSpace($mobyApiKey)) { [Console]::Error.WriteLine('MobyGames validation requires MOBYGAMES_API_KEY. The key is read at runtime and is never printed or persisted.'); exit 2 }
}
$steamApiKey = [Environment]::GetEnvironmentVariable($script:SteamApiKeyEnvironmentName)
$sanitizedGames = @()
$mobyErrors = @()

foreach ($gameId in $requestedMobyGameIds) {
    try {
        $game = Invoke-MobyJson -Path ("games/{0}" -f $gameId) -ApiKey $mobyApiKey
        $details = @()
        foreach ($platformId in $requestedMobyPlatformIds) {
            try {
                $detail = Invoke-MobyJson -Path ("games/{0}/platforms/{1}" -f $gameId, $platformId) -ApiKey $mobyApiKey
                $attributes = Get-AttributeSummary -PlatformDetail $detail
                $details += [ordered]@{ platform_id = $platformId; attributes = $attributes; review = Get-ReviewFlags -Attributes $attributes }
            }
            catch { $details += [ordered]@{ platform_id = $platformId; error = 'platform_detail_unavailable' } }
        }
        $sanitizedGames += New-SanitizedMobyGame -Game $game -PlatformDetails $details
    }
    catch { $mobyErrors += [ordered]@{ game_id = $gameId; error = $_.Exception.Message } }
}

$steamObservations = @($requestedSteamAppIds | ForEach-Object { Get-SteamObservation -AppId $_ -ApiKey $steamApiKey })
$report = [ordered]@{
    schema_version = 1
    checked_at_utc = [DateTime]::UtcNow.ToString('o')
    provider_decision = 'MobyGames primary catalog; Steam bounded enrichment'
    mobygames = [ordered]@{ games = $sanitizedGames; errors = $mobyErrors }
    steam = [ordered]@{ observations = $steamObservations; current_players_are_capacity = $false }
    acceptance = [ordered]@{ six_player_online_coop_verified = $false; four_player_counterexample_verified = $false; requires_manual_binding_review = $true; terms_and_retention_verified = $false }
}

if (-not [string]::IsNullOrWhiteSpace($OutputPath)) {
    $resolved = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
    $parent = Split-Path -Parent $resolved
    if (-not [string]::IsNullOrWhiteSpace($parent) -and -not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    $report | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $resolved -Encoding UTF8
    Write-Host "Sanitized report written to: $resolved"
}

Write-Host "MobyGames records inspected: $($sanitizedGames.Count)"
Write-Host "Steam observations inspected: $($steamObservations.Count)"
Write-Host 'Capability acceptance: blocked pending explicit same-platform binding review and current provider terms.'
exit 0
