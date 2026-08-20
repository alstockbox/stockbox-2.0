$gitDirectory = Join-Path $env:LOCALAPPDATA "StockBox\git\stockbox-2.0.git"

if (Test-Path -LiteralPath $gitDirectory) {
    & git --git-dir="$gitDirectory" --work-tree="$PSScriptRoot" @args
} else {
    & git -C "$PSScriptRoot" @args
}

exit $LASTEXITCODE
