Add-Type -AssemblyName System.Drawing

$logoPath = "c:\Users\Lenovo\Desktop\HydroTrack\logo.png"
$resDir = "c:\Users\Lenovo\Desktop\HydroTrack\android\app\src\main\res"

if (-not (Test-Path $logoPath)) {
    Write-Host "Logo not found at $logoPath"
    exit 1
}

$src = [System.Drawing.Image]::FromFile($logoPath)

function Resize-Image($w, $h, $destPath) {
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($src, 0, 0, $w, $h)
    
    $dir = [System.IO.Path]::GetDirectoryName($destPath)
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir | Out-Null
    }
    
    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Updated: $destPath"
}

function Resize-Foreground($canvasSize, $destPath) {
    $bmp = New-Object System.Drawing.Bitmap($canvasSize, $canvasSize)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    
    $logoSize = [int]($canvasSize * 0.68)
    $offset = [int](($canvasSize - $logoSize) / 2)
    $g.DrawImage($src, $offset, $offset, $logoSize, $logoSize)
    
    $dir = [System.IO.Path]::GetDirectoryName($destPath)
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir | Out-Null
    }
    
    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Updated Foreground: $destPath"
}

# Mipmap launcher icons
$launcherSizes = @(
    @{folder="mipmap-mdpi"; size=48},
    @{folder="mipmap-hdpi"; size=72},
    @{folder="mipmap-xhdpi"; size=96},
    @{folder="mipmap-xxhdpi"; size=144},
    @{folder="mipmap-xxxhdpi"; size=192}
)

foreach ($item in $launcherSizes) {
    $targetDir = "$resDir\$($item.folder)"
    Resize-Image $item.size $item.size "$targetDir\ic_launcher.png"
    Resize-Image $item.size $item.size "$targetDir\ic_launcher_round.png"
}

# Mipmap foreground icons centered for adaptive icons
$fgSizes = @(
    @{folder="mipmap-mdpi"; size=108},
    @{folder="mipmap-hdpi"; size=162},
    @{folder="mipmap-xhdpi"; size=216},
    @{folder="mipmap-xxhdpi"; size=324},
    @{folder="mipmap-xxxhdpi"; size=432}
)

foreach ($item in $fgSizes) {
    $targetDir = "$resDir\$($item.folder)"
    Resize-Foreground $item.size "$targetDir\ic_launcher_foreground.png"
}

# Splash drawables
Resize-Image 512 512 "$resDir\drawable\splash.png"
Resize-Image 512 512 "$resDir\drawable-v24\splash.png"

$splashPortFolders = @("drawable-port-hdpi", "drawable-port-mdpi", "drawable-port-xhdpi", "drawable-port-xxhdpi", "drawable-port-xxxhdpi")
foreach ($f in $splashPortFolders) {
    Resize-Image 480 800 "$resDir\$f\splash.png"
}

$splashLandFolders = @("drawable-land-hdpi", "drawable-land-mdpi", "drawable-land-xhdpi", "drawable-land-xxhdpi", "drawable-land-xxxhdpi")
foreach ($f in $splashLandFolders) {
    Resize-Image 800 480 "$resDir\$f\splash.png"
}

$src.Dispose()
Write-Host "All icons successfully updated from logo.png!"
