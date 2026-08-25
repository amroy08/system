$dir = "C:\Users\sumkumar41\Music\complete-school-management-system\report\diagrams"
$files = Get-ChildItem "$dir\*.mmd"
foreach ($f in $files) {
    $out = Join-Path $dir ($f.BaseName + ".png")
    $body = Get-Content $f.FullName -Raw
    try {
        Invoke-WebRequest -Uri "https://kroki.io/mermaid/png" -Method Post -Body $body -ContentType "text/plain" -OutFile $out -TimeoutSec 60
        $size = (Get-Item $out).Length
        Write-Output "OK  $($f.BaseName) -> $size bytes"
    } catch {
        Write-Output "FAIL $($f.BaseName): $($_.Exception.Message)"
    }
}
